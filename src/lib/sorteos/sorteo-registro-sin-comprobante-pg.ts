/**
 * Inscripción a sorteo SIN comprobante de pago (modo "giveaway" / pre-registro).
 *
 * Crea `sorteo_entradas` (estado 'confirmado', monto 0, sin comprobante) + sus cupones,
 * desde una conversación de WhatsApp. Reutiliza el mismo helper de cupones y la misma
 * idempotencia (`idempotency_key`) que el flujo de compra normal y la venta manual, pero
 * NO exige imagen de comprobante ni monto.
 *
 * Se usa solo cuando `chat_flows.flow_config.sorteo_sin_comprobante = true` (ver
 * `finalizeSorteoOrderFromConfirmedFlowData`). El camino de compra real queda intacto.
 */
import "server-only";

import type pg from "pg";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { insertSorteoCuponesAndUpdateSorteoCounters } from "@/lib/sorteos/sorteo-order-cupones-pg";
import type { DirectPgSorteoOk, DirectPgSorteoFail } from "@/lib/sorteos/sorteo-order-direct-pg";

const LOG = "[sorteo-sin-comprobante]" as const;

function quoteIdent(schema: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error("schema inválido");
  }
  return `"${schema.replace(/"/g, '""')}"`;
}

function normalizeTelefonoSorteo(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length > 0 ? d : raw.trim();
}

async function loadColumns(client: pg.PoolClient, schema: string, table: string): Promise<Set<string>> {
  const r = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );
  return new Set(r.rows.map((x) => x.column_name));
}

export type SorteoRegistroSinComprobanteInput = {
  schema: string;
  empresaId: string;
  sorteoId: string;
  conversationId: string;
  flowCode: string;
  idempotencyKey: string;
  whatsappNumero: string;
  /** Nombre + apellido ya unidos (se guarda en `nombre_participante`). */
  nombreCompleto: string;
  cedula: string;
  ciudad: string;
  /** Por defecto 1 (un número de rifa por inscripto). */
  cantidadBoletos?: number;
};

function mapExistingRowToOk(
  ex: { id: string; numero_orden: number; estado_pago: string },
  cupRows: { id: string; numero_cupon: string }[],
  qty: number
): DirectPgSorteoOk {
  return {
    ok: true,
    idempotent: true,
    entradaId: ex.id,
    numeroOrden: ex.numero_orden,
    cupones: cupRows,
    cantidadBoletos: qty,
    montoTotal: 0,
    promoNombre: "",
    precioFuente: "lista",
    estadoPago: ex.estado_pago,
  };
}

/**
 * Inserta la inscripción (entrada confirmada sin comprobante) + cupones, en transacción PG directa.
 * Idempotente por `idempotency_key`: si ya existe la fila, devuelve la misma entrada y cupones.
 */
