import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import {
  ensureDefaultCrmEtapasPg,
  listCrmEtapasActivasPg,
} from "@/lib/crm/crm-prospectos-pg";

/**
 * GET /api/crm/etapas
 * Etapas CRM activas del tenant (columnas Kanban del funnel).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const dataSchema = await fetchDataSchemaForEmpresaId(empresaId);
    const pool = getChatPostgresPool();

    const usePg = Boolean(pool && isLikelyUnexposedTenantChatSchema(dataSchema));

    console.info("[crm-funnel][board]", "request", {
      empresa_id: empresaId,
      data_schema: dataSchema,
      modo: usePg ? "postgres_directo" : "postgrest",
    });

    if (usePg && pool) {
      await ensureDefaultCrmEtapasPg(pool, dataSchema, empresaId);
      const rows = await listCrmEtapasActivasPg(pool, dataSchema, empresaId);
      if (rows !== null) {
        console.info("[crm-funnel][board-data]", {
          empresa_id: empresaId,
          data_schema: dataSchema,
          modo: "postgres_directo",
          etapas_count: rows.length,
          codigos: rows.map((r) => String((r as { codigo?: string }).codigo ?? "")),
        });
        console.info("[crm-funnel][board]", "postgres_ok", {
          empresa_id: empresaId,
          data_schema: dataSchema,
          modo: "postgres_directo",
          etapas: rows.length,
        });
        return NextResponse.json(successResponse(rows));
      }
      return NextResponse.json(
        errorResponse("No se pudieron listar etapas CRM vía Postgres"),
        { status: 500 }
      );
    }

    const { count: etapaCount } = await supabase
      .from("crm_etapas")
      .select("*", { count: "exact", head: true })
      .eq("empresa_id", empresaId);

    if ((etapaCount ?? 0) === 0) {
      const defaults = [
        { empresa_id: empresaId, codigo: "LEAD", nombre: "Lead", color: "gray", orden: 1, activo: true },
        { empresa_id: empresaId, codigo: "CONTACTADO", nombre: "Contactado", color: "blue", orden: 2, activo: true },
        { empresa_id: empresaId, codigo: "NEGOCIACION", nombre: "Negociación", color: "amber", orden: 3, activo: true },
        { empresa_id: empresaId, codigo: "GANADO", nombre: "Ganado", color: "green", orden: 4, activo: true },
        { empresa_id: empresaId, codigo: "PERDIDO", nombre: "Perdido", color: "red", orden: 5, activo: true },
      ];
      const { error: seedErr } = await supabase.from("crm_etapas").insert(defaults);
      if (seedErr) {
        console.warn("[crm-funnel]", "crm_etapas_seed_postgrest_failed", seedErr.message);
      } else {
        console.info("[crm-funnel]", "crm_etapas_seed_postgrest", { empresa_id: empresaId });
      }
    }

    const { data, error } = await supabase
      .from("crm_etapas")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    const list = data ?? [];
    console.info("[crm-funnel][board-data]", {
      empresa_id: empresaId,
      data_schema: dataSchema,
      modo: "postgrest_schema",
      etapas_count: list.length,
      codigos: list.map((r) => String((r as { codigo?: string }).codigo ?? "")),
    });
    console.info("[crm-funnel][board]", "postgrest_ok", {
      empresa_id: empresaId,
      data_schema: dataSchema,
      modo: "postgrest",
      etapas: list.length,
    });
    return NextResponse.json(successResponse(list));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
