import { getStore } from "@netlify/blobs";

async function nextRequestNumber() {
  const seq = getStore({ name: "residential-request-seq", consistency: "strong" });
  const current = await seq.get("main", { type: "json" });
  const value = Number(current?.value || 0) + 1;
  await seq.setJSON("main", { value });
  return `RR-${String(value).padStart(4, "0")}`;
}

export default async (req) => {
  const store = getStore({ name: "residential-requests", consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  try {
    if (req.method === "GET") {
      if (id) {
        const row = await store.get(id, { type: "json" });
        return row ? new Response(JSON.stringify({ id, ...row }), { headers }) : new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
      }
      const { blobs } = await store.list();
      const rows = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) rows.push({ id: blob.key, ...data });
      }
      rows.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return new Response(JSON.stringify(rows), { headers });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (!body.customer?.name) return new Response(JSON.stringify({ error: "Customer name is required" }), { status: 400, headers });
      const newId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const row = {
        requestNumber: await nextRequestNumber(),
        customer: body.customer || {},
        description: body.description || "",
        assignedTech: body.assignedTech || "",
        status: body.status || "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON(newId, row);
      return new Response(JSON.stringify({ id: newId, ...row }), { status: 201, headers });
    }

    if (req.method === "PUT") {
      if (!id) return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers });
      const existing = await store.get(id, { type: "json" });
      if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
      const body = await req.json();
      const updated = { ...existing, ...body, requestNumber: existing.requestNumber, updatedAt: new Date().toISOString() };
      await store.setJSON(id, updated);
      return new Response(JSON.stringify({ id, ...updated }), { headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/residential-requests" };
