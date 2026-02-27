import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "service-requests", consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();

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
    if (req.method === "GET") {
      if (id) {
        const item = await store.get(id, { type: "json" });
        if (!item) {
          return new Response(JSON.stringify({ error: "Service request not found" }), { status: 404, headers });
        }
        return new Response(JSON.stringify({ id, ...item }), { status: 200, headers });
      }

      const { blobs } = await store.list();
      const requests = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) requests.push({ id: blob.key, ...data });
      }

      requests.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      if (search) {
        const filtered = requests.filter((r) =>
          [r.requestNumber, r.assignedTechName, r.description, r.customer?.name, r.customer?.phone, r.customer?.address]
            .join(" ")
            .toLowerCase()
            .includes(search)
        );
        return new Response(JSON.stringify(filtered), { status: 200, headers });
      }

      return new Response(JSON.stringify(requests), { status: 200, headers });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (!body.customer?.name) {
        return new Response(JSON.stringify({ error: "Customer name is required" }), { status: 400, headers });
      }
      if (!String(body.description || "").trim()) {
        return new Response(JSON.stringify({ error: "Description is required" }), { status: 400, headers });
      }
      if (!body.assignedTechId || !body.assignedTechName) {
        return new Response(JSON.stringify({ error: "Assigned technician is required" }), { status: 400, headers });
      }

      const timestamp = Date.now();
      const idNew = `sr_${timestamp}_${Math.random().toString(36).slice(2, 8)}`;
      const request = {
        requestNumber: `RQR-${new Date().getFullYear()}-${String(timestamp).slice(-6)}`,
        customer: {
          id: body.customer.id || null,
          name: String(body.customer.name || "").trim(),
          address: String(body.customer.address || "").trim(),
          email: String(body.customer.email || "").trim(),
          phone: String(body.customer.phone || "").trim(),
          creditTerms: String(body.customer.creditTerms || "").trim(),
        },
        description: String(body.description || "").trim(),
        assignedTechId: body.assignedTechId,
        assignedTechName: body.assignedTechName,
        status: String(body.status || "Requested"),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.setJSON(idNew, request);
      return new Response(JSON.stringify({ id: idNew, ...request }), { status: 201, headers });
    }

    if (req.method === "PUT") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Service request id is required" }), { status: 400, headers });
      }
      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return new Response(JSON.stringify({ error: "Service request not found" }), { status: 404, headers });
      }

      const body = await req.json();
      const updated = {
        ...existing,
        ...body,
        customer: {
          ...(existing.customer || {}),
          ...(body.customer || {}),
        },
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON(id, updated);
      return new Response(JSON.stringify({ id, ...updated }), { status: 200, headers });
    }

    if (req.method === "DELETE") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Service request id is required" }), { status: 400, headers });
      }
      await store.delete(id);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = {
  path: "/api/service-requests",
};
