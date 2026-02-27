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

export default async (req) => {
  const store = getStore({ name: "vendors", consistency: "strong" });
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });

  try {
    const body = normalizeStringsUpper(await req.json());
    const vendors = Array.isArray(body.vendors) ? body.vendors : [];
    if (!vendors.length) return new Response(JSON.stringify({ error: "An array of vendors is required" }), { status: 400, headers });

    const results = { created: 0, skipped: 0, errors: [] };
    for (const entry of vendors) {
      const name = (entry.name || "").trim();
      if (!name) {
        results.skipped++;
        continue;
      }
      const newId = `vendor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const vendor = {
        name,
        address: (entry.address || "").trim(),
        email: (entry.email || "").trim(),
        phone: (entry.phone || "").trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      try {
        await store.setJSON(newId, vendor);
        results.created++;
      } catch (err) {
        results.errors.push({ name, error: err.message });
      }
    }

    return new Response(JSON.stringify(results), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/vendors-import" };

