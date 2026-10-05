import "server-only";

import {
  getChatPostgresPool,
  getChatPostgresConnectionString,
  quoteSchemaTable,
} from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getEmpresaIdForCurrentUserServer } from "@/lib/supabase/empresa-data-server";

/**
 * Reporte de ventas por canal de publicidad.
 *
 * El origen se toma del `referral` que Meta adjunta cuando alguien entra al
 * WhatsApp desde un anuncio click-to-WhatsApp (Facebook / Instagram). TikTok NO
 * usa este mecanismo, por lo que sus ventas NO se pueden identificar y caen en
 * "Sin anuncio". Atribución de PRIMER contacto por conversación.
 */

export type CanalVenta = {
  canal: string;
  pedidos: number;
  boletas: number;
  monto: number;
  ticket_promedio: number;
};

export type VentasPorCanalResult = {
  data: CanalVenta[];
  error: string | null;
};

const CANAL_CASE = `
  CASE
    WHEN su ILIKE '%fb.me%' OR su ILIKE '%facebook.%' THEN 'Facebook'
    WHEN su ILIKE '%instagram.%' THEN 'Instagram'
    WHEN su ILIKE '%tiktok%' THEN 'TikTok'
    ELSE 'Otro anuncio'
  END`;

export async function fetchVentasPorCanalServer(
  sorteoId: string | null
): Promise<VentasPorCanalResult> {
  const empresaId = await getEmpresaIdForCurrentUserServer();
  if (!empresaId) return { data: [], error: "Sin sesión o empresa." };

  if (!getChatPostgresConnectionString()) {
    return { data: [], error: "El servidor no tiene conexión directa a la base para calcular el reporte." };
  }
  const pool = getChatPostgresPool();
  if (!pool) {
    return { data: [], error: "Pool de base de datos no disponible." };
  }

  const dataSchema = await fetchDataSchemaForEmpresaId(empresaId);
  const sch = assertAllowedChatDataSchema(dataSchema);
  const tEnt = quoteSchemaTable(sch, "sorteo_entradas");
  const tMsg = quoteSchemaTable(sch, "chat_messages");

  const params: unknown[] = [empresaId];
  let sorteoCond = "";
  if (sorteoId) {
    params.push(sorteoId);
    sorteoCond = `AND se.sorteo_id = $${params.length}::uuid`;
  }

  // `ref`: primer referral por conversación, acotado a las conversaciones que
  // tienen una entrada en el alcance (barrido de chat_messages por conversación,
  // no sobre toda la tabla).
  const sql = `
    WITH conv AS (
      SELECT DISTINCT se.chat_conversation_id AS cid
      FROM ${tEnt} se
      WHERE se.empresa_id = $1::uuid ${sorteoCond}
        AND se.chat_conversation_id IS NOT NULL
    ),
    ref AS (
      SELECT DISTINCT ON (m.conversation_id) m.conversation_id,
             ${CANAL_CASE} AS plataforma
      FROM ${tMsg} m
      JOIN conv ON conv.cid = m.conversation_id
      CROSS JOIN LATERAL (SELECT m.raw_payload->'referral'->>'source_url' AS su) s
      WHERE m.from_me = false AND m.raw_payload ? 'referral'
      ORDER BY m.conversation_id, m.created_at ASC
    )
    SELECT COALESCE(ref.plataforma, 'Sin anuncio (directo/otros)') AS canal,
           count(*)::int AS pedidos,
           COALESCE(SUM(se.cantidad_boletos), 0)::int AS boletas,
           COALESCE(SUM(se.monto_total), 0)::bigint AS monto,
           COALESCE(round(AVG(se.monto_total)), 0)::bigint AS ticket_promedio
    FROM ${tEnt} se
    LEFT JOIN ref ON ref.conversation_id = se.chat_conversation_id
    WHERE se.empresa_id = $1::uuid ${sorteoCond}
      AND se.estado_pago <> 'rechazado'
      AND se.monto_total > 0
    GROUP BY 1
    ORDER BY monto DESC
  `;

  try {
    const res = await pool.query(sql, params);
    const data: CanalVenta[] = (res.rows ?? []).map((r) => ({
      canal: String((r as { canal: string }).canal),
      pedidos: Number((r as { pedidos: number }).pedidos) || 0,
      boletas: Number((r as { boletas: number }).boletas) || 0,
      monto: Number((r as { monto: number }).monto) || 0,
      ticket_promedio: Number((r as { ticket_promedio: number }).ticket_promedio) || 0,
    }));
    return { data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sorteos][ventas-por-canal]", "error", {
      empresa_id: empresaId,
      schema: dataSchema,
      error: msg.slice(0, 300),
    });
    return { data: [], error: "No se pudo generar el reporte. Intentá de nuevo en unos segundos." };
  }
}
