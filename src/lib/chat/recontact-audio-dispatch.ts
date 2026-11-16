import type { Pool } from "pg";
import type { SupabaseAdmin } from "@/lib/chat/types";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { resolveOutboundTextContextFromIds } from "@/lib/chat/outbound-send-dispatch";
import { sendWhatsAppAudio } from "@/lib/chat/whatsapp-send-service";
import { persistOutgoingChatMessage } from "@/lib/chat/outgoing-message-persist";
import { sorteoDelFlujo, ventasCerradas } from "@/lib/sorteos/sorteo-cierre-ventas";

/**
 * Seguimiento por audio cuando el cliente se queda quieto en un paso del bot.
 *
 * Regla (`chat_flow_recontact_rules` con `message_config.message_type = "session_audio"`):
 * - El cliente está parado en uno de `included_node_codes` y no escribió nada desde que el bot
 *   le mandó ese paso.
 * - Intento 1: pasados `idle_after_seconds` desde el envío del paso → audio_urls[0].
 * - Intento N (N > 1): pasados `cooldown_seconds` desde el intento anterior → audio_urls[N-1].
 * - Hasta `max_attempts` (y nunca más audios que los cargados). Después se corta.
 *
 * Solo manda el audio: no mueve el puntero del flujo ni reinicia nada. Si el cliente escribe,
 * el bot sigue normal y la secuencia de ese paso se corta (hay mensaje entrante posterior).
 * Cada intento (enviado o fallido) queda en `chat_flow_recontact_runs`: nunca se repite.
 */

const LOG = "[recontact-audio]";
/** Ventana de sesión de WhatsApp: sin plantilla solo se puede escribir dentro de las 24 h. */
const SESSION_WINDOW_HOURS = 23;
/** Pasado este margen desde que le tocaba el audio, se saltea (no se manda tarde). */
const MARGEN_VENCIDO_MS = 30 * 60 * 1000;

type RuleRow = {
  id: string;
  flow_code: string;
  nombre: string;
  activo: boolean;
  included_node_codes: unknown;
  idle_after_seconds: number;
  max_attempts: number;
  cooldown_seconds: number;
  schedule_config: unknown;
  message_config: unknown;
};

type CandidateRow = {
  conversation_id: string;
  flow_session_id: string;
  node_code: string;
  channel_id: string;
  contact_id: string;
  sent_at: Date;
  attempts: number;
  last_attempt_at: Date | null;
};

export type RecontactAudioAction = {
  regla: string;
  conversation_id: string;
  node_code: string;
  intento: number;
  resultado: "enviado" | "error" | "simulado";
  detalle?: string;
};

export type RecontactAudioResult = {
  reglas: number;
  acciones: RecontactAudioAction[];
  omitidas_por_horario: number;
  /** Clientes a los que el audio les tocaba hace más de 30 min: no se envía tarde. */
  vencidas: number;
};

function stringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((x) => String(x ?? "").trim()).filter(Boolean))];
}

export function audioUrlsFromMessageConfig(mc: unknown): string[] {
  if (!mc || typeof mc !== "object" || Array.isArray(mc)) return [];
  const o = mc as Record<string, unknown>;
  if (o.message_type !== "session_audio") return [];
  return stringArray(o.audio_urls).filter((u) => /^https:\/\//i.test(u));
}

/** Respeta la franja horaria de la regla si tiene inicio y fin (HH:MM); sin franja, siempre. */
function dentroDeHorario(schedule: unknown, ahora: Date): boolean {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return true;
  const s = schedule as Record<string, unknown>;
  const ini = typeof s.window_start === "string" ? s.window_start.trim() : "";
  const fin = typeof s.window_end === "string" ? s.window_end.trim() : "";
  if (!/^\d{1,2}:\d{2}$/.test(ini) || !/^\d{1,2}:\d{2}$/.test(fin)) return true;
  const tz = typeof s.timezone === "string" && s.timezone.trim() ? s.timezone.trim() : "America/Asuncion";
  let hhmm: string;
  try {
    hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false })
      .format(ahora)
      .replace(/^24:/, "00:");
  } catch {
    return true;
  }
  const a = ini.padStart(5, "0");
  const b = fin.padStart(5, "0");
  return a <= b ? hhmm >= a && hhmm < b : hhmm >= a || hhmm < b;
}

/** Un solo barrido a la vez en este proceso (el cron corre cada minuto). */
let barridoEnCurso = false;

