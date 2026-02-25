import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "customers", consistency: "strong" });
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
    // LIST all customers or GET one by id
    if (req.method === "GET") {
      if (id) {
        const customer = await store.get(id, { type: "json" });
        if (!customer) {
          return new Response(JSON.stringify({ error: "Customer not found" }), {
            status: 404,
            headers,
          });
        }
        return new Response(JSON.stringify(customer), { status: 200, headers });
      }

      // List all customers
      const { blobs } = await store.list();
      const customers = [];
      for (const blob of blobs) {
        const data = await store.get(blob.key, { type: "json" });
        if (data) {
          customers.push({ id: blob.key, ...data });
        }
      }
      return new Response(JSON.stringify(customers), { status: 200, headers });
    }

    // CREATE a new customer
    if (req.method === "POST") {
      const body = await req.json();
      const { name, address, email, phone, creditTerms } = body;

      if (!name) {
        return new Response(
          JSON.stringify({ error: "Customer name is required" }),
          { status: 400, headers }
        );
      }

      const newId = `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const customer = {
        name: name || "",
        address: address || "",
        email: email || "",
        phone: phone || "",
        creditTerms: creditTerms || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await store.setJSON(newId, customer);
      return new Response(JSON.stringify({ id: newId, ...customer }), {
        status: 201,
        headers,
      });
    }

    // UPDATE an existing customer
    if (req.method === "PUT") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Customer id is required" }),
          { status: 400, headers }
        );
      }

      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return new Response(JSON.stringify({ error: "Customer not found" }), {
          status: 404,
          headers,
        });
      }

      const body = await req.json();
      const updated = {
        name: body.name ?? existing.name,
        address: body.address ?? existing.address,
        email: body.email ?? existing.email,
        phone: body.phone ?? existing.phone,
        creditTerms: body.creditTerms ?? existing.creditTerms,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await store.setJSON(id, updated);
      return new Response(JSON.stringify({ id, ...updated }), {
        status: 200,
        headers,
      });
    }

    // DELETE a customer
    if (req.method === "DELETE") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Customer id is required" }),
          { status: 400, headers }
        );
      }

      await store.delete(id);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers,
      });
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
  path: "/api/customers",
};
