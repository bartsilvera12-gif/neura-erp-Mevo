import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { pickDefaultSorteoId, type SorteoOption } from "@/lib/sorteos/server-queries";

/**
 * GET /api/sorteos/tickets — lista entregas de tickets (reservorio).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const url = new URL(request.url);
    const sorteoParam = url.searchParams.get("sorteo_id")?.trim() || "";
    const status = url.searchParams.get("status")?.trim() || "";
    const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

    const sb = await getChatServiceClientForEmpresa(empresaId);

    // Default: si no se especifica sorteo, usar el actual (activo más reciente) para no
    // traer el histórico completo. "all" = sin filtro (opt-in explícito).
    let effectiveSorteoId = sorteoParam === "all" ? "" : sorteoParam;
    if (!sorteoParam) {
      const { data: sList } = await sb
        .from("sorteos")
        .select("id, nombre, estado, fecha_sorteo, created_at")
        .eq("empresa_id", empresaId);
      const opts: SorteoOption[] = Array.isArray(sList)
        ? (sList as Record<string, unknown>[]).map((r) => ({
            id: String(r.id),
            nombre: typeof r.nombre === "string" ? r.nombre : "",
            estado: typeof r.estado === "string" ? r.estado : "activo",
            fecha_sorteo: r.fecha_sorteo != null ? String(r.fecha_sorteo) : null,
            created_at: r.created_at != null ? String(r.created_at) : null,
          }))
        : [];
      effectiveSorteoId = pickDefaultSorteoId(opts) ?? "";
    }

    let query = sb
      .from("sorteo_ticket_deliveries")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (effectiveSorteoId) query = query.eq("sorteo_id", effectiveSorteoId);
    if (status && ["pending", "generated", "sent", "error"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      const hint =
        /sorteo_ticket_deliveries|does not exist|relation/i.test(error.message)
          ? " Verificá que la migración sorteo_ticket_deliveries esté aplicada en el schema tenant (erp_*)."
          : "";
      console.error("[api/sorteos/tickets] list_error", { empresaId, message: error.message });
      return NextResponse.json(errorResponse(`${error.message}${hint}`), { status: 400 });
    }
    let rows = data ?? [];
    if (q) {
      rows = rows.filter((r: Record<string, unknown>) => {
        const pack = JSON.stringify(r).toLowerCase();
        return pack.includes(q);
      });
    }
    return NextResponse.json(successResponse(rows));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
