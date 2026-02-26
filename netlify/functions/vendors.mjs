import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "vendors", consistency: "strong" });
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
        const vendor = await store.get(id, { type: "json" });
        if (!vendor) return new Response(JSON.stringify({ error: "Vendor not found" }), { status: 404, headers });
        return new Response(JSON.stringify({ id, ...vendor }), { status: 200, headers });
      }
      const { blobs } = await store.list();
      const vendors = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) vendors.push({ id: blob.key, ...data });
      }
      return new Response(JSON.stringify(vendors), { status: 200, headers });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (!body.name?.trim()) return new Response(JSON.stringify({ error: "Vendor name is required" }), { status: 400, headers });
      const newId = `vendor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const vendor = {
        name: body.name?.trim() || "",
        address: body.address?.trim() || "",
        email: body.email?.trim() || "",
        phone: body.phone?.trim() || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON(newId, vendor);
      return new Response(JSON.stringify({ id: newId, ...vendor }), { status: 201, headers });
    }

    if (req.method === "PUT") {
      if (!id) return new Response(JSON.stringify({ error: "Vendor id is required" }), { status: 400, headers });
      const existing = await store.get(id, { type: "json" });
      if (!existing) return new Response(JSON.stringify({ error: "Vendor not found" }), { status: 404, headers });
      const body = await req.json();
      const updated = {
        name: body.name ?? existing.name,
        address: body.address ?? existing.address,
        email: body.email ?? existing.email,
        phone: body.phone ?? existing.phone,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON(id, updated);
      return new Response(JSON.stringify({ id, ...updated }), { status: 200, headers });
    }

    if (req.method === "DELETE") {
      if (!id) return new Response(JSON.stringify({ error: "Vendor id is required" }), { status: 400, headers });
      await store.delete(id);
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/vendors" };

