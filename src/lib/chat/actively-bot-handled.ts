/**
 * Regla única de negocio: pestaña **Bot** = conversación operada **ahora** por automatización,
 * no por flags históricos ni punteros a sesiones ya cerradas.
 */

export type FlowSessionRowMin = {
  id: string;
  status: string;
  flow_code: string;
  conversation_id: string;
};

export function buildFlowSessionMap(rows: FlowSessionRowMin[] | null | undefined): Map<string, FlowSessionRowMin> {
  const m = new Map<string, FlowSessionRowMin>();
  for (const r of rows ?? []) {
    const id = String(r.id ?? "").trim();
    if (!id) continue;
    m.set(id, {
      id,
      status: String(r.status ?? "").trim(),
      flow_code: String(r.flow_code ?? "").trim(),
      conversation_id: String(r.conversation_id ?? "").trim(),
    });
  }
  return m;
}

/**
 * `true` solo si en este momento hay automatización de flujo **vigente** (sesión `active` en BD),
 * flujo publicado como activo en `chat_flows`, sin toma humana, y datos coherentes (sin legado incoherente).
 */
export function isActivelyBotHandledConversation(
  conv: Record<string, unknown>,
  activeFlowCodeSet: Set<string>,
  sessionById: Map<string, FlowSessionRowMin>
): boolean {
  if (Boolean((conv as { human_taken_over?: boolean }).human_taken_over)) return false;

  const flowStatus = String((conv as { flow_status?: string | null }).flow_status ?? "").trim();
  if (flowStatus === "human") return false;

  const conversationId = String((conv as { id?: string }).id ?? "").trim();
  const flowCode = String((conv as { flow_code?: string | null }).flow_code ?? "").trim();
  if (!conversationId || !flowCode || !activeFlowCodeSet.has(flowCode)) return false;

  const sessionId = String((conv as { active_flow_session_id?: string | null }).active_flow_session_id ?? "").trim();
  if (!sessionId) return false;

  const sess = sessionById.get(sessionId);
  if (!sess) return false;
  if (sess.status !== "active") return false;
  if (sess.conversation_id !== conversationId) return false;
  if (sess.flow_code !== flowCode) return false;

  return true;
}
