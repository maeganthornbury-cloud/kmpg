import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "quotes", consistency: "strong" });
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
        const quote = await store.get(id, { type: "json" });
        if (!quote) {
          return new Response(JSON.stringify({ error: "Quote not found" }), {
            status: 404,
            headers,
          });
        }
        return new Response(JSON.stringify(quote), { headers });
      }

      // List all quotes
      const { blobs } = await store.list();
      const quotes = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) quotes.push(data);
      }
      // Sort by creation date descending
      quotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return new Response(JSON.stringify(quotes), { headers });
    }

    // POST - create a new quote
    if (req.method === "POST") {
      const body = await req.json();
      const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const quote = {
        id: quoteId,
        customerName: body.customerName || "",
        customerPhone: body.customerPhone || "",
        items: body.items || [],
        hardwareItem: body.hardwareItem || "",
        hardwarePrice: body.hardwarePrice || 0,
        grandTotal: body.grandTotal || 0,
        grandTotalWithTax: body.grandTotalWithTax || 0,
        specialPricing: body.specialPricing || false,
        notes: body.notes || "",
        createdAt: new Date().toISOString(),
      };
      await store.setJSON(quoteId, quote);
      return new Response(JSON.stringify(quote), { status: 201, headers });
    }

    // PUT - update a quote
    if (req.method === "PUT") {
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing id parameter" }), {
          status: 400,
          headers,
        });
      }
      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return new Response(JSON.stringify({ error: "Quote not found" }), {
          status: 404,
          headers,
        });
      }
      const body = await req.json();
      const updated = { ...existing, ...body, id, updatedAt: new Date().toISOString() };
      await store.setJSON(id, updated);
      return new Response(JSON.stringify(updated), { headers });
    }

    // DELETE - remove a quote
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
  path: "/api/quotes",
};
