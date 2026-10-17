import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa, getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  fetchDataSchemaForEmpresaId,
  createServiceRoleClientForEmpresa,
} from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import { pgFetchPendingSorteoComprobanteIds } from "@/lib/chat/chat-comprobante-validacion-pg";
import { approveComprobanteAndCloseSorteoPurchase } from "@/lib/chat/sorteo-manual-approval-service";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * POST /api/sorteos/procesar-pendientes
 *
 * Procesa en lote las compras de WhatsApp cuyo comprobante ya fue aprobado/validado
 * pero que NO tienen boleta asignada (sorteo_entrada_id nulo). Es el caso de la gente
 * que quedó "sin número" porque al momento del cierre se habían agotado las boletas.
 *
 * Reutiliza exactamente la misma operación que el botón individual del inbox
 * (`approveComprobanteAndCloseSorteoPurchase`): genera cupones y manda el ticket por
 * WhatsApp. No fuerza nada: si faltan datos o el flujo exige confirmación del cliente,
 * el caso queda pendiente igual que con el botón de a uno.
 *
 * body: { sorteo_id: string; dry_run?: boolean; limit?: number }
 *  - sorteo_id: obligatorio. Solo se tocan comprobantes de ESE sorteo (vía
 *    chat_flows.sorteo_id); nunca de otros sorteos (p. ej. finalizados).
 *  - dry_run: solo cuenta cuántas compras pendientes hay (no procesa).
 *  - limit: cuántas procesar en esta llamada (tope por timeout). Default 15.
 */
type Body = { sorteo_id?: string; dry_run?: boolean; limit?: number };

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

/** flow_codes vinculados a un sorteo (chat_flows.sorteo_id). Para el camino PostgREST. */
async function flowCodesForSorteo(
  sb: Awaited<ReturnType<typeof createServiceRoleClientForEmpresa>>,
  empresaId: string,
  sorteoId: string
): Promise<string[]> {
  const { data, error } = await sb
    .from("chat_flows")
    .select("flow_code")
    .eq("empresa_id", empresaId)
    .eq("sorteo_id", sorteoId);
  if (error) throw new Error(error.message);
  const set = new Set<string>();
  for (const r of data ?? []) {
    const fc = String((r as { flow_code?: string }).flow_code ?? "").trim();
    if (fc) set.add(fc);
  }
  return [...set];
}

async function countAndListPending(
  empresaId: string,
  schema: string,
  sorteoId: string,
  limit: number
): Promise<{ ids: string[]; total: number }> {
  const pool = getChatPostgresPool();
  if (pool && isLikelyUnexposedTenantChatSchema(schema)) {
    return pgFetchPendingSorteoComprobanteIds(pool, schema, empresaId, sorteoId, limit);
  }
  const sb = await createServiceRoleClientForEmpresa(empresaId);
  const flowCodes = await flowCodesForSorteo(sb, empresaId, sorteoId);
  if (flowCodes.length === 0) return { ids: [], total: 0 };
  const { data, error, count } = await sb
    .from("chat_comprobante_validaciones")
    .select("id", { count: "exact" })
    .eq("empresa_id", empresaId)
    .is("sorteo_entrada_id", null)
    .in("estado_validacion", ["valido", "aprobado_manual"])
    .in("flow_code", flowCodes)
    .order("created_at", { ascending: true })
    .limit(Math.max(1, Math.min(200, Math.trunc(limit) || 25)));
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((r) => String((r as { id: string }).id));
  return { ids, total: count ?? ids.length };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getUserAndEmpresa(request);
    if (!auth?.empresa_id) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const rolAuth = await getAuthWithRol(request);
    if (!isAdmin(rolAuth)) {
      return NextResponse.json(
        errorResponse("Solo un administrador puede procesar compras pendientes en lote."),
        { status: 403 }
      );
    }

    const empresaId = auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    const body = (await request.json().catch(() => ({}))) as Body;
    const sorteoId = typeof body.sorteo_id === "string" ? body.sorteo_id.trim() : "";
    if (!sorteoId || !isUuid(sorteoId)) {
      return NextResponse.json(
        errorResponse("Falta el sorteo (sorteo_id) o es inválido."),
        { status: 400 }
      );
    }
    const dryRun = body.dry_run === true;
    const limit = Math.max(1, Math.min(50, Number(body.limit) || 15));

    const candidate = await countAndListPending(empresaId, schema, sorteoId, limit);

    if (dryRun) {
      return NextResponse.json(successResponse({ total_pendientes: candidate.total }));
    }

    const usuarioId = (auth.usuarioCatalogId ?? "").trim();
    if (!usuarioId) {
      return NextResponse.json(
        errorResponse("No se pudo resolver tu usuario. Cerrá sesión y volvé a entrar antes de procesar."),
        { status: 400 }
      );
    }

    const supabase = (await createServiceRoleClientForEmpresa(empresaId)) as AppSupabaseClient;

    let cerrados = 0;
    let pendientesDatos = 0;
    let pendientesConfirmacion = 0;
    let fallidos = 0;
    const errores: { id: string; message: string }[] = [];

    for (const id of candidate.ids) {
      try {
        const res = await approveComprobanteAndCloseSorteoPurchase({
          supabase,
          empresaId,
          usuarioId,
          validacionId: id,
          approvalNote: "Procesado en lote tras ampliar boletas disponibles",
        });
        if (!res.ok) {
          fallidos++;
          errores.push({ id, message: res.message });
          continue;
        }
        if (res.mode === "order_closed") cerrados++;
        else if (res.mode === "pending_participant_data") pendientesDatos++;
        else if (res.mode === "pending_final_confirmation") pendientesConfirmacion++;
      } catch (e) {
        fallidos++;
        errores.push({ id, message: e instanceof Error ? e.message : "Error desconocido" });
      }
    }

    /** Recuento fresco para que el cliente sepa cuántas quedan todavía. */
    let totalRestante = candidate.total;
    try {
      const after = await countAndListPending(empresaId, schema, sorteoId, 1);
      totalRestante = after.total;
    } catch {
      totalRestante = Math.max(0, candidate.total - cerrados);
    }

    return NextResponse.json(
      successResponse({
        procesados: candidate.ids.length,
        cerrados,
        pendientes_datos: pendientesDatos,
        pendientes_confirmacion: pendientesConfirmacion,
        fallidos,
        total_restante: totalRestante,
        errores: errores.slice(0, 10),
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    console.error("[sorteos/procesar-pendientes]", msg);
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
