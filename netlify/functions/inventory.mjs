import { getStore } from "@netlify/blobs";

const STORE_NAME = "hardware-inventory";
const KEY = "inventory";

function normalizePartName(value) {
  return String(value || "").trim().toUpperCase();
}

function toSafeQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function sanitizeInventoryMap(raw = {}) {
  const out = {};
  for (const [name, value] of Object.entries(raw || {})) {
    const partName = normalizePartName(name);
    if (!partName) continue;
    out[partName] = {
      trackInventory: !!value?.trackInventory,
      qtyOnHand: toSafeQty(value?.qtyOnHand),
      updatedAt: value?.updatedAt || null,
    };
  }
  return out;
}

async function readInventoryBlob(store) {
  const blob = await store.get(KEY, { type: "json" });
  return {
    inventory: sanitizeInventoryMap(blob?.inventory || {}),
    orderAllocations: blob?.orderAllocations && typeof blob.orderAllocations === "object" ? blob.orderAllocations : {},
  };
}

function getAllocationForOrder(orderAllocations, orderId) {
  if (!orderId) return {};
  const alloc = orderAllocations[orderId];
  return alloc && typeof alloc === "object" ? alloc : {};
}


async function syncGoogleSheet(webhookUrl, payload) {
  const attempts = [
    {
      label: "json-post",
      url: webhookUrl,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    },
    {
      label: "form-post",
      url: webhookUrl,
      options: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({
          action: String(payload.action || ""),
          orderId: String(payload.orderId || ""),
          items: JSON.stringify(Array.isArray(payload.items) ? payload.items : []),
          sentAt: String(payload.sentAt || ""),
        }).toString(),
      },
    },
    {
      label: "get-query",
      url: `${webhookUrl}${webhookUrl.includes("?") ? "&" : "?"}${new URLSearchParams({
        action: String(payload.action || ""),
        orderId: String(payload.orderId || ""),
        items: JSON.stringify(Array.isArray(payload.items) ? payload.items : []),
        sentAt: String(payload.sentAt || ""),
      }).toString()}`,
      options: {
        method: "GET",
      },
    },
  ];

  let lastError = "Inventory sync webhook failed.";
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, attempt.options);
      const text = await response.text();
      if (!response.ok) {
        lastError = `Google Sheet sync failed via ${attempt.label} (${response.status}): ${text.slice(0, 300)}`;
        continue;
      }
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch {}
      if (parsed && parsed.ok === false) {
        lastError = `Google Sheet sync failed via ${attempt.label}: ${parsed.error || text || 'Unknown Apps Script error.'}`;
        continue;
      }
      return { ok: true, method: attempt.label, upstream: parsed || text || null };
    } catch (err) {
      lastError = `Google Sheet sync failed via ${attempt.label}: ${err?.message || err}`;
    }
  }
  return { ok: false, error: lastError };
}

function normalizeDesiredParts(parts = []) {
  const totals = {};
  for (const p of Array.isArray(parts) ? parts : []) {
    const partName = normalizePartName(p?.name || p?.part || p?.description);
    const qty = toSafeQty(p?.qty || p?.quantity);
    if (!partName || qty <= 0) continue;
    totals[partName] = (totals[partName] || 0) + qty;
  }
  return totals;
}

export default async (req) => {
  const store = getStore({ name: STORE_NAME, consistency: "strong" });

  try {
    if (req.method === "GET") {
      const blob = await readInventoryBlob(store);
      return Response.json({ inventory: blob.inventory });
    }

    if (req.method === "PUT") {
      const body = await req.json();
      const partName = normalizePartName(body?.partName);
      if (!partName) return Response.json({ error: "partName required" }, { status: 400 });

      const blob = await readInventoryBlob(store);
      blob.inventory[partName] = {
        trackInventory: !!body?.trackInventory,
        qtyOnHand: toSafeQty(body?.qtyOnHand),
        updatedAt: new Date().toISOString(),
      };

      await store.setJSON(KEY, blob);
      return Response.json({ ok: true, item: blob.inventory[partName] });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const action = String(body?.action || "").toLowerCase();

      if (action === "sync-google-sheet") {
        const webhookUrl = String(body?.webhookUrl || "").trim();
        if (!webhookUrl) return Response.json({ error: "webhookUrl required" }, { status: 400 });

        const result = await syncGoogleSheet(webhookUrl, {
          action: "deduct_inventory",
          orderId: String(body?.orderId || "").trim(),
          items: Array.isArray(body?.items) ? body.items : [],
          sentAt: body?.sentAt || new Date().toISOString(),
        });

        if (!result.ok) {
          return Response.json({ error: result.error }, { status: 502 });
        }

        return Response.json(result);
      }

      if (action !== "apply-order") {
        return Response.json({ error: "unsupported action" }, { status: 400 });
      }

      const orderId = String(body?.orderId || "").trim();
      if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });

      const desired = normalizeDesiredParts(body?.parts || []);
      const blob = await readInventoryBlob(store);
      const previous = getAllocationForOrder(blob.orderAllocations, orderId);
      const applied = [];

      const partNames = new Set([...Object.keys(previous), ...Object.keys(desired)]);
      for (const partName of partNames) {
        const item = blob.inventory[partName];
        if (!item || !item.trackInventory) continue;

        const prevQty = toSafeQty(previous[partName]);
        const nextQty = toSafeQty(desired[partName]);
        const delta = nextQty - prevQty;
        if (delta === 0) continue;

        item.qtyOnHand = Math.max(0, toSafeQty(item.qtyOnHand) - delta);
        item.updatedAt = new Date().toISOString();
        applied.push({ partName, delta, qtyOnHand: item.qtyOnHand });
      }

      const nextAllocation = {};
      for (const [partName, qty] of Object.entries(desired)) {
        const item = blob.inventory[partName];
        if (item?.trackInventory) nextAllocation[partName] = toSafeQty(qty);
      }
      blob.orderAllocations[orderId] = nextAllocation;

      await store.setJSON(KEY, blob);
      return Response.json({ ok: true, applied, inventory: blob.inventory });
    }

    return Response.json({ error: "Method Not Allowed" }, { status: 405 });
  } catch (err) {
    return Response.json({ error: err?.message || "server error" }, { status: 500 });
  }
};

export const config = { path: "/api/inventory" };
