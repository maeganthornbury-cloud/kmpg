import { getStore } from "@netlify/blobs";


function normalizeStringsUpper(value) {
  if (Array.isArray(value)) return value.map(normalizeStringsUpper);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeStringsUpper(v);
    return out;
  }
  return typeof value === "string" ? value.toUpperCase() : value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function renderPoPrint(po) {
  const items = Array.isArray(po.items) ? po.items : [];
  const rows = items.map((it, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>${escapeHtml(it.description || it.name || "")}</td>
      <td style="text-align:right;">${escapeHtml(it.qty ?? "")}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" /><title>${String(po.poType || "").toLowerCase() === "internal" ? "Internal PO" : "Purchase Order"} ${escapeHtml(po.poNumber || "")}</title>
<style>
body { font-family: Arial, sans-serif; margin: 24px; color:#000; }
.small { font-size:12px; }
.row { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
.box { border:1px solid #000; padding:12px; }
table { width:100%; border-collapse:collapse; margin-top:12px; }
th, td { border:1px solid #000; padding:8px; font-size:12px; vertical-align:top; }
</style></head><body>
<div class="row" style="align-items:center;">
  <div style="display:flex; gap:12px; align-items:center;">
    <img src="/good%20logo.jpg" alt="Kentucky Mirror and Plate Glass logo" style="height:62px; width:auto;" />
    <div>
      <div class="small">822 W Main St, Louisville KY 40202</div>
      <div class="small">502-583-5541</div>
      <div class="small">info@kymirror.com</div>
    </div>
  </div>
  <div class="box"><b>${String(po.poType || "").toLowerCase() === "internal" ? "INTERNAL PO" : "PURCHASE ORDER"}</b></div>
</div>
<div class="row" style="margin-top:12px;">
  <div class="box" style="flex:1;">
    <b>Vendor</b><br/>${escapeHtml(po.vendor || "")}
  </div>
  <div class="box" style="flex:1;">
    <div>Order #: <b>${escapeHtml(po.orderNumber || "")}</b></div>
    <div>PO #: <b>${escapeHtml(po.poNumber || "")}</b></div>
    <div>Requested Date: <b>${escapeHtml(fmtDate(po.requestedDate))}</b></div>
    <div>Order Date: ${escapeHtml(fmtDate(po.dateOrdered))}</div>
  </div>
</div>
<table>
  <thead><tr><th style="width:40px;">#</th><th>Description</th><th style="width:70px;">Qty</th></tr></thead>
  <tbody>${rows || '<tr><td colspan="3">No line items</td></tr>'}</tbody>
</table>
</body></html>`;
}

export default async (req) => {
  const store = getStore({ name: "purchase-orders", consistency: "strong" });
  const ordersStore = getStore({ name: "orders", consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const print = url.searchParams.get("print");

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  const htmlHeaders = {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  const mappedOrderStatus = (poType, poStatus) => {
    const type = String(poType || "external").toLowerCase();
    const status = String(poStatus || "pending").toLowerCase();
    if (type === "internal") {
      if (status === "completed by shop") return "completed";
      return "shop production";
    }
    if (status === "received") return "received (vendor)";
    return "on order (vendor)";
  };

  try {
    // GET - list all or get one
    if (req.method === "GET") {
      if (id) {
        const po = await store.get(id, { type: "json" });
        if (!po) {
          return new Response(JSON.stringify({ error: "Purchase order not found" }), {
            status: 404,
            headers,
          });
        }
        if (print) {
          return new Response(renderPoPrint(po), { status: 200, headers: htmlHeaders });
        }
        return new Response(JSON.stringify(po), { headers });
      }

      // List all purchase orders
      const { blobs } = await store.list();
      const orders = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) orders.push(data);
      }
      // Sort by creation date descending
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return new Response(JSON.stringify(orders), { headers });
    }

    // POST - create a new purchase order
    if (req.method === "POST") {
      const body = normalizeStringsUpper(await req.json());
      const poId = `po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const order = {
        id: poId,
        orderId: body.orderId || "",
        orderNumber: body.orderNumber || "",
        dateOrdered: body.dateOrdered || "",
        requestedDate: body.requestedDate || body.dateOrdered || "",
        poNumber: body.poNumber || "",
        vendor: body.vendor || "",
        poType: body.poType || "external",
        deliveryDate: body.deliveryDate || "",
        receivedAt: body.receivedAt || "",
        status: body.status || "Pending",
        syncToOrder: body.syncToOrder !== false,
        items: Array.isArray(body.items) ? body.items : [],
        createdAt: new Date().toISOString(),
      };
      await store.setJSON(poId, order);

      if (order.syncToOrder !== false && order.orderId) {
        const linkedOrder = await ordersStore.get(order.orderId, { type: "json" });
        if (linkedOrder) {
          await ordersStore.setJSON(order.orderId, {
            ...linkedOrder,
            status: mappedOrderStatus(order.poType, order.status),
            vendorName: order.vendor,
            vendorPoNumber: order.poNumber,
            requestedDate: order.requestedDate,
            vendorDeliveryDate: order.deliveryDate,
            vendorReceivedAt: order.receivedAt,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      return new Response(JSON.stringify(order), { status: 201, headers });
    }

    // PUT - update a purchase order
    if (req.method === "PUT") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
          status: 400,
          headers,
        });
      }
      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return new Response(JSON.stringify({ error: "Purchase order not found" }), {
          status: 404,
          headers,
        });
      }
      const body = normalizeStringsUpper(await req.json());
      const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
      await store.setJSON(id, updated);

      if (updated.syncToOrder !== false && updated.orderId) {
        const linkedOrder = await ordersStore.get(updated.orderId, { type: "json" });
        if (linkedOrder) {
          await ordersStore.setJSON(updated.orderId, {
            ...linkedOrder,
            status: mappedOrderStatus(updated.poType, updated.status),
            vendorName: updated.vendor || linkedOrder.vendorName || "",
            vendorPoNumber: updated.poNumber || linkedOrder.vendorPoNumber || "",
            requestedDate: updated.requestedDate || linkedOrder.requestedDate || "",
            vendorDeliveryDate: updated.deliveryDate || linkedOrder.vendorDeliveryDate || "",
            vendorReceivedAt: updated.receivedAt || linkedOrder.vendorReceivedAt || "",
            updatedAt: new Date().toISOString(),
          });
        }
      }

      return new Response(JSON.stringify(updated), { headers });
    }

    // DELETE - remove a purchase order
    if (req.method === "DELETE") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
          status: 400,
          headers,
        });
      }
      await store.delete(id);
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    });
  }
};

export const config = {
  path: "/api/purchase-orders",
};
