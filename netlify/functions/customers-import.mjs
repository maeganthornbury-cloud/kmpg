import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "customers", consistency: "strong" });

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }

  try {
    const body = await req.json();
    const { customers } = body;

    if (!Array.isArray(customers) || customers.length === 0) {
      return new Response(
        JSON.stringify({ error: "An array of customers is required" }),
        { status: 400, headers }
      );
    }

    const results = { created: 0, skipped: 0, errors: [] };

    for (const entry of customers) {
      const name = (entry.name || "").trim();
      if (!name) {
        results.skipped++;
        continue;
      }

      const newId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const customer = {
        name,
        address: (entry.address || "").trim(),
        email: (entry.email || "").trim(),
        phone: (entry.phone || "").trim(),
        creditTerms: (entry.creditTerms || "").trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        await store.setJSON(newId, customer);
        results.created++;
      } catch (err) {
        results.errors.push({ name, error: err.message });
      }
    }

    return new Response(JSON.stringify(results), { status: 200, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers,
    });
  }
};

export const config = {
  path: "/api/customers-import",
};
