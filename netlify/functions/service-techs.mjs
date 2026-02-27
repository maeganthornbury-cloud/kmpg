import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "service-techs", consistency: "strong" });
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
        const item = await store.get(id, { type: "json" });
        return item
          ? new Response(JSON.stringify({ id, ...item }), { headers })
          : new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
      }
      const { blobs } = await store.list();
      const items = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) items.push({ id: blob.key, ...data });
      }
      return new Response(JSON.stringify(items), { headers });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (!body.name) return new Response(JSON.stringify({ error: "Name is required" }), { status: 400, headers });
      const newId = `tech_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const item = { name: body.name || "", phone: body.phone || "", email: body.email || "", createdAt: new Date().toISOString() };
      await store.setJSON(newId, item);
      return new Response(JSON.stringify({ id: newId, ...item }), { status: 201, headers });
    }

    if (req.method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers });
      await store.delete(id);
      return new Response(JSON.stringify({ success: true }), { headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/service-techs" };
