import { getStore } from "@netlify/blobs";

async function nextRequestNumber() {
  const seq = getStore({ name: "residential-request-seq", consistency: "strong" });
  const current = await seq.get("main", { type: "json" });
  const value = Number(current?.value || 0) + 1;
  await seq.setJSON("main", { value });
  return `RR-${String(value).padStart(4, "0")}`;
}

async function getAssignedTechContact(payload = {}) {
  const techStore = getStore({ name: "service-techs", consistency: "strong" });

  if (payload.assignedTechId) {
    const techById = await techStore.get(String(payload.assignedTechId), { type: "json" });
    if (techById) {
      return {
        id: String(payload.assignedTechId),
        name: techById.name || payload.assignedTech || "",
        email: techById.email || "",
      };
    }
  }

  if (payload.assignedTech) {
    const { blobs } = await techStore.list();
    const needle = String(payload.assignedTech).trim().toLowerCase();
    for (const blob of blobs) {
      const tech = await techStore.get(blob.key, { type: "json" });
      if (tech && String(tech.name || "").trim().toLowerCase() === needle) {
        return { id: blob.key, name: tech.name || payload.assignedTech || "", email: tech.email || "" };
      }
    }
    return { id: "", name: payload.assignedTech, email: "" };
  }

  return { id: "", name: "", email: "" };
}

async function notifyAssignedTech(requestRecord) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESIDENTIAL_EMAIL_FROM;
  if (!apiKey || !fromEmail || !requestRecord?.assignedTechEmail) {
    return { sent: false, reason: "Missing RESEND_API_KEY, RESIDENTIAL_EMAIL_FROM, or tech email" };
  }

  const customer = requestRecord.customer || {};
  const subject = `New Residential Request ${requestRecord.requestNumber || ""}`.trim();
  const lines = [
    `You have been assigned a new residential request.`,
    `Request #: ${requestRecord.requestNumber || "N/A"}`,
    `Customer: ${customer.name || "N/A"}`,
    `Phone: ${customer.phone || "N/A"}`,
    `Address: ${customer.address || "N/A"}`,
    `Description: ${requestRecord.description || "N/A"}`,
    `Status: ${requestRecord.status || "open"}`,
  ];

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [requestRecord.assignedTechEmail],
      subject,
      text: lines.join("\n"),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { sent: false, reason: `Resend error: ${resp.status} ${text}` };
  }

  return { sent: true };
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
      const techContact = await getAssignedTechContact(body);
      const newId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const row = {
        requestNumber: await nextRequestNumber(),
        customer: body.customer || {},
        description: body.description || "",
        assignedTech: techContact.name || body.assignedTech || "",
        assignedTechId: techContact.id || body.assignedTechId || "",
        assignedTechEmail: techContact.email || "",
        status: body.status || "open",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const emailNotification = await notifyAssignedTech(row);
      row.emailNotification = { ...emailNotification, notifiedAt: new Date().toISOString() };
      await store.setJSON(newId, row);
      return new Response(JSON.stringify({ id: newId, ...row }), { status: 201, headers });
    }

    if (req.method === "PUT") {
      if (!id) return new Response(JSON.stringify({ error: "id is required" }), { status: 400, headers });
      const existing = await store.get(id, { type: "json" });
      if (!existing) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers });
      const body = await req.json();
      const techChanged = body.assignedTechId || body.assignedTech;
      let techContact = {
        id: existing.assignedTechId || "",
        name: existing.assignedTech || "",
        email: existing.assignedTechEmail || "",
      };
      if (techChanged) {
        techContact = await getAssignedTechContact(body);
      }
      const updated = {
        ...existing,
        ...body,
        assignedTech: techContact.name || body.assignedTech || existing.assignedTech || "",
        assignedTechId: techContact.id || body.assignedTechId || existing.assignedTechId || "",
        assignedTechEmail: techContact.email || existing.assignedTechEmail || "",
        requestNumber: existing.requestNumber,
        updatedAt: new Date().toISOString(),
      };
      if (techChanged) {
        const emailNotification = await notifyAssignedTech(updated);
        updated.emailNotification = { ...emailNotification, notifiedAt: new Date().toISOString() };
      }
      await store.setJSON(id, updated);
      return new Response(JSON.stringify({ id, ...updated }), { headers });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: "/api/residential-requests" };
