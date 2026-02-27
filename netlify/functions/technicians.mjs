import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "technicians", consistency: "strong" });
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
    if (req.method === "GET") {
      if (id) {
        const tech = await store.get(id, { type: "json" });
        if (!tech) {
          return new Response(JSON.stringify({ error: "Technician not found" }), { status: 404, headers });
        }
        return new Response(JSON.stringify({ id, ...tech }), { status: 200, headers });
      }

      const { blobs } = await store.list();
      const technicians = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) technicians.push({ id: blob.key, ...data });
      }
      technicians.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      return new Response(JSON.stringify(technicians), { status: 200, headers });
    }

    if (req.method === "POST") {
      const body = await req.json();
      const name = String(body.name || "").trim();
      if (!name) {
        return new Response(JSON.stringify({ error: "Technician name is required" }), { status: 400, headers });
      }

      const idNew = `tech_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const tech = {
        name,
        phone: String(body.phone || "").trim(),
        email: String(body.email || "").trim(),
        active: body.active !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON(idNew, tech);
      return new Response(JSON.stringify({ id: idNew, ...tech }), { status: 201, headers });
    }

    if (req.method === "PUT") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Technician id is required" }), { status: 400, headers });
      }
      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return new Response(JSON.stringify({ error: "Technician not found" }), { status: 404, headers });
      }

      const body = await req.json();
      const updated = {
        name: body.name ?? existing.name,
        phone: body.phone ?? existing.phone,
        email: body.email ?? existing.email,
        active: body.active ?? existing.active,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON(id, updated);
      return new Response(JSON.stringify({ id, ...updated }), { status: 200, headers });
    }

    if (req.method === "DELETE") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Technician id is required" }), { status: 400, headers });
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
  path: "/api/technicians",
};
