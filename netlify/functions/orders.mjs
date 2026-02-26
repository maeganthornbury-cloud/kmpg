import { getStore } from "@netlify/blobs";

async function nextSequenceNumber() {
  const sequenceStore = getStore({ name: "document-sequences", consistency: "strong" });
  const counterKey = "main";
  let counter = 999;
  try {
    const existing = await sequenceStore.get(counterKey, { type: "json" });
    if (existing && Number.isFinite(existing.value)) {
      counter = existing.value;
    }
  } catch (e) {
    // first use
  }

  const nextValue = counter + 1;
  await sequenceStore.setJSON(counterKey, { value: nextValue });
  return nextValue;
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

function addDaysISO(iso, days) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function money(n) {
  const num = Number(n ?? 0);
  return num.toFixed(2);
}

function renderCompanyHeader(docTitle) {
  return `
    <div class="row" style="align-items:center;">
      <div style="display:flex; gap:12px; align-items:center;">
        <img src="/good%20logo.jpg" alt="Kentucky Mirror and Plate Glass logo" style="height:62px; width:auto;" />
        <div>
          <h1>Kentucky Mirror and Plate Glass</h1>
          <div class="small">822 W Main St, Louisville KY 40202</div>
          <div class="small">502-583-5541</div>
          <div class="small">info@kymirror.com</div>
        </div>
      </div>
      <div class="box"><b>${escapeHtml(docTitle)}</b></div>
    </div>
  `;
}

function renderItemsTable(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const rows = items
    .map((it, idx) => {
      const qty = it.qty ?? it.quantity ?? "";
      const desc =
        it.description ??
        it.name ??
        [
          it.glassType || it.type,
          it.thickness,
          it.width && it.height ? `${it.width} x ${it.height}` : "",
          it.edgework || it.bevel ? `Edge/Bevel: ${it.edgework || ""} ${it.bevel ? (it.bevelWidth || "") : ""}` : "",
          it.notes,
        ]
          .filter(Boolean)
          .join(" • ");

      const unit = it.unitPrice ?? it.price ?? "";
      const total = it.total ?? it.lineTotal ?? "";

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(desc)}</td>
          <td class="right">${escapeHtml(qty)}</td>
          <td class="right">${unit === "" ? "" : escapeHtml(money(unit))}</td>
          <td class="right">${total === "" ? "" : escapeHtml(money(total))}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>Description</th>
          <th style="width:70px;">Qty</th>
          <th style="width:90px;">Unit</th>
          <th style="width:90px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="5">No line items</td></tr>`}
      </tbody>
    </table>
  `;
}

function renderTotals(order) {
  // Stored totals: grandTotal (subtotal) and grandTotalWithTax (total with tax).
  const subtotal = order.grandTotal ?? 0;
  const total = order.grandTotalWithTax ?? order.grandTotal ?? 0;
  const tax = Math.max(0, Number(total) - Number(subtotal));

  return `
    <table class="totals">
      <tr><td>Subtotal</td><td class="right">${escapeHtml(money(subtotal))}</td></tr>
      <tr><td>Tax</td><td class="right">${escapeHtml(money(tax))}</td></tr>
      <tr><td><b>Total</b></td><td class="right"><b>${escapeHtml(money(total))}</b></td></tr>
    </table>
  `;
}

function baseStyles() {
  return `
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; color:#000; }
      h1,h2,h3 { margin: 0; }
      .row { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }
      .box { border:1px solid #000; padding:12px; }
      .small { font-size:12px; }
      table { width:100%; border-collapse:collapse; margin-top:12px; }
      th, td { border:1px solid #000; padding:8px; font-size:12px; vertical-align:top; }
      .right { text-align:right; }
      .totals { width: 320px; margin-left:auto; margin-top:12px; }
      .signature { margin-top:28px; display:flex; gap:24px; }
      .sigline { flex:1; border-top:1px solid #000; padding-top:6px; min-height:24px; }
      @page { margin: 14mm; }
    </style>
  `;
}

function renderQuoteHTML(order) {
  const savedISO = order.createdAt || new Date().toISOString();
  const validThroughISO = addDaysISO(savedISO, 30);

  const cust = order.customer || {};
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quote ${escapeHtml(order.orderNumber || "")}</title>
  ${baseStyles()}
</head>
<body>
  ${renderCompanyHeader("QUOTE")}
  <div class="row" style="margin-top:12px;">
    <div></div>
    <div class="box">
      <div>Quote #: <b>${escapeHtml(order.orderNumber || "")}</b></div>
      <div>Date Saved: ${escapeHtml(fmtDate(savedISO))}</div>
      <div>Valid Through: <b>${escapeHtml(fmtDate(validThroughISO))}</b></div>
    </div>
  </div>

  <div class="row" style="margin-top:12px;">
    <div class="box" style="flex:1;">
      <b>Customer</b><br/>
      ${escapeHtml(cust.name || "")}<br/>
      ${escapeHtml(cust.company || "")}<br/>
      ${escapeHtml(cust.phone || "")}<br/>
      ${escapeHtml(cust.email || "")}<br/>
      ${escapeHtml(cust.address || "")}
    </div>
    <div class="box" style="flex:1;">
      <b>Notes</b><br/>
      ${escapeHtml(order.notes || "")}
    </div>
  </div>

  ${renderItemsTable(order)}
  ${renderTotals(order)}

  <p class="small" style="margin-top:12px;">
    This quote is good for <b>30 days</b> from <b>${escapeHtml(fmtDate(savedISO))}</b>.
  </p>

  <div class="signature">
    <div style="flex:2;">
      <div class="sigline">Customer Signature</div>
    </div>
    <div style="flex:1;">
      <div class="sigline">Date</div>
    </div>
  </div>
</body>
</html>`;
}

function renderTicketHTML(order) {
  const savedISO = order.createdAt || new Date().toISOString();
  const cust = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];

  // Ticket focuses on "make the glass". We print everything, but emphasize size/type fields if present.
  const rows = items
    .map((it, idx) => {
      const qty = it.qty ?? it.quantity ?? "";
      const size =
        it.width && it.height ? `${it.width} x ${it.height}` : (it.size || "");
      const glass = it.glassType || it.type || "";
      const thk = it.thickness || it.thk || "";
      const edge = it.edgework || (it.bevel ? `Bevel ${it.bevelWidth || ""}` : "") || "";
      const temper = it.tempered ? "YES" : (it.temp ? "YES" : "");
      const notes = it.notes || it.instructions || it.descNotes || it.description || "";

      return `
        <tr>
          <td>${idx + 1}</td>
          <td class="right"><b>${escapeHtml(qty)}</b></td>
          <td><b>${escapeHtml(size)}</b></td>
          <td>${escapeHtml(glass)}</td>
          <td>${escapeHtml(thk)}</td>
          <td>${escapeHtml(edge)}</td>
          <td class="right">${escapeHtml(temper)}</td>
          <td>${escapeHtml(notes)}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Shop Ticket ${escapeHtml(order.orderNumber || "")}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { margin:0; }
    .meta { margin-top:8px; font-size:13px; }
    table { width:100%; border-collapse:collapse; margin-top:12px; }
    th, td { border:2px solid #000; padding:10px; font-size:13px; vertical-align:top; }
    th { font-size:12px; }
    .notes { margin-top:12px; border:2px solid #000; padding:10px; min-height:80px; }
    @page { margin: 12mm; }
  </style>
</head>
<body>
  ${renderCompanyHeader("SHOP TICKET")}
  <div class="meta">
    Order #: <b>${escapeHtml(order.orderNumber || "")}</b> &nbsp; | &nbsp;
    Date Saved: ${escapeHtml(fmtDate(savedISO))} &nbsp; | &nbsp;
    Customer: ${escapeHtml(cust.name || cust.company || "")}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th style="width:70px;">Qty</th>
        <th style="width:140px;">Size</th>
        <th style="width:140px;">Glass</th>
        <th style="width:70px;">Thk</th>
        <th style="width:140px;">Edge/Bevel</th>
        <th style="width:70px;">Temp</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="8">No line items</td></tr>`}
    </tbody>
  </table>

  <div class="notes">
    <b>Shop Notes:</b><br/>
    ${escapeHtml(order.shopNotes || order.notes || "")}
  </div>
</body>
</html>`;
}

function renderPackingListHTML(order) {
  const savedISO = order.createdAt || new Date().toISOString();
  const cust = order.customer || {};
  const items = Array.isArray(order.items) ? order.items : [];

  const rows = items
    .map((it, idx) => {
      const qty = it.qty ?? it.quantity ?? "";
      const size = it.width && it.height ? `${it.width} x ${it.height}` : (it.size || "");
      const glass = it.glassType || it.type || "";
      const notes = it.notes || it.instructions || "";

      return `
        <tr>
          <td>${idx + 1}</td>
          <td class="right">${escapeHtml(qty)}</td>
          <td>${escapeHtml(size)}</td>
          <td>${escapeHtml(glass)}</td>
          <td>${escapeHtml(notes)}</td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Packing List ${escapeHtml(order.orderNumber || "")}</title>
  ${baseStyles()}
</head>
<body>
  ${renderCompanyHeader("PACKING LIST")}
  <div class="meta" style="margin-top:10px;font-size:13px;">
    Order #: <b>${escapeHtml(order.orderNumber || "")}</b> &nbsp; | &nbsp;
    Order Date: ${escapeHtml(fmtDate(savedISO))} &nbsp; | &nbsp;
    Customer: ${escapeHtml(cust.name || cust.company || "")} &nbsp; | &nbsp;
    Source: <b>${escapeHtml(order.status === "vendor" ? "Vendor" : "Shop")}</b>
    ${order.status === "vendor" ? ` &nbsp; | &nbsp; Vendor: <b>${escapeHtml(order.vendorName || "")}</b> &nbsp; | &nbsp; PO #: <b>${escapeHtml(order.vendorPoNumber || "")}</b>` : ""}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px;">#</th>
        <th style="width:80px;">Qty</th>
        <th style="width:180px;">Size</th>
        <th style="width:220px;">Glass Type</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="5">No line items</td></tr>`}
    </tbody>
  </table>

  ${renderTotals(order)}
</body>
</html>`;
}


function renderPurchaseOrderHTML(order) {
  const requestedDate = order.requestedDate || order.createdAt || new Date().toISOString();
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Purchase Order ${escapeHtml(order.orderNumber || "")}</title>
  ${baseStyles()}
</head>
<body>
  ${renderCompanyHeader("PURCHASE ORDER")}
  <div class="row" style="margin-top:12px;">
    <div class="box" style="flex:1;">
      <b>Vendor</b><br/>
      ${escapeHtml(order.vendorName || "")}
    </div>
    <div class="box" style="flex:1;">
      <div>Order #: <b>${escapeHtml(order.orderNumber || "")}</b></div>
      <div>PO #: <b>${escapeHtml(order.vendorPoNumber || "")}</b></div>
      <div>Requested Date: <b>${escapeHtml(fmtDate(requestedDate))}</b></div>
      <div>Order Date: ${escapeHtml(fmtDate(order.createdAt))}</div>
    </div>
  </div>
  ${renderItemsTable(order)}
  ${renderTotals(order)}
</body>
</html>`;
}

function renderInvoiceHTML(order) {
  const invoiceDateISO = order.invoiceDate || order.createdAt || new Date().toISOString();
  const cust = order.customer || {};
  const invoiceNumber = order.sequenceNumber ? `i${order.sequenceNumber}` : (order.orderNumber || "").replace(/^o/i, "i");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${escapeHtml(order.orderNumber || "")}</title>
  ${baseStyles()}
</head>
<body>
  ${renderCompanyHeader("INVOICE")}
  <div class="row" style="margin-top:12px;">
    <div></div>
    <div class="box">
      <div><b>INVOICE</b></div>
      <div>Invoice #: <b>${escapeHtml(invoiceNumber)}</b></div>
      <div>Invoice Date: ${escapeHtml(fmtDate(invoiceDateISO))}</div>
      <div>Order Date: ${escapeHtml(fmtDate(order.createdAt))}</div>
    </div>
  </div>

  <div class="box" style="margin-top:12px;">
    <b>Bill To</b><br/>
    ${escapeHtml(cust.name || "")}<br/>
    ${escapeHtml(cust.company || "")}<br/>
    ${escapeHtml(cust.phone || "")}<br/>
    ${escapeHtml(cust.email || "")}<br/>
    ${escapeHtml(cust.address || "")}
  </div>

  ${renderItemsTable(order)}
  ${renderTotals(order)}

  <p class="small" style="margin-top:12px;">
    Terms: ${escapeHtml(order.terms || "Due upon receipt")}<br/>
    Thank you for your business.
  </p>
</body>
</html>`;
}

export default async (req) => {
  const store = getStore({ name: "orders", consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const search = url.searchParams.get("search");
  const print = url.searchParams.get("print"); // quote | ticket | packing-list | invoice

  const jsonHeaders = {
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
    return new Response(null, { status: 204, headers: jsonHeaders });
  }

  try {
    // GET — list all orders, get by id, search, or print
    if (req.method === "GET") {
      if (id) {
        const order = await store.get(id, { type: "json" });
        if (!order) {
          return new Response(JSON.stringify({ error: "Order not found" }), {
            status: 404,
            headers: jsonHeaders,
          });
        }

        // NEW: Print outputs
        if (print) {
          const p = String(print).toLowerCase();
          let html = "";
          if (p === "quote") html = renderQuoteHTML(order);
          else if (p === "ticket") html = renderTicketHTML(order);
          else if (p === "packing-list" || p === "packinglist") html = renderPackingListHTML(order);
          else if (p === "invoice") html = renderInvoiceHTML(order);
          else if (p === "purchase-order" || p === "purchaseorder" || p === "po") html = renderPurchaseOrderHTML(order);
          else {
            return new Response(JSON.stringify({ error: "Invalid print type" }), {
              status: 400,
              headers: jsonHeaders,
            });
          }
          return new Response(html, { status: 200, headers: htmlHeaders });
        }

        // Existing: return JSON by id
        return new Response(JSON.stringify({ id, ...order }), {
          status: 200,
          headers: jsonHeaders,
        });
      }

      // List all orders
      const { blobs } = await store.list();
      const orders = [];
      for (const blob of blobs) {
        if (blob.key === "_counter") continue; // skip counter blob
        const data = await store.get(blob.key, { type: "json" });
        if (data) orders.push({ id: blob.key, ...data });
      }

      // Sort by creation date descending (newest first)
      orders.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const filtered = orders.filter(
          (o) =>
            (o.orderNumber || "").toLowerCase().includes(q) ||
            (o.customer?.name || "").toLowerCase().includes(q)
        );
        return new Response(JSON.stringify(filtered), { status: 200, headers: jsonHeaders });
      }

      return new Response(JSON.stringify(orders), { status: 200, headers: jsonHeaders });
    }

    // POST — create a new order with auto-assigned order number
    if (req.method === "POST") {
      const body = await req.json();
      const sequenceNumber = Number(body.sequenceNumber) || (await nextSequenceNumber());
      const orderNumber = `o${sequenceNumber}`;
      const newId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      const nowISO = new Date().toISOString();

      const order = {
        sequenceNumber,
        orderNumber,
        status: body.status || "shop production",
        vendorName: body.vendorName || "",
        vendorPoNumber: body.vendorPoNumber || "",
        requestedDate: body.requestedDate || "",
        vendorDeliveryDate: body.vendorDeliveryDate || "",
        vendorReceivedAt: body.vendorReceivedAt || "",
        customer: body.customer || {},
        items: body.items || [],
        hardware: body.hardware || null,
        specialPricing: body.specialPricing || false,
        grandTotal: body.grandTotal || 0,
        grandTotalWithTax: body.grandTotalWithTax || 0,
        createdAt: nowISO,        // date saved (used for quote 30-day rule)
        invoiceDate: body.invoiceDate || null, // optional, set later if/when invoiced
      };

      await store.setJSON(newId, order);

      return new Response(JSON.stringify({ id: newId, ...order }), {
        status: 201,
        headers: jsonHeaders,
      });
    }

    // PUT — update order details (e.g. status)
    if (req.method === "PUT") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Order id is required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return new Response(JSON.stringify({ error: "Order not found" }), {
          status: 404,
          headers: jsonHeaders,
        });
      }

      const body = await req.json();
      const sequenceNumber = Number(body.sequenceNumber) || Number(existing.sequenceNumber) || null;
      const updatedOrder = {
        ...existing,
        ...body,
        sequenceNumber,
        orderNumber: sequenceNumber ? `o${sequenceNumber}` : existing.orderNumber,
        status: body.status || existing.status || "shop production",
        updatedAt: new Date().toISOString(),
      };

      await store.setJSON(id, updatedOrder);

      return new Response(JSON.stringify({ id, ...updatedOrder }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    // DELETE an order
    if (req.method === "DELETE") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Order id is required" }), {
          status: 400,
          headers: jsonHeaders,
        });
      }

      await store.delete(id);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: jsonHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
};

export const config = {
  path: "/api/orders",
};
