// NDAI Brain ingest - credential-hash-gated writer for fleet clients.
// Plaintext client credentials never appear in function source or the receiver
// database. Only SHA-256 hashes are stored by private.ingest_credentials.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WRITABLE: Record<string, { conflict?: string }> = {
  agent_events: { conflict: "source_system,source_id" },
  credential_status: { conflict: "agent_slug,provider" },
  escalations: {},
  deliverables: { conflict: "source_system,source_id" },
  tasks: {},
  task_events: {},
  approvals: { conflict: "key" },
};

const TASK_FIELDS = new Set([
  "status", "priority", "owner_slug", "title", "body", "next_step", "blockers", "product_id",
]);

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const token = req.headers.get("x-brain-token") ?? "";
  if (token.length < 32 || token.length > 512) return new Response("unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: authorized, error: authError } = await supabase.rpc(
    "verify_brain_ingest_token",
    { p_token_hash: await sha256Hex(token) },
  );
  if (authError || authorized !== true) return new Response("unauthorized", { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (body.action === "healthcheck") {
    return json({ ok: true, service: "ndai-brain-ingest" });
  }

  async function taskByTicket(ticketNo: unknown) {
    if (typeof ticketNo !== "number") return null;
    const { data } = await supabase.from("tasks").select("*").eq("ticket_no", ticketNo).single();
    return data;
  }

  const action = body.action as string | undefined;
  if (action === "feed") {
    const limit = Math.min(Math.max(Number(body.limit) || 120, 1), 300);
    const { data, error } = await supabase
      .from("agent_events")
      .select("id, at, agent_slug, actor, kind, status, summary")
      .order("at", { ascending: false })
      .limit(limit);
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, events: data });
  }

  if (action === "task_update") {
    const { ticket_no, field, value, actor } = body as {
      ticket_no?: number; field?: string; value?: string; actor?: string;
    };
    if (!ticket_no || !field || !TASK_FIELDS.has(field) || typeof value !== "string" || !actor) {
      return json({ ok: false, error: "task_update needs ticket_no, whitelisted field, string value, actor" }, 400);
    }
    const existing = await taskByTicket(ticket_no);
    if (!existing) return json({ ok: false, error: `no task with ticket_no ${ticket_no}` }, 404);
    const { error: updateError } = await supabase.from("tasks").update({ [field]: value }).eq("ticket_no", ticket_no);
    if (updateError) return json({ ok: false, error: updateError.message }, 500);
    await supabase.from("task_events").insert({
      task_id: existing.id,
      actor,
      action: field === "status" ? "move" : "update",
      field,
      old_value: String(existing[field] ?? ""),
      new_value: value,
    });
    return json({ ok: true });
  }

  if (action === "task_comment") {
    const { ticket_no, actor, text } = body as { ticket_no?: number; actor?: string; text?: string };
    if (!ticket_no || !actor || typeof text !== "string" || !text) {
      return json({ ok: false, error: "task_comment needs ticket_no, actor, text" }, 400);
    }
    const existing = await taskByTicket(ticket_no);
    if (!existing) return json({ ok: false, error: `no task with ticket_no ${ticket_no}` }, 404);
    const { error } = await supabase.from("task_events").insert({
      task_id: existing.id, actor, action: "comment", new_value: text.slice(0, 4000),
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "deliverable_add") {
    const { ticket_no, agent_slug, title, artifact_path } = body as {
      ticket_no?: number; agent_slug?: string; title?: string; artifact_path?: string;
    };
    if (!ticket_no || !agent_slug || !artifact_path) {
      return json({ ok: false, error: "deliverable_add needs ticket_no, agent_slug, artifact_path" }, 400);
    }
    const existing = await taskByTicket(ticket_no);
    if (!existing) return json({ ok: false, error: `no task with ticket_no ${ticket_no}` }, 404);
    const { error } = await supabase.from("deliverables").insert({
      task_id: existing.id,
      agent_slug,
      title: title ?? `Deliverable for TASK-${ticket_no}`,
      artifact_path,
      product_id: existing.product_id,
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true });
  }

  if (action === "task_done") {
    const { ticket_no, actor, deliverable_path } = body as {
      ticket_no?: number; actor?: string; deliverable_path?: string;
    };
    if (!ticket_no || !actor) return json({ ok: false, error: "task_done needs ticket_no, actor" }, 400);
    const existing = await taskByTicket(ticket_no);
    if (!existing) return json({ ok: false, error: `no task with ticket_no ${ticket_no}` }, 404);
    if (deliverable_path) {
      await supabase.from("deliverables").insert({
        task_id: existing.id,
        agent_slug: actor,
        title: `Deliverable for TASK-${ticket_no}`,
        artifact_path: deliverable_path,
        product_id: existing.product_id,
      });
    }
    const { error: updateError } = await supabase.from("tasks").update({ status: "done" }).eq("ticket_no", ticket_no);
    if (updateError) return json({ ok: false, error: updateError.message }, 500);
    await supabase.from("task_events").insert({
      task_id: existing.id,
      actor,
      action: "move",
      field: "status",
      old_value: String(existing.status ?? ""),
      new_value: "done",
    });
    return json({ ok: true });
  }

  const table = (body.table as string) ?? "";
  const spec = WRITABLE[table];
  const rows = body.rows as unknown[] | undefined;
  if (!spec || !Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    return new Response("bad request", { status: 400 });
  }

  const query = body.upsert && spec.conflict
    ? supabase.from(table).upsert(rows, { onConflict: spec.conflict, ignoreDuplicates: true })
    : supabase.from(table).insert(rows);
  const { error } = await query;
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, count: rows.length });
});
