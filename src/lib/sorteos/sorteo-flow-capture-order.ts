import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { prepareFlowDataForSorteoOrder } from "@/lib/sorteos/sorteo-order-from-chat";
import { readSorteoCantidadNumericFromMap } from "@/lib/sorteos/sorteo-cantidad-fields";

function norm(s: string | undefined | null): string {
  return (s ?? "").trim();
}

/** Coincidencia flexible de claves en chat_flow_data (sin dictar orden; solo lectura). */
export function normalizeFlowFieldKey(k: string): string {
  return k.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

const CEDULA_KEYS = new Set([
  "cedula",
  "cédula",
  "documento",
  "nro_documento",
  "numero_documento",
  "ci",
  "dni",
  "ruc",
]);

const NOMBRE_KEYS = new Set(["nombre", "primer_nombre", "nombres", "nombre_completo"]);

const APELLIDO_KEYS = new Set(["apellido", "primer_apellido", "apellidos"]);

const CIUDAD_KEYS = new Set(["ciudad", "localidad", "ubicacion", "ubicación"]);

function bucketForSaveField(saveAs: string): "cedula" | "nombre" | "apellido" | "ciudad" | "other" {
  const s = normalizeFlowFieldKey(saveAs);
  if (!s) return "other";
  if (CEDULA_KEYS.has(s) || /documento|cedula|^ci$|dni|ruc|numero_document|nro_document/.test(s)) {
    return "cedula";
  }
  if (NOMBRE_KEYS.has(s) || (s.includes("nombre") && !s.includes("apellido"))) return "nombre";
  if (APELLIDO_KEYS.has(s) || s.includes("apellido")) return "apellido";
  if (CIUDAD_KEYS.has(s) || s.includes("ciudad") || s.includes("localidad")) return "ciudad";
  return "other";
}

/** ¿Hay valor no vacío en flow_data para esta clave de guardado o sus alias de bucket? */
export function flowDataHasValueForCaptureSaveField(
  rawFlowData: Record<string, string>,
  saveAsField: string | null | undefined
): boolean {
  const sf = norm(saveAsField);
  if (!sf) return true;
  const prep = prepareFlowDataForSorteoOrder({ ...rawFlowData });
  const bucket = bucketForSaveField(sf);
  const keysToCheck = new Set<string>();
  keysToCheck.add(normalizeFlowFieldKey(sf));
  if (bucket === "cedula") CEDULA_KEYS.forEach((k) => keysToCheck.add(k));
  if (bucket === "nombre") NOMBRE_KEYS.forEach((k) => keysToCheck.add(k));
  if (bucket === "apellido") APELLIDO_KEYS.forEach((k) => keysToCheck.add(k));
  if (bucket === "ciudad") CIUDAD_KEYS.forEach((k) => keysToCheck.add(k));
  for (const [k, v] of Object.entries(prep)) {
    const kn = normalizeFlowFieldKey(k);
    if (!norm(v)) continue;
    if (keysToCheck.has(kn)) return true;
  }
  return false;
}

export type FlowNodeRowLite = {
  id: string;
  node_code: string;
  node_type: string;
  message_text: string | null;
  save_as_field: string | null;
  next_node_code: string | null;
};

export type FlowOptRowLite = {
  node_id: string;
  next_node_code: string | null;
};

/** Aristas del grafo: `next_node_code` de los nodos + `next_node_code` de cada opción. */
export function buildFlowNodeAdjacency(
  nodes: FlowNodeRowLite[],
  opts: FlowOptRowLite[]
): { adj: Map<string, string[]>; targets: Set<string> } {
  const targets = new Set<string>();
  const adj = new Map<string, string[]>();

  function addEdge(from: string, to: string | null | undefined) {
    const t = norm(to);
    if (!t) return;
    targets.add(t);
    const list = adj.get(from) ?? [];
    list.push(t);
    adj.set(from, list);
  }

  for (const n of nodes) {
    const code = n.node_code.trim();
    addEdge(code, n.next_node_code);
  }
  const idToCode = new Map(nodes.map((n) => [n.id, n.node_code.trim()]));
  for (const o of opts) {
    const parent = idToCode.get(o.node_id);
    if (parent) addEdge(parent, o.next_node_code);
  }

  return { adj, targets };
}

/**
 * ¿`to` es alcanzable desde `from` siguiendo aristas (mínimo un salto)?
 * Tolera ciclos (p. ej. el botón "Modificar" que vuelve a pedir los datos).
 */
export function isNodeDownstreamOf(
  adj: Map<string, string[]>,
  from: string,
  to: string
): boolean {
  const start = norm(from);
  const target = norm(to);
  if (!start || !target) return false;
  const seen = new Set<string>();
  const queue = [...(adj.get(start) ?? [])];
  while (queue.length) {
    const code = queue.shift()!;
    if (code === target) return true;
    if (seen.has(code)) continue;
    seen.add(code);
    for (const nx of adj.get(code) ?? []) {
      if (!seen.has(nx)) queue.push(nx);
    }
  }
  return false;
}

/** Orden BFS de node_code (misma semántica que findResumeNode legacy). */
export function buildFlowNodeBfsOrder(nodes: FlowNodeRowLite[], opts: FlowOptRowLite[]): string[] {
  const { adj, targets } = buildFlowNodeAdjacency(nodes, opts);

  const roots = nodes.map((n) => n.node_code.trim()).filter((c) => !targets.has(c));
  const queue = [...roots];
  const visited = new Set<string>();
  const order: string[] = [];
  while (queue.length) {
    const code = queue.shift()!;
    if (visited.has(code)) continue;
    visited.add(code);
    order.push(code);
    for (const nx of adj.get(code) ?? []) {
      if (!visited.has(nx)) queue.push(nx);
    }
  }
  return order;
}

function isCantidadCaptureNode(node: FlowNodeRowLite): boolean {
  const nt = norm(node.node_type).toLowerCase();
  return nt === "buttons" || nt === "list";
}

function cantidadSatisfied(flowData: Record<string, string>): boolean {
  const prep = prepareFlowDataForSorteoOrder({ ...flowData });
  return readSorteoCantidadNumericFromMap(prep) != null;
}

const SUMMARY_NODE_HINTS = /estos son tus datos registrados|datos registrados/i;

export function isParticipantSummaryReviewNode(node: FlowNodeRowLite): boolean {
  const nc = norm(node.node_code).toLowerCase();
  if (nc.includes("comprobacion") || nc.includes("confirmacion_datos") || nc === "resumen_datos") {
    return true;
  }
  const msg = norm(node.message_text);
  return SUMMARY_NODE_HINTS.test(msg);
}

export type FindIncompleteCaptureResult = {
  nodeCode: string;
  messageText: string;
  saveAsField: string | null;
  selectionReason: "flow_order_first_missing";
};

export type FlowCaptureGraphContext = {
  order: string[];
  nodesByCode: Map<string, FlowNodeRowLite>;
  /** Aristas reales: distinguen "más adelante en el flujo" de "en otra rama". */
  adj: Map<string, string[]>;
};

async function loadFlowCaptureGraphContext(
  supabase: AppSupabaseClient,
  empresaId: string,
  flowCode: string
): Promise<FlowCaptureGraphContext | null> {
  const fc = flowCode.trim();
  if (!fc) return null;

  const { data: nodesRaw, error: nErr } = await supabase
    .from("chat_flow_nodes")
    .select("id, node_code, node_type, message_text, save_as_field, next_node_code")
    .eq("empresa_id", empresaId)
    .eq("flow_code", fc)
    .eq("is_active", true);
  if (nErr || !nodesRaw?.length) return null;

  const nodes = nodesRaw as FlowNodeRowLite[];
  const nodeIds = nodes.map((n) => n.id);

  // `sort_order` explícito: sin él el orden de las aristas —y por lo tanto el BFS—
  // depende de lo que devuelva el motor, que no está garantizado.
  const { data: optsRaw } = await supabase
    .from("chat_flow_options")
    .select("node_id, next_node_code, sort_order")
    .in("node_id", nodeIds)
    .order("sort_order", { ascending: true });
  const opts = (optsRaw ?? []) as FlowOptRowLite[];

  const order = buildFlowNodeBfsOrder(nodes, opts);
  const nodesByCode = new Map(nodes.map((n) => [n.node_code.trim(), n]));
  const { adj } = buildFlowNodeAdjacency(nodes, opts);
  return { order, nodesByCode, adj };
}

function scanFirstIncompleteCapture(
  ctx: FlowCaptureGraphContext,
  flowData: Record<string, string>
): FindIncompleteCaptureResult | null {
  const { order, nodesByCode } = ctx;
  for (const code of order) {
    const node = nodesByCode.get(code);
    if (!node) continue;
    const nt = norm(node.node_type).toLowerCase();

    if (nt === "image_input" || nt === "human" || nt === "end") continue;

    if (isCantidadCaptureNode(node)) {
      if (!cantidadSatisfied(flowData)) {
        return {
          nodeCode: code,
          messageText: norm(node.message_text),
          saveAsField: norm(node.save_as_field) || null,
          selectionReason: "flow_order_first_missing",
        };
      }
      continue;
    }

    if (nt === "text" && norm(node.save_as_field)) {
      if (!flowDataHasValueForCaptureSaveField(flowData, node.save_as_field)) {
        return {
          nodeCode: code,
          messageText: norm(node.message_text),
          saveAsField: norm(node.save_as_field),
          selectionReason: "flow_order_first_missing",
        };
      }
      continue;
    }
  }

  return null;
}

/** Lista ordenada de identificadores de captura (save_as_field o `cantidad`) según el grafo. */
export function listOrderedCaptureFieldDescriptors(ctx: FlowCaptureGraphContext): string[] {
  const out: string[] = [];
  for (const code of ctx.order) {
    const node = ctx.nodesByCode.get(code);
    if (!node) continue;
    const nt = norm(node.node_type).toLowerCase();
    if (nt === "image_input" || nt === "human" || nt === "end") continue;
    if (isCantidadCaptureNode(node)) {
      out.push("cantidad");
      continue;
    }
    if (nt === "text" && norm(node.save_as_field)) {
      out.push(norm(node.save_as_field));
    }
  }
  return out;
}

/** Todos los datos de captura faltantes en orden de flujo (no solo el primero). */
export function listMissingCaptureFieldDescriptors(
  ctx: FlowCaptureGraphContext,
  flowData: Record<string, string>
): string[] {
  const missing: string[] = [];
  for (const code of ctx.order) {
    const node = ctx.nodesByCode.get(code);
    if (!node) continue;
    const nt = norm(node.node_type).toLowerCase();
    if (nt === "image_input" || nt === "human" || nt === "end") continue;

    if (isCantidadCaptureNode(node)) {
      if (!cantidadSatisfied(flowData)) missing.push("cantidad");
      continue;
    }
    if (nt === "text" && norm(node.save_as_field)) {
      if (!flowDataHasValueForCaptureSaveField(flowData, node.save_as_field)) {
        missing.push(norm(node.save_as_field));
      }
    }
  }
  return missing;
}

export type ResolveFlowCompletenessResult = {
  effectiveNodeCode: string;
  redirected: boolean;
  firstIncomplete: FindIncompleteCaptureResult | null;
  flowOrder: string[];
};

/**
 * Si el grafo exige capturas antes que `proposedNodeCode`, devuelve el primer nodo incompleto.
 * Evita saltar al resumen/compra_realizada con datos faltantes.
 */
export async function resolveEffectiveNodeCodeForFlowCompleteness(
  supabase: AppSupabaseClient,
  empresaId: string,
  flowCode: string,
  flowData: Record<string, string>,
  proposedNodeCode: string
): Promise<ResolveFlowCompletenessResult> {
  const proposed = norm(proposedNodeCode);
  const ctx = await loadFlowCaptureGraphContext(supabase, empresaId, flowCode);
  if (!ctx) {
    return {
      effectiveNodeCode: proposed,
      redirected: false,
      firstIncomplete: null,
      flowOrder: [],
    };
  }

  const firstIncomplete = scanFirstIncompleteCapture(ctx, flowData);
  if (!firstIncomplete) {
    return {
      effectiveNodeCode: proposed,
      redirected: false,
      firstIncomplete: null,
      flowOrder: ctx.order,
    };
  }

  // Solo retroceder si `proposed` está realmente AGUAS ABAJO de la captura pendiente.
  // El índice BFS no alcanza: cuando el flujo tiene ramas paralelas (p. ej. un desvío
  // "Aún no" que ocurre ANTES de pedir el dato), la captura queda con índice menor sin
  // ser su predecesora, y redirigir ahí se come la rama que el cliente eligió.
  if (isNodeDownstreamOf(ctx.adj, firstIncomplete.nodeCode, proposed)) {
    return {
      effectiveNodeCode: firstIncomplete.nodeCode,
      redirected: true,
      firstIncomplete,
      flowOrder: ctx.order,
    };
  }
  return {
    effectiveNodeCode: proposed,
    redirected: false,
    firstIncomplete,
    flowOrder: ctx.order,
  };
}

/**
 * Si el puntero actual (`currentPointerCode`) está “demasiado adelante” respecto al primer dato faltante,
 * hay que retroceder el puntero al nodo de captura pendiente (ej.: resumen mostrado sin cédula).
 */
export async function resolveConversationPointerForIncompleteCaptures(
  supabase: AppSupabaseClient,
  empresaId: string,
  flowCode: string,
  flowData: Record<string, string>,
  currentPointerCode: string
): Promise<ResolveFlowCompletenessResult> {
  return resolveEffectiveNodeCodeForFlowCompleteness(
    supabase,
    empresaId,
    flowCode,
    flowData,
    currentPointerCode
  );
}

/**
 * Primer nodo de captura en orden BFS del flujo cuyo dato falta en chat_flow_data.
 * No usa prioridad fija cantidad/nombre/cedula: solo el orden real del grafo.
 */
export async function findFirstIncompleteCaptureNodeInFlowOrder(
  supabase: AppSupabaseClient,
  empresaId: string,
  flowCode: string,
  flowData: Record<string, string>
): Promise<FindIncompleteCaptureResult | null> {
  const ctx = await loadFlowCaptureGraphContext(supabase, empresaId, flowCode);
  if (!ctx) return null;
  return scanFirstIncompleteCapture(ctx, flowData);
}

/** required_fields + missing_fields para logs de cierre (una consulta al grafo). */
export async function describeFlowCaptureCompletenessForLogs(
  supabase: AppSupabaseClient,
  empresaId: string,
  flowCode: string,
  flowData: Record<string, string>
): Promise<{
  required_fields: string[];
  missing_fields: string[];
  firstIncomplete: FindIncompleteCaptureResult | null;
} | null> {
  const ctx = await loadFlowCaptureGraphContext(supabase, empresaId, flowCode);
  if (!ctx) return null;
  return {
    required_fields: listOrderedCaptureFieldDescriptors(ctx),
    missing_fields: listMissingCaptureFieldDescriptors(ctx, flowData),
    firstIncomplete: scanFirstIncompleteCapture(ctx, flowData),
  };
}

/** Índice en order; -1 si no está. */
export function indexInFlowOrder(order: string[], nodeCode: string): number {
  const c = norm(nodeCode);
  return order.findIndex((x) => norm(x) === c);
}
