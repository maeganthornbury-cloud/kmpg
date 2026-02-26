import { getStore } from "@netlify/blobs";

async function nextInvoiceSequence() {
  const sequenceStore = getStore({ name: "invoice-sequences", consistency: "strong" });
  const key = "main";
  let counter = 999;
  try {
    const existing = await sequenceStore.get(key, { type: "json" });
    if (existing && Number.isFinite(existing.value)) counter = existing.value;
  } catch (e) {
    // first use
  }
  const next = counter + 1;
  await sequenceStore.setJSON(key, { value: next });
  return next;
}

function normalizeStringsUpper(value) {
  if (Array.isArray(value)) return value.map(normalizeStringsUpper);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalizeStringsUpper(v);
    return out;
  }
  return typeof value === "string" ? value.toUpperCase() : value;
}

export default async (req) => {
  const invoicesStore = getStore({ name: "invoices", consistency: "strong" });
  const ordersStore = getStore({ name: "orders", consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    if (req.method === "GET") {
      if (id) {
        const invoice = await invoicesStore.get(id, { type: "json" });
        if (!invoice) return new Response(JSON.stringify({ error: "Invoice not found" }), { status: 404, headers });
        return new Response(JSON.stringify({ id, ...invoice }), { status: 200, headers });
      }
      const { blobs } = await invoicesStore.list();
      const invoices = [];
      for (const blob of blobs) {
        const data = await invoicesStore.get(blob.key, { type: "json" });
        if (data) invoices.push({ id: blob.key, ...data });
      }
      invoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return new Response(JSON.stringify(invoices), { status: 200, headers });
    }

    if (req.method === "POST") {
      const body = normalizeStringsUpper(await req.json());
      const orderId = body.orderId;
      if (!orderId) return new Response(JSON.stringify({ error: "orderId is required" }), { status: 400, headers });

      const order = await ordersStore.get(orderId, { type: "json" });
      if (!order) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers });

      if (order.status === "INVOICED" && order.invoiceNumber) {
        return new Response(JSON.stringify({
          alreadyInvoiced: true,
          orderId,
          invoiceNumber: order.invoiceNumber,
          orderNumber: order.orderNumber,
        }), { status: 200, headers });
      }

      const seq = await nextInvoiceSequence();
      const invoiceNumber = `I${seq}`;
      const now = new Date().toISOString();
      const terms = order.customer?.creditTerms || order.terms || "DUE UPON RECEIPT";

      const invoiceId = `invoice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const invoice = {
        invoiceNumber,
        sequenceNumber: seq,
        orderId,
        orderNumber: order.orderNumber || "",
        status: "INVOICED",
        invoiceDate: now,
        terms,
        customer: order.customer || {},
        vendorName: order.vendorName || "",
        vendorPoNumber: order.vendorPoNumber || "",
        items: order.items || [],
        hardwareItems: order.hardwareItems || [],
        grandTotal: order.grandTotal || 0,
        grandTotalWithTax: order.grandTotalWithTax || 0,
        createdAt: now,
      };

      await invoicesStore.setJSON(invoiceId, invoice);
      await ordersStore.setJSON(orderId, {
        ...order,
        status: "INVOICED",
        invoiceNumber,
        invoiceDate: now,
        terms,
        pickedUpAt: now,
        updatedAt: now,
      });

      return new Response(JSON.stringify({ id: invoiceId, ...invoice }), { status: 201, headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/invoices" };