export async function runRecontactAudioDispatch(params: {
  pool: Pool;
  supabase: SupabaseAdmin;
  schema: string;
  empresaId: string;
  /** Solo informa a quién le tocaría; no envía ni registra. Incluye reglas apagadas. */
  dryRun: boolean;
  ruleId?: string | null;
}): Promise<RecontactAudioResult> {
  const { pool, supabase, schema, empresaId, dryRun } = params;
  if (!dryRun && barridoEnCurso) return { reglas: 0, acciones: [], omitidas_por_horario: 0, vencidas: 0 };
  if (!dryRun) barridoEnCurso = true;
  try {
    const tRules = quoteSchemaTable(schema, "chat_flow_recontact_rules");
    const tRuns = quoteSchemaTable(schema, "chat_flow_recontact_runs");
    const tConv = quoteSchemaTable(schema, "chat_conversations");
    const tEv = quoteSchemaTable(schema, "chat_flow_events");
    const tMsg = quoteSchemaTable(schema, "chat_messages");

    const rulesRes = await pool.query<RuleRow>(
      `SELECT id::text, flow_code, nombre, activo, included_node_codes, idle_after_seconds, max_attempts,
              cooldown_seconds, schedule_config, message_config
         FROM ${tRules}
        WHERE empresa_id = $1::uuid
          AND message_config->>'message_type' = 'session_audio'
          AND ($2::boolean OR activo = true)
          AND ($3::uuid IS NULL OR id = $3::uuid)
        ORDER BY prioridad ASC, created_at ASC`,
      [empresaId, dryRun, params.ruleId ?? null]
    );

    const ahora = new Date();
    const acciones: RecontactAudioAction[] = [];
    let omitidasHorario = 0;
    let vencidas = 0;
    /** Una conversación recibe a lo sumo un audio por barrido, aunque matcheen varias reglas. */
    const yaTocadas = new Set<string>();

    for (const rule of rulesRes.rows) {
      const nodos = stringArray(rule.included_node_codes);
      const audios = audioUrlsFromMessageConfig(rule.message_config);
      const maxIntentos = Math.min(Math.max(1, rule.max_attempts), audios.length);
      if (nodos.length === 0 || maxIntentos === 0) continue;

      // Ventas cerradas (llegó la fecha o el sorteo no está activo): no se insiste con audios de compra.
      const sorteoRegla = await sorteoDelFlujo(supabase, empresaId, rule.flow_code).catch(() => null);
      if (sorteoRegla && ventasCerradas(sorteoRegla)) continue;

      /**
       * Antigüedad máxima del paso para que todavía le pueda tocar algún audio. Sin este corte, el
       * LIMIT se llenaba con conversaciones viejas (ya vencidas o con todos sus intentos hechos) y las
       * recientes nunca entraban: con mucho tráfico el seguimiento no mandaba nada.
       */
      const margenSeg = Math.ceil(MARGEN_VENCIDO_MS / 1000);
      const ventanaSeg =
        rule.idle_after_seconds + (maxIntentos - 1) * (rule.cooldown_seconds + margenSeg) + margenSeg + 120;

      /**
       * Momento en que le toca el próximo audio: intento 1 a `idle` del paso; los siguientes a
       * `cooldown` del intento anterior. Se filtra en SQL (y no solo en el loop) para que el LIMIT
       * traiga únicamente casos accionables. Antes, con mucho tráfico (una campaña masiva que mete
       * miles de personas al paso), las conversaciones ya vencidas llenaban las 500 filas, las
       * frescas nunca entraban, también se vencían, y el seguimiento quedaba trabado sin mandar nada.
       */
      const leToca = `(CASE WHEN COALESCE(rr.cnt, 0) = 0
                              THEN ns.sent_at + make_interval(secs => $7::int)
                              ELSE COALESCE(rr.last_run, ns.sent_at) + make_interval(secs => $8::int) END)`;
      const candidatosDesde = `
           FROM ${tConv} c
           JOIN LATERAL (
                SELECT max(e.created_at) AS sent_at
                  FROM ${tEv} e
                 WHERE e.conversation_id = c.id
                   AND e.flow_session_id = c.active_flow_session_id
                   AND e.node_code = c.flow_current_node
                   AND e.event_type = 'node_sent'
           ) ns ON ns.sent_at IS NOT NULL
           LEFT JOIN LATERAL (
                SELECT max(m.created_at) AS last_in
                  FROM ${tMsg} m
                 WHERE m.conversation_id = c.id AND m.from_me = false
           ) li ON true
           LEFT JOIN LATERAL (
                SELECT count(*) AS cnt, max(r.created_at) AS last_run
                  FROM ${tRuns} r
                 WHERE r.rule_id = $4::uuid
                   AND r.conversation_id = c.id
                   AND r.flow_session_id = c.active_flow_session_id
                   AND r.decision IN ('sent', 'error')
                   AND r.created_at >= ns.sent_at
           ) rr ON true
          WHERE c.empresa_id = $1::uuid
            AND c.flow_code = $2
            AND c.flow_current_node = ANY($3::text[])
            AND c.active_flow_session_id IS NOT NULL
            AND COALESCE(c.human_taken_over, false) = false
            AND COALESCE(c.flow_status, 'bot') <> 'human'
            AND COALESCE(c.status, 'open') <> 'closed'
            AND c.last_message_at > now() - interval '${SESSION_WINDOW_HOURS} hours'
            AND ns.sent_at > now() - interval '${SESSION_WINDOW_HOURS} hours'
            AND (li.last_in IS NULL OR li.last_in <= ns.sent_at)
            AND ns.sent_at > now() - make_interval(secs => $6::int)
            AND COALESCE(rr.cnt, 0) < $5::int`;
      const candParams = [
        empresaId,
        rule.flow_code,
        nodos,
        rule.id,
        maxIntentos,
        ventanaSeg,
        rule.idle_after_seconds,
        rule.cooldown_seconds,
        margenSeg,
      ];

      const candRes = await pool.query<CandidateRow>(
        `SELECT c.id::text AS conversation_id,
                c.active_flow_session_id::text AS flow_session_id,
                c.flow_current_node AS node_code,
                c.channel_id::text AS channel_id,
                c.contact_id::text AS contact_id,
                ns.sent_at,
                COALESCE(rr.cnt, 0)::int AS attempts,
                rr.last_run AS last_attempt_at
           ${candidatosDesde}
            AND ${leToca} <= now()
            AND ${leToca} > now() - make_interval(secs => $9::int)
          ORDER BY ${leToca} ASC
          LIMIT 500`,
        candParams
      );

      if (dryRun) {
        const vencRes = await pool.query<{ n: string }>(
          `SELECT count(*)::text AS n
           ${candidatosDesde}
            AND ${leToca} <= now() - make_interval(secs => $9::int)`,
          candParams
        );
        vencidas += Number(vencRes.rows[0]?.n ?? 0);
      }

      for (const c of candRes.rows) {
        if (yaTocadas.has(c.conversation_id)) continue;
        if (c.attempts >= maxIntentos) continue;
        const desde = c.attempts === 0 ? new Date(c.sent_at) : new Date(c.last_attempt_at ?? c.sent_at);
        const espera = (c.attempts === 0 ? rule.idle_after_seconds : rule.cooldown_seconds) * 1000;
        const transcurrido = ahora.getTime() - desde.getTime();
        if (transcurrido < espera) continue;
        /**
         * Solo casos frescos: si ya pasó más de MARGEN_VENCIDO desde que le tocaba (regla recién
         * activada, cron caído un rato), no se manda tarde ni en ráfaga. Si se saltea el intento 1,
         * tampoco habrá intento 2 (depende del 1).
         */
        if (transcurrido > espera + MARGEN_VENCIDO_MS) {
          vencidas++;
          continue;
        }
        if (!dentroDeHorario(rule.schedule_config, ahora)) {
          omitidasHorario++;
          continue;
        }

        const intento = c.attempts + 1;
        const audioUrl = audios[intento - 1]!;
        yaTocadas.add(c.conversation_id);
        const base = { regla: rule.nombre, conversation_id: c.conversation_id, node_code: c.node_code, intento };

        if (dryRun) {
          acciones.push({ ...base, resultado: "simulado" });
          continue;
        }

        let decision: "sent" | "error" = "error";
        let detalle = "";
        let waMessageId: string | null = null;
        try {
          const ctx = await resolveOutboundTextContextFromIds(
            supabase,
            { contactId: c.contact_id, channelId: c.channel_id },
            { dataSchema: schema, empresaId }
          );
          if (ctx.provider !== "meta") {
            detalle = "canal_no_meta";
          } else {
            const send = await sendWhatsAppAudio({
              toDigits: ctx.toDigits,
              phoneNumberId: ctx.phoneNumberId,
              accessToken: ctx.accessToken,
              audioUrl,
            });
            if (send.ok) {
              decision = "sent";
              waMessageId = send.waMessageId;
              await persistOutgoingChatMessage(supabase, {
                conversation: { id: c.conversation_id, empresa_id: empresaId },
                content: `Audio enviado\n${audioUrl}`,
                messageType: "audio",
                waMessageId: send.waMessageId,
                raw: send.raw,
                senderType: "system",
                automationSource: "recontact",
              });
            } else {
              detalle = send.error.slice(0, 300);
            }
          }
        } catch (e) {
          detalle = (e instanceof Error ? e.message : String(e)).slice(0, 300);
        }

        /** Se registra siempre (también el error) para que el intento no se repita. */
        await pool.query(
          `INSERT INTO ${tRuns}
             (empresa_id, rule_id, flow_code, conversation_id, flow_session_id, decision, skip_reason,
              attempt_no, payload_snapshot)
           VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8, $9::jsonb)`,
          [
            empresaId,
            rule.id,
            rule.flow_code,
            c.conversation_id,
            c.flow_session_id,
            decision,
            decision === "error" ? detalle || "send_failed" : null,
            intento,
            JSON.stringify({ node_code: c.node_code, audio_url: audioUrl, wa_message_id: waMessageId }),
          ]
        );
        console.info(LOG, decision, {
          rule_id: rule.id,
          conversation_id: c.conversation_id,
          node_code: c.node_code,
          intento,
          detalle: detalle || undefined,
        });
        acciones.push({ ...base, resultado: decision === "sent" ? "enviado" : "error", detalle: detalle || undefined });
      }
    }

    return { reglas: rulesRes.rows.length, acciones, omitidas_por_horario: omitidasHorario, vencidas };
  } finally {
    if (!dryRun) barridoEnCurso = false;
  }
}
