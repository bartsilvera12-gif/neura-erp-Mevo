import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import {
  getChatPostgresPool,
  isPgPoolExhaustionMessage,
  logPgPoolStats,
  quoteSchemaTable,
} from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { invalidateSorteosListCachesForEmpresa } from "@/lib/sorteos/server-queries";

const LOG = "[sorteos-entradas][eliminar-cupones]";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s.trim());
}

function sanitizeErr(msg: string): string {
  return msg.replace(/\b(password|token|secret|key)\s*=[^\s]+/gi, "[redacted]").slice(0, 280);
}

type Body = { cantidad?: unknown };

/**
 * POST /api/sorteos/entradas/[entrada_id]/eliminar-cupones
 * Body: { cantidad: number }
 *
 * Elimina las N filas mas recientes (por created_at desc) de sorteo_cupones para la entrada
 * y descuenta cantidad_boletos en sorteo_entradas. Idempotencia por comparacion contra el
 * conteo real de cupones vivos: si N > cupones vivos, se rechaza.
 *
 * Uso pensado: correccion de una carga manual mal digitada por el admin ("puse 20, quise 10").
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entrada_id: string }> }
) {
  let empresaIdForLog = "";
  let schemaForLog = "";
  let entradaIdForLog = "";

  try {
    const authCtx = await getTenantSupabaseFromAuth(request);
    if (!authCtx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const { entrada_id: rawId } = await params;
    const entradaId = typeof rawId === "string" ? rawId.trim() : "";
    entradaIdForLog = entradaId;
    if (!entradaId || !isUuid(entradaId)) {
      return NextResponse.json(errorResponse("entrada_id invalido."), { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as Body;
    const rawN = body.cantidad;
    const n =
      typeof rawN === "number" && Number.isFinite(rawN)
        ? Math.trunc(rawN)
        : typeof rawN === "string" && /^\d+$/.test(rawN.trim())
          ? parseInt(rawN.trim(), 10)
          : NaN;
    if (!Number.isFinite(n) || n <= 0 || n > 10000) {
      return NextResponse.json(
        errorResponse("cantidad debe ser un entero positivo (1-10000)."),
        { status: 400 }
      );
    }

    const empresaId = authCtx.auth.empresa_id;
    empresaIdForLog = empresaId;
    const dataSchema = await fetchDataSchemaForEmpresaId(empresaId);
    schemaForLog = dataSchema;
    const updatedAt = new Date().toISOString();

    console.info(LOG, {
      stage: "before",
      empresa_id: empresaId,
      schema: dataSchema,
      entrada_id: entradaId,
      cantidad: n,
    });

    if (isLikelyUnexposedTenantChatSchema(dataSchema)) {
      const pool = getChatPostgresPool();
      if (!pool) {
        console.error(LOG, {
          stage: "error",
          empresa_id: empresaId,
          schema: dataSchema,
          entrada_id: entradaId,
          error: "sin_pool_pg",
        });
        return NextResponse.json(
          errorResponse(
            "El servidor no tiene conexion directa a Postgres (SUPABASE_DB_URL / DIRECT_URL). No se puede eliminar cupones."
          ),
          { status: 503 }
        );
      }

      const qEntradas = quoteSchemaTable(dataSchema, "sorteo_entradas");
      const qCupones = quoteSchemaTable(dataSchema, "sorteo_cupones");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const entRow = await client.query<{ id: string; cantidad_boletos: number }>(
          `SELECT id, cantidad_boletos
             FROM ${qEntradas}
            WHERE id = $1::uuid AND empresa_id = $2::uuid
            FOR UPDATE`,
          [entradaId, empresaId]
        );
        const ent = entRow.rows?.[0];
        if (!ent) {
          await client.query("ROLLBACK");
          return NextResponse.json(errorResponse("Entrada no encontrada."), { status: 404 });
        }

        const cuponesVivos = await client.query<{ n: string }>(
          `SELECT count(*)::text AS n FROM ${qCupones} WHERE entrada_id = $1::uuid AND empresa_id = $2::uuid`,
          [entradaId, empresaId]
        );
        const cuponesN = Number(cuponesVivos.rows?.[0]?.n ?? "0");
        if (cuponesN <= 0) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            errorResponse("La entrada no tiene cupones para eliminar."),
            { status: 409 }
          );
        }
        if (n > cuponesN) {
          await client.query("ROLLBACK");
          return NextResponse.json(
            errorResponse(
              `Pediste eliminar ${n} cupones, pero solo hay ${cuponesN}. Reduci la cantidad.`
            ),
            { status: 409 }
          );
        }

        const del = await client.query<{ id: string }>(
          `DELETE FROM ${qCupones}
            WHERE id IN (
              SELECT id FROM ${qCupones}
               WHERE entrada_id = $1::uuid AND empresa_id = $2::uuid
               ORDER BY created_at DESC, id DESC
               LIMIT $3::int
            )
            RETURNING id`,
          [entradaId, empresaId, n]
        );
        const eliminados = del.rowCount ?? del.rows.length;

        const nuevaCantidad = Math.max(0, (ent.cantidad_boletos ?? 0) - eliminados);
        await client.query(
          `UPDATE ${qEntradas}
              SET cantidad_boletos = $1::int, updated_at = $2::timestamptz
            WHERE id = $3::uuid AND empresa_id = $4::uuid`,
          [nuevaCantidad, updatedAt, entradaId, empresaId]
        );

        await client.query("COMMIT");

        console.info(LOG, {
          stage: "ok",
          empresa_id: empresaId,
          schema: dataSchema,
          entrada_id: entradaId,
          cupones_eliminados: eliminados,
          cantidad_boletos_nueva: nuevaCantidad,
        });

        invalidateSorteosListCachesForEmpresa(empresaId, dataSchema);

        return NextResponse.json(
          successResponse({
            entrada_id: entradaId,
            cupones_eliminados: eliminados,
            cantidad_boletos: nuevaCantidad,
          })
        );
      } catch (e: unknown) {
        try {
          await client.query("ROLLBACK");
        } catch {}
        const msg = e instanceof Error ? e.message : String(e);
        const poolErr = isPgPoolExhaustionMessage(msg);
        if (poolErr)
          logPgPoolStats("eliminar_cupones_post", pool, {
            empresa_id: empresaId,
            schema: dataSchema,
          });
        console.error(LOG, {
          stage: "error",
          empresa_id: empresaId,
          schema: dataSchema,
          entrada_id: entradaId,
          error: sanitizeErr(msg),
        });
        return NextResponse.json(
          errorResponse(
            poolErr
              ? "Base de datos saturada momentaneamente; reintentá en unos segundos."
              : sanitizeErr(msg) || "Error al eliminar cupones."
          ),
          { status: poolErr ? 503 : 500 }
        );
      } finally {
        client.release();
      }
    }

    const sb = authCtx.supabase;

    const { data: entRow, error: entErr } = await sb
      .from("sorteo_entradas")
      .select("id, cantidad_boletos")
      .eq("id", entradaId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (entErr) {
      return NextResponse.json(errorResponse(sanitizeErr(entErr.message)), { status: 500 });
    }
    if (!entRow) {
      return NextResponse.json(errorResponse("Entrada no encontrada."), { status: 404 });
    }

    const { data: cupList, error: cupSelErr } = await sb
      .from("sorteo_cupones")
      .select("id, created_at")
      .eq("entrada_id", entradaId)
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (cupSelErr) {
      return NextResponse.json(errorResponse(sanitizeErr(cupSelErr.message)), { status: 500 });
    }
    const cuponesN = cupList?.length ?? 0;
    if (cuponesN <= 0) {
      return NextResponse.json(
        errorResponse("La entrada no tiene cupones para eliminar."),
        { status: 409 }
      );
    }
    if (n > cuponesN) {
      return NextResponse.json(
        errorResponse(
          `Pediste eliminar ${n} cupones, pero solo hay ${cuponesN}. Reduci la cantidad.`
        ),
        { status: 409 }
      );
    }

    const idsToDelete = (cupList ?? []).slice(0, n).map((c) => (c as { id: string }).id);
    const { error: delErr } = await sb
      .from("sorteo_cupones")
      .delete()
      .in("id", idsToDelete)
      .eq("empresa_id", empresaId);
    if (delErr) {
      return NextResponse.json(errorResponse(sanitizeErr(delErr.message)), { status: 500 });
    }

    const cantidadActual =
      typeof (entRow as { cantidad_boletos?: number }).cantidad_boletos === "number"
        ? (entRow as { cantidad_boletos: number }).cantidad_boletos
        : 0;
    const nuevaCantidad = Math.max(0, cantidadActual - idsToDelete.length);
    const { error: upErr } = await sb
      .from("sorteo_entradas")
      .update({ cantidad_boletos: nuevaCantidad, updated_at: updatedAt })
      .eq("id", entradaId)
      .eq("empresa_id", empresaId);
    if (upErr) {
      return NextResponse.json(errorResponse(sanitizeErr(upErr.message)), { status: 500 });
    }

    invalidateSorteosListCachesForEmpresa(empresaId, dataSchema);

    console.info(LOG, {
      stage: "ok",
      empresa_id: empresaId,
      schema: dataSchema,
      entrada_id: entradaId,
      cupones_eliminados: idsToDelete.length,
      cantidad_boletos_nueva: nuevaCantidad,
    });

    return NextResponse.json(
      successResponse({
        entrada_id: entradaId,
        cupones_eliminados: idsToDelete.length,
        cantidad_boletos: nuevaCantidad,
      })
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, {
      stage: "error",
      empresa_id: empresaIdForLog || undefined,
      schema: schemaForLog || undefined,
      entrada_id: entradaIdForLog || undefined,
      error: sanitizeErr(msg),
    });
    return NextResponse.json(errorResponse(sanitizeErr(msg) || "Error interno."), {
      status: 503,
    });
  }
}