export async function registrarSorteoInscripcionSinComprobanteViaDirectPostgres(
  input: SorteoRegistroSinComprobanteInput
): Promise<DirectPgSorteoOk | DirectPgSorteoFail> {
  const sch = input.schema.trim();
  const idem = input.idempotencyKey.trim();
  if (!idem) {
    return { ok: false, message: "Falta idempotency_key." };
  }

  const nombreCompleto = input.nombreCompleto.trim();
  if (!nombreCompleto) {
    return { ok: false, message: "Nombre y apellido son obligatorios." };
  }

  const qty = Number.isFinite(input.cantidadBoletos) ? Number(input.cantidadBoletos) : 1;
  if (!Number.isFinite(qty) || qty < 1) {
    return { ok: false, message: "La cantidad de boletos debe ser mayor a 0." };
  }

  const poolInst = getChatPostgresPool();
  if (!poolInst) {
    return { ok: false, message: "No hay conexión directa a la base de datos configurada." };
  }

  const client = await poolInst.connect();
  const qsch = quoteIdent(sch);

  try {
    const entCols = await loadColumns(client, sch, "sorteo_entradas");
    const cupCols = await loadColumns(client, sch, "sorteo_cupones");
    const sortCols = await loadColumns(client, sch, "sorteos");
    const cliCols = await loadColumns(client, sch, "clientes");

    if (
      !sortCols.has("id") ||
      !entCols.has("empresa_id") ||
      !cupCols.has("entrada_id") ||
      !cliCols.has("empresa_id")
    ) {
      console.error(LOG, "columnas_mínimas_ausentes", { schema: sch });
      return {
        ok: false,
        message: "No se pudo validar las tablas de sorteo en el servidor. Contactá soporte.",
      };
    }

    await client.query("BEGIN");

    // Idempotencia: misma inscripción (misma sesión) no duplica entrada.
    const idemRes = await client.query<{ id: string; numero_orden: number; estado_pago: string }>(
      `SELECT id, numero_orden, estado_pago FROM ${qsch}.sorteo_entradas WHERE idempotency_key = $1 LIMIT 1`,
      [idem]
    );
    if (idemRes.rows[0]) {
      const ex = idemRes.rows[0];
      const cupRes = await client.query<{ id: string; numero_cupon: string }>(
        `SELECT id, numero_cupon FROM ${qsch}.sorteo_cupones WHERE entrada_id = $1 ORDER BY numero_cupon`,
        [ex.id]
      );
      await client.query("COMMIT");
      return mapExistingRowToOk(ex, cupRes.rows, qty);
    }

    const sortSelectCols = [
      "id",
      "empresa_id",
      "estado",
      "precio_por_boleto",
      "max_boletos",
      "total_boletos_vendidos",
      "ultimo_numero_cupon",
      "ultimo_numero_orden",
    ];
    if (sortCols.has("coupon_numbering_enabled")) sortSelectCols.push("coupon_numbering_enabled");
    if (sortCols.has("coupon_number_start")) sortSelectCols.push("coupon_number_start");
    if (sortCols.has("coupon_number_mode")) sortSelectCols.push("coupon_number_mode");
    if (sortCols.has("coupon_number_limit")) sortSelectCols.push("coupon_number_limit");

    const sRes = await client.query(
      `SELECT ${sortSelectCols.join(", ")}
       FROM ${qsch}.sorteos WHERE id = $1 FOR UPDATE`,
      [input.sorteoId]
    );
    const s = sRes.rows[0] as
      | {
          empresa_id: string;
          estado: string;
          precio_por_boleto: string | number;
          max_boletos: number;
          total_boletos_vendidos: number;
          ultimo_numero_cupon: number;
          ultimo_numero_orden: number;
          coupon_numbering_enabled?: boolean;
          coupon_number_start?: number | null;
          coupon_number_mode?: string | null;
          coupon_number_limit?: number | null;
        }
      | undefined;
    if (!s) {
      await client.query("ROLLBACK");
      return { ok: false, message: "Sorteo no encontrado." };
    }
    if (s.empresa_id !== input.empresaId) {
      await client.query("ROLLBACK");
      return { ok: false, message: "El sorteo no pertenece a la empresa indicada." };
    }
    if (String(s.estado) !== "activo") {
      await client.query("ROLLBACK");
      return { ok: false, message: "El sorteo no está activo." };
    }
    // Cupo: solo se controla si el sorteo define un máximo positivo (giveaway suele ser ilimitado).
    const maxBoletos = Number(s.max_boletos);
    if (Number.isFinite(maxBoletos) && maxBoletos > 0 && s.total_boletos_vendidos + qty > maxBoletos) {
      await client.query("ROLLBACK");
      return { ok: false, message: "No hay cupos disponibles para esta inscripción." };
    }

    const wa = normalizeTelefonoSorteo(input.whatsappNumero);
    const ce = input.cedula.trim();
    const ciudad = input.ciudad.trim();

    // Upsert de cliente (mismo criterio que compra chat: por documento o teléfono).
    let clienteId: string | null = null;
    const deletedClause = cliCols.has("deleted_at") ? "AND deleted_at IS NULL" : "";
    const findCli = await client.query<{ id: string }>(
      `SELECT id FROM ${qsch}.clientes
       WHERE empresa_id = $1 ${deletedClause}
         AND (
           ($2::text IS NOT NULL AND $2::text <> '' AND documento IS NOT NULL AND trim(documento) = $2)
           OR trim(telefono) = $3
         )
       LIMIT 1`,
      [input.empresaId, ce || null, wa]
    );
    if (findCli.rows[0]) {
      clienteId = findCli.rows[0].id;
      if (ciudad && cliCols.has("ciudad")) {
        await client.query(
          `UPDATE ${qsch}.clientes SET ciudad = COALESCE(NULLIF(trim(ciudad), ''), $2) WHERE id = $1`,
          [clienteId, ciudad]
        );
      }
    } else {
      const cliRow: Record<string, unknown> = {
        empresa_id: input.empresaId,
        tipo_cliente: "persona",
        nombre_contacto: nombreCompleto,
        nombre: nombreCompleto,
        documento: ce || null,
        telefono: wa,
        origen: "SORTEO_CHAT",
      };
      if (cliCols.has("ciudad")) cliRow.ciudad = ciudad || null;
      const cliInsCols = Object.keys(cliRow).filter((k) => cliCols.has(k));
      const cliVals = cliInsCols.map((k) => cliRow[k]);
      const cliPh = cliInsCols.map((_, i) => `$${i + 1}`).join(", ");
      const cliColQ = cliInsCols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");
      const insCli = await client.query<{ id: string }>(
        `INSERT INTO ${qsch}.clientes (${cliColQ}) VALUES (${cliPh}) RETURNING id`,
        cliVals as unknown[]
      );
      clienteId = insCli.rows[0]?.id ?? null;
    }

    const numeroOrden = Number(s.ultimo_numero_orden) + 1;
    const ultCupon = Number(s.ultimo_numero_cupon);
    const nowIso = new Date().toISOString();

    const rowEnt: Record<string, unknown> = {
      empresa_id: input.empresaId,
      sorteo_id: input.sorteoId,
      conversacion_id: input.conversationId,
      cliente_id: clienteId,
      whatsapp_numero: wa,
      nombre_participante: nombreCompleto,
      documento: ce || null,
      cantidad_boletos: qty,
      monto_total: 0,
      moneda: "PYG",
      estado_pago: "confirmado",
      fecha_pago: nowIso,
      monto_pagado: 0,
      banco_origen: null,
      comprobante_url: null,
      validado_por: "chat_flow_sin_comprobante",
      numero_orden: numeroOrden,
      chat_conversation_id: input.conversationId,
      flow_code: input.flowCode,
      idempotency_key: idem,
      promo_nombre: null,
      precio_fuente: "lista",
      precio_regular_referencia: null,
    };
    if (entCols.has("ciudad")) rowEnt.ciudad = ciudad || null;
    if (entCols.has("validado_at")) rowEnt.validado_at = nowIso;
    // Valores acotados por CHECK constraints (ver migración
    // 20260505140000_sorteo_entradas_manual_erp_meta.sql):
    //   venta_origen IN ('whatsapp_flow','erp_manual') | venta_canal IN ('remote','local')
    // La marca de "sin comprobante" queda en `validado_por`, no acá.
    if (entCols.has("venta_origen")) rowEnt.venta_origen = "whatsapp_flow";
    if (entCols.has("venta_canal")) rowEnt.venta_canal = "remote";

    const insertCols = Object.keys(rowEnt).filter((k) => entCols.has(k));
    const vals = insertCols.map((k) => rowEnt[k]);
    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");
    const colQuoted = insertCols.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");

    let entradaId: string;
    try {
      const insE = await client.query<{ id: string }>(
        `INSERT INTO ${qsch}.sorteo_entradas (${colQuoted}) VALUES (${placeholders}) RETURNING id`,
        vals as unknown[]
      );
      entradaId = insE.rows[0]?.id ?? "";
    } catch (e: unknown) {
      const pgE = e as { code?: string };
      if (pgE.code === "23505") {
        // Carrera en idempotency_key: devolver la fila ganadora.
        await client.query("ROLLBACK");
        const again = await client.query<{ id: string; numero_orden: number; estado_pago: string }>(
          `SELECT id, numero_orden, estado_pago FROM ${qsch}.sorteo_entradas WHERE idempotency_key = $1 LIMIT 1`,
          [idem]
        );
        if (again.rows[0]) {
          const ex = again.rows[0];
          const cupRes = await client.query<{ id: string; numero_cupon: string }>(
            `SELECT id, numero_cupon FROM ${qsch}.sorteo_cupones WHERE entrada_id = $1 ORDER BY numero_cupon`,
            [ex.id]
          );
          return mapExistingRowToOk(ex, cupRes.rows, qty);
        }
      }
      throw e;
    }

    if (!entradaId) {
      await client.query("ROLLBACK");
      return { ok: false, message: "No se pudo crear la inscripción del sorteo." };
    }

    const cupInsert = await insertSorteoCuponesAndUpdateSorteoCounters({
      client,
      schemaQuoted: qsch,
      sortCols,
      cupCols,
      s,
      empresaId: input.empresaId,
      sorteoId: input.sorteoId,
      entradaId,
      qty,
      ultCupon,
      numeroOrden,
    });
    if (!cupInsert.ok) {
      await client.query("ROLLBACK");
      return { ok: false, message: cupInsert.message };
    }

    await client.query("COMMIT");

    return {
      ok: true,
      idempotent: false,
      entradaId,
      numeroOrden,
      cupones: cupInsert.cupones,
      cantidadBoletos: qty,
      montoTotal: 0,
      promoNombre: "",
      precioFuente: "lista",
      estadoPago: "confirmado",
    };
  } catch (err: unknown) {
    await client.query("ROLLBACK").catch(() => {});
    const e = err as { message?: string; code?: string };
    console.error(LOG, "sql_error", { schema: input.schema, message: e.message, code: e.code });
    return {
      ok: false,
      message: "No se pudo registrar la inscripción. Intentá de nuevo o contactá soporte.",
    };
  } finally {
    client.release();
  }
}
