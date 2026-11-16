import { NextRequest, NextResponse } from "next/server";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { getSingleClientSchemaOrNull, isSingleClientMode } from "@/lib/instance/single-client";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { runRecontactAudioDispatch } from "@/lib/chat/recontact-audio-dispatch";
import type { SupabaseAdmin } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

/**
 * /api/cron/recontact-dispatch — seguimiento por audio a clientes que quedaron quietos en un paso.
 *
 * - Cron (Coolify, cada minuto vía scripts/cron-dispatch.mjs): `Authorization: Bearer CRON_SECRET`
 *   → envía de verdad.
 * - Admin del ERP con sesión: solo `?dryRun=1` (informa a quién le tocaría, sin enviar).
 *   Parámetro opcional `rule_id` para simular una regla puntual (aunque esté apagada).
 */
async function handle(request: NextRequest) {
  const url = new URL(request.url);
  const dryRun = ["1", "true"].includes((url.searchParams.get("dryRun") ?? "").trim().toLowerCase());
  const ruleId = (url.searchParams.get("rule_id") ?? "").trim() || null;

  const secret = (process.env.CRON_SECRET ?? "").trim();
  const bearer = (request.headers.get("authorization") ?? "").trim();
  const esCron = Boolean(secret) && bearer === `Bearer ${secret}`;
  if (!esCron) {
    if (!dryRun) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id || !isAdmin(auth)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  if (!isSingleClientMode()) {
    return NextResponse.json({ ok: false, error: "cron_disabled_in_multi_tenant" }, { status: 400 });
  }
  const raw = getSingleClientSchemaOrNull();
  if (!raw) return NextResponse.json({ ok: false, error: "single_client_schema_missing" }, { status: 500 });
  const schema = assertAllowedChatDataSchema(raw);
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json({ ok: false, error: "pool_unavailable" }, { status: 503 });

  const empQ = await pool.query<{ id: string }>(`SELECT id::text AS id FROM "${schema}".empresas LIMIT 1`);
  const empresaId = empQ.rows[0]?.id;
  if (!empresaId) return NextResponse.json({ ok: false, error: "empresa_not_found" }, { status: 404 });

  const supabase = (await getChatServiceClientForEmpresa(empresaId)) as unknown as SupabaseAdmin;
  const result = await runRecontactAudioDispatch({ pool, supabase, schema, empresaId, dryRun, ruleId });
  return NextResponse.json({ ok: true, dryRun, ...result });
}

export async function GET(request: NextRequest) {
  try {
    return await handle(request);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
