import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "purchase-orders", consistency: "strong" });
  const ordersStore = getStore({ name: "orders", consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

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
      const body = await req.json();
      const poId = `po-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const order = {
        id: poId,
        orderId: body.orderId || "",
        orderNumber: body.orderNumber || "",
        dateOrdered: body.dateOrdered || "",
        requestedDate: body.requestedDate || body.dateOrdered || "",
        poNumber: body.poNumber || "",
        vendor: body.vendor || "",
        deliveryDate: body.deliveryDate || "",
        receivedAt: body.receivedAt || "",
        status: body.status || "Pending",
        createdAt: new Date().toISOString(),
      };
      await store.setJSON(poId, order);

      if (order.orderId) {
        const linkedOrder = await ordersStore.get(order.orderId, { type: "json" });
        if (linkedOrder) {
          await ordersStore.setJSON(order.orderId, {
            ...linkedOrder,
            status: "vendor",
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
      const body = await req.json();
      const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
      await store.setJSON(id, updated);

      if (updated.orderId) {
        const linkedOrder = await ordersStore.get(updated.orderId, { type: "json" });
        if (linkedOrder) {
          await ordersStore.setJSON(updated.orderId, {
            ...linkedOrder,
            status: updated.status === "Received" ? "vendor received" : "vendor",
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
