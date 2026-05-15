import { getStore } from "@netlify/blobs";

async function nextSequenceNumber() {
  const sequenceStore = getStore({ name: "document-sequences", consistency: "strong" });
  const counterKey = "main";
  let counter = 999;
  try {
    const existing = await sequenceStore.get(counterKey, { type: "json" });
    if (existing && Number.isFinite(existing.value)) {
      counter = existing.value;
    }
  } catch (e) {
    // first use
  }

  const nextValue = counter + 1;
  await sequenceStore.setJSON(counterKey, { value: nextValue });
  return nextValue;
}

function sanitizeBackupFileName(fileName) {
  return String(fileName || "quote-attachment")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "quote-attachment";
}

function extractSequenceFromQuoteValue(value) {
  const match = String(value || "").match(/(?:^|[^0-9])0*([1-9][0-9]{2,})(?:[^0-9]|$)/);
  return match ? Number(match[1]) : null;
}

async function findQuoteBySequence(store, sequenceNumber) {
  if (!Number.isFinite(sequenceNumber)) return null;
  const { blobs } = await store.list();
  for (const blob of blobs) {
    const data = await store.get(blob.key, { type: "json" });
    if (!data) continue;
    const storedSequence = Number(data.sequenceNumber) || extractSequenceFromQuoteValue(data.quoteNumber);
    if (storedSequence === sequenceNumber) return { id: blob.key, quote: data };
  }
  return null;
}

export default async (req) => {
  const store = getStore({ name: "quotes", consistency: "strong" });
  const closedStore = getStore({ name: "closed-quotes", consistency: "strong" });
  const backupStore = getStore({ name: "quote-backups", consistency: "strong" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const action = url.searchParams.get("action");
  const backupId = url.searchParams.get("backupId");

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
        if (action === "backup") {
          if (!backupId) {
            return new Response(JSON.stringify({ error: "backupId is required" }), { status: 400, headers });
          }
          const backup = (Array.isArray(quote.backups) ? quote.backups : []).find((item) => item.id === backupId);
          if (!backup) {
            return new Response(JSON.stringify({ error: "Attachment not found" }), { status: 404, headers });
          }
          const fileData = await backupStore.get(backup.key, { type: "arrayBuffer" });
          if (!fileData) {
            return new Response(JSON.stringify({ error: "Attachment file not found" }), { status: 404, headers });
          }
          return new Response(fileData, {
            status: 200,
            headers: {
              "Content-Type": backup.contentType || "application/octet-stream",
              "Content-Disposition": `attachment; filename="${sanitizeBackupFileName(backup.fileName)}"`,
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            },
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

    // POST - create a new quote or attach a quote backup file
    if (req.method === "POST") {
      const body = await req.json();

      if (action === "backup") {
        const fileName = String(body.fileName || "").trim();
        const contentBase64 = String(body.contentBase64 || "");
        const contentType = String(body.contentType || "application/octet-stream");
        const sequenceNumber = extractSequenceFromQuoteValue(body.quoteNumber || fileName);

        if (!fileName || !contentBase64) {
          return new Response(JSON.stringify({ error: "fileName and contentBase64 are required" }), { status: 400, headers });
        }

        const target = id
          ? { id, quote: await store.get(id, { type: "json" }) }
          : await findQuoteBySequence(store, sequenceNumber);

        if (!target?.quote) {
          return new Response(JSON.stringify({ error: "No matching quote found for this file name" }), { status: 404, headers });
        }

        const safeName = sanitizeBackupFileName(fileName);
        const nowISO = new Date().toISOString();
        const newBackupId = `backup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const key = `${target.id}/${newBackupId}/${safeName}`;
        const bytes = Uint8Array.from(Buffer.from(contentBase64, "base64"));

        await backupStore.set(key, bytes, {
          metadata: {
            quoteId: target.id,
            quoteNumber: target.quote.quoteNumber || "",
            fileName: safeName,
            contentType,
          },
        });

        const backup = {
          id: newBackupId,
          fileName: safeName,
          originalFileName: fileName,
          contentType,
          size: Number(body.size) || bytes.byteLength,
          uploadedAt: nowISO,
          key,
        };
        const backups = [...(Array.isArray(target.quote.backups) ? target.quote.backups : []), backup];
        const updatedQuote = { ...target.quote, backups, updatedAt: nowISO };
        await store.setJSON(target.id, updatedQuote);

        return new Response(JSON.stringify({ id: target.id, quoteNumber: updatedQuote.quoteNumber, backup }), { status: 201, headers });
      }

      const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const sequenceNumber = Number(body.sequenceNumber) || (await nextSequenceNumber());
      const quote = {
        id: quoteId,
        sequenceNumber,
        quoteNumber: `q${sequenceNumber}`,
        status: body.status || "quote",
        closedReason: body.closedReason || null,
        convertedOrderId: body.convertedOrderId || null,
        customer: body.customer || null,
        customerName: body.customerName || "",
        customerPhone: body.customerPhone || "",
        items: body.items || [],
        hardwareItem: body.hardwareItem || "",
        hardwarePrice: body.hardwarePrice || 0,
        hardware: body.hardware || null,
        hardwareItems: Array.isArray(body.hardwareItems) ? body.hardwareItems : [],
        backups: Array.isArray(body.backups) ? body.backups : [],
        grandTotal: body.grandTotal || 0,
        grandTotalWithTax: body.grandTotalWithTax || 0,
        specialPricing: body.specialPricing || false,
        customerNotes: body.customerNotes || body.notes || "",
        notes: body.customerNotes || body.notes || "",
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
      const sequenceNumber = Number(body.sequenceNumber) || Number(existing.sequenceNumber) || null;
      const updated = {
        ...existing,
        ...body,
        id,
        sequenceNumber,
        quoteNumber: sequenceNumber ? `q${sequenceNumber}` : existing.quoteNumber,
        updatedAt: new Date().toISOString(),
      };

      if (String(updated.status || "").toLowerCase() === "closed as ordered") {
        await closedStore.setJSON(id, {
          ...updated,
          closedAt: updated.updatedAt,
        });
        await store.delete(id);
      } else {
        await store.setJSON(id, updated);
      }

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
