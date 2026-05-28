"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { createBrowserClientForSchema } from "@/lib/supabase";
import {
  ProyectoModuloSelector,
  type ProyectoModuloCatalogo as ModuloCatalogo,
} from "@/app/dashboard/proyectos/components/ProyectoModuloSelector";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import {
  PROYECTO_DATOS_BRIEF_FIELDS,
  applyBriefFormToExisting,
  applySaasFormToExisting,
  coalesceBriefData,
  formatFechaPyFull,
  readBriefUrlList,
  readSaasBriefData,
  type ProyectoModuloSnapshot,
  type ProyectoSaasBriefForm,
} from "@/lib/proyectos/brief-data";

export type DetalleResp = {
  proyecto: Record<string, unknown> & {
    id: string;
    titulo?: string;
    brief_data?: Record<string, unknown>;
    tipo_id?: string;
    estado_id?: string;
    proyecto_tipo?: { codigo?: string };
  };
  historial: Record<string, unknown>[];
  sla: Record<string, unknown>;
  tareas: Record<string, unknown>[];
  comentarios: Record<string, unknown>[];
  archivos: Record<string, unknown>[];
  avance_pct: number | null;
  current_user_id?: string | null;
};

type UsuarioActivo = { id: string; nombre?: string | null; email?: string | null };

const TAB_IDS = ["resumen", "datos", "tareas", "comentarios", "archivos", "historial"] as const;
export type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  resumen: "Resumen",
  datos: "Datos",
  tareas: "Tareas",
  comentarios: "Comentarios",
  archivos: "Archivos",
  historial: "Historial",
};

function normalizeTab(raw: string | null | undefined): TabId {
  if (!raw) return "resumen";
  if (raw === "brief") return "datos";
  return (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : "resumen";
}

function clienteNombre(p: Record<string, unknown>): string {
  const c = p.cliente as { empresa?: string | null; nombre_contacto?: string | null } | undefined;
  if (!c) return "—";
  const a = (c.empresa ?? "").trim();
  const b = (c.nombre_contacto ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}

function prioridadLabel(value: unknown): string {
  if (value === "normal") return "Media";
  if (value === "baja") return "Baja";
  if (value === "alta") return "Alta";
  if (value === "urgente") return "Urgente";
  return value == null ? "—" : String(value);
}

const TAREA_ESTADO_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_proceso", label: "En proceso" },
  { value: "completada", label: "Completada" },
  { value: "bloqueada", label: "Bloqueada" },
] as const;

const TAREA_ESTADO_TONE: Record<
  string,
  { dot: string; chip: string; ring: string }
> = {
  pendiente: {
    dot: "bg-slate-400",
    chip: "border-slate-200 bg-slate-50 text-slate-600",
    ring: "ring-slate-200/60",
  },
  en_proceso: {
    dot: "bg-amber-500",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    ring: "ring-amber-200/60",
  },
  completada: {
    dot: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    ring: "ring-emerald-200/60",
  },
  bloqueada: {
    dot: "bg-rose-500",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    ring: "ring-rose-200/60",
  },
};

function tareaEstadoLabel(value: unknown): string {
  const match = TAREA_ESTADO_OPTIONS.find((opt) => opt.value === value);
  return match ? match.label : "—";
}

function formatFechaRelativa(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "hace instantes";
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `hace ${days} d`;
  if (days < 30) return `hace ${Math.round(days / 7)} sem`;
  if (days < 365) return `hace ${Math.round(days / 30)} m`;
  return `hace ${Math.round(days / 365)} a`;
}

const IconTareaUser = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconTareaRefresh = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </svg>
);

const IconTareaCalendar = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconPencil = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const IconTrash = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconSpinner = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="animate-spin"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

export type ProyectoDetalleInnerProps = {
  projectId: string;
  variant: "page" | "modal";
  onClose?: () => void;
  onProjectUpdated?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  dataSchema: string;
};

export default function ProyectoDetalleInner({
  projectId,
  variant,
  onClose,
  onProjectUpdated,
  onDirtyChange,
  dataSchema,
}: ProyectoDetalleInnerProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const tabUrl = variant === "page" ? normalizeTab(sp?.get("tab")) : null;
  const [modalTab, setModalTab] = useState<TabId>("resumen");

  const tab = variant === "page" ? (tabUrl ?? "resumen") : modalTab;

  const setTab = useCallback(
    (t: TabId) => {
      if (variant === "modal") setModalTab(t);
      else router.replace(`/dashboard/proyectos/${projectId}?tab=${t}`);
    },
    [variant, router, projectId]
  );

  const [data, setData] = useState<DetalleResp | null>(null);
  const [estados, setEstados] = useState<{ id: string; nombre: string }[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioActivo[]>([]);
  const [modulosCatalogo, setModulosCatalogo] = useState<ModuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [comTexto, setComTexto] = useState("");
  const [comEditandoId, setComEditandoId] = useState<string | null>(null);
  const [comEditTexto, setComEditTexto] = useState("");
  const [comActionId, setComActionId] = useState<string | null>(null);
  const [tareaTitulo, setTareaTitulo] = useState("");
  const [tareaDescripcion, setTareaDescripcion] = useState("");
  const [tareaResponsableId, setTareaResponsableId] = useState("");
  const [tareaFechaLimite, setTareaFechaLimite] = useState("");
  const [tareaSaving, setTareaSaving] = useState(false);

  const [briefForm, setBriefForm] = useState<Record<string, string>>({});
  const [briefLists, setBriefLists] = useState<Record<string, string[]>>({});
  const [saasForm, setSaasForm] = useState<ProyectoSaasBriefForm>({
    empresa_nombre: "",
    whatsapp_contacto: "",
    observaciones: "",
    modulos_necesarios: [],
  });
  const [responsableTecnicoId, setResponsableTecnicoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [datosSnapshot, setDatosSnapshot] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}`, { cache: "no-store" });
    const j = (await res.json()) as { success?: boolean; data?: DetalleResp; error?: string };
    if (!res.ok || !j.success || !j.data) {
      setErr(j.error ?? "Error al cargar");
      setLoading(false);
      return;
    }
    setData(j.data);
    const p = j.data.proyecto;
    const merged = coalesceBriefData(p.brief_data);
    const saas = readSaasBriefData(p.brief_data);
    const lists: Record<string, string[]> = {};
    for (const f of PROYECTO_DATOS_BRIEF_FIELDS) {
      if (f.kind === "url_list") {
        lists[f.key] = readBriefUrlList(p.brief_data, f.key);
      }
    }
    setBriefForm(merged);
    setBriefLists(lists);
    setSaasForm(saas);
    setResponsableTecnicoId(typeof p.responsable_tecnico_id === "string" ? p.responsable_tecnico_id : "");
    setObservaciones(typeof p.observaciones_comerciales === "string" ? p.observaciones_comerciales : "");
    setDatosSnapshot(JSON.stringify({
      bf: merged,
      bl: lists,
      saas,
      responsable_tecnico_id: typeof p.responsable_tecnico_id === "string" ? p.responsable_tecnico_id : "",
      obs: typeof p.observaciones_comerciales === "string" ? p.observaciones_comerciales : "",
    }));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mantengo una ref a `load` para que las suscripciones de Realtime no se re-creen
  // en cada render. El callback estable adentro del channel siempre llama al último.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Realtime: cualquier cambio en las 5 tablas del proyecto dispara re-fetch.
  // Filtramos por proyecto_id para no recibir eventos de otros proyectos.
  useEffect(() => {
    if (!projectId || !dataSchema) return;
    const sb = createBrowserClientForSchema(dataSchema);
    const filtro = `proyecto_id=eq.${projectId}`;

    const channel = sb
      .channel(`proyecto-detalle:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyectos", filter: `id=eq.${projectId}` },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_tareas", filter: filtro },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_comentarios", filter: filtro },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_archivos", filter: filtro },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_estado_historial", filter: filtro },
        () => void loadRef.current?.()
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [projectId, dataSchema]);

  useEffect(() => {
    if (variant !== "page" || !projectId) return;
    const raw = sp?.get("tab");
    if (raw === "brief") {
      router.replace(`/dashboard/proyectos/${projectId}?tab=datos`);
    }
  }, [variant, projectId, sp, router]);

  useEffect(() => {
    let c = false;
    (async () => {
      const [r, rUsers, rModulos] = await Promise.all([
        fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/modulos-catalogo", { cache: "no-store" }),
      ]);
      const j = (await r.json()) as { success?: boolean; data?: { id: string; nombre: string }[] };
      const jUsers = (await rUsers.json()) as { usuarios?: UsuarioActivo[] };
      const jModulos = (await rModulos.json()) as { success?: boolean; data?: ModuloCatalogo[] };
      if (!c && j.success && j.data) setEstados(j.data);
      if (!c) setUsuarios(jUsers.usuarios ?? []);
      if (!c && jModulos.success && jModulos.data) setModulosCatalogo(jModulos.data);
    })();
    return () => {
      c = true;
    };
  }, []);

  const datosDirty = useMemo(() => {
    const cur = JSON.stringify({
      bf: briefForm,
      bl: briefLists,
      saas: saasForm,
      responsable_tecnico_id: responsableTecnicoId,
      obs: observaciones,
    });
    return datosSnapshot !== "" && cur !== datosSnapshot;
  }, [briefForm, briefLists, saasForm, responsableTecnicoId, observaciones, datosSnapshot]);

  useEffect(() => {
    onDirtyChange?.(datosDirty);
  }, [datosDirty, onDirtyChange]);

  async function guardarDatos() {
    const proyecto = data?.proyecto;
    if (!proyecto) return;
    const tipoCodigo = proyecto.proyecto_tipo?.codigo ?? "";
    const briefMerged =
      tipoCodigo === "saas"
        ? applySaasFormToExisting(proyecto.brief_data, saasForm)
        : applyBriefFormToExisting(proyecto.brief_data, briefForm, briefLists);
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief_data: briefMerged,
        responsable_tecnico_id: responsableTecnicoId || null,
        observaciones_comerciales: observaciones.trim() === "" ? null : observaciones.trim(),
      }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) {
      setErr(j.error ?? "No se pudo guardar");
      return;
    }
    await load();
    onProjectUpdated?.();
  }

  async function agregarComentario(e: React.FormEvent) {
    e.preventDefault();
    if (!comTexto.trim()) return;
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentario: comTexto.trim() }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) {
      setErr(j.error ?? "Error");
      return;
    }
    setComTexto("");
    await load();
    onProjectUpdated?.();
  }

  function iniciarEdicionComentario(cid: string, texto: string) {
    setComEditandoId(cid);
    setComEditTexto(texto);
  }

  function cancelarEdicionComentario() {
    setComEditandoId(null);
    setComEditTexto("");
  }

  async function guardarEdicionComentario(cid: string) {
    const texto = comEditTexto.trim();
    if (!texto || comActionId) return;
    setComActionId(cid);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/comentarios/${cid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comentario: texto }),
        }
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      cancelarEdicionComentario();
      await load();
      onProjectUpdated?.();
    } finally {
      setComActionId(null);
    }
  }

  async function eliminarComentario(cid: string) {
    if (comActionId) return;
    const ok = window.confirm("¿Eliminar este comentario? Esta acción no se puede deshacer.");
    if (!ok) return;
    setComActionId(cid);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/comentarios/${cid}`,
        { method: "DELETE" }
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      if (comEditandoId === cid) cancelarEdicionComentario();
      await load();
      onProjectUpdated?.();
    } finally {
      setComActionId(null);
    }
  }

  async function agregarTarea(e: React.FormEvent) {
    e.preventDefault();
    const titulo = tareaTitulo.trim();
    if (!titulo || tareaSaving) return;
    setTareaSaving(true);
    const payload: Record<string, unknown> = { titulo };
    const descripcion = tareaDescripcion.trim();
    if (descripcion) payload.descripcion = descripcion;
    if (tareaResponsableId) payload.responsable_id = tareaResponsableId;
    if (tareaFechaLimite) payload.fecha_limite = tareaFechaLimite;
    try {
      const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/tareas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      setTareaTitulo("");
      setTareaDescripcion("");
      setTareaResponsableId("");
      setTareaFechaLimite("");
      await load();
      onProjectUpdated?.();
    } finally {
      setTareaSaving(false);
    }
  }

  function limpiarFormularioTarea() {
    setTareaTitulo("");
    setTareaDescripcion("");
    setTareaResponsableId("");
    setTareaFechaLimite("");
  }

  async function patchTarea(tareaId: string, patch: Record<string, unknown>) {
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) setErr(j.error ?? "Error");
    else {
      await load();
      onProjectUpdated?.();
    }
  }

  async function cambiarEstado(estadoId: string) {
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/cambiar-estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_id: estadoId }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) setErr(j.error ?? "Error");
    else {
      await load();
      onProjectUpdated?.();
    }
  }

  const slaFmt = useMemo(() => {
    const s = data?.sla as { segundos_interno?: number; segundos_cliente?: number; segundos_pausado?: number } | undefined;
    if (!s) return null;
    const fmt = (sec?: number) =>
      sec == null ? "—" : `${Math.round((sec / 3600) * 10) / 10} h`;
    return {
      interno: fmt(s.segundos_interno),
      cliente: fmt(s.segundos_cliente),
      pausado: fmt(s.segundos_pausado),
    };
  }, [data?.sla]);

  const proyecto = data?.proyecto;
  const codigoTipo = proyecto?.proyecto_tipo?.codigo ?? "";
  const esWeb = codigoTipo === "web";
  const esSaas = codigoTipo === "saas";
  const briefCoerced = coalesceBriefData(proyecto?.brief_data);
  const saasModuloIds = saasForm.modulos_necesarios
    .map((modulo) => modulo.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const updateSaasField = <K extends keyof ProyectoSaasBriefForm>(key: K, value: ProyectoSaasBriefForm[K]) => {
    setSaasForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateSaasModulos = (ids: string[]) => {
    const snapshots: ProyectoModuloSnapshot[] = modulosCatalogo
      .filter((modulo) => ids.includes(modulo.id))
      .map((modulo) => ({ id: modulo.id, slug: modulo.slug, nombre: modulo.nombre }));
    updateSaasField("modulos_necesarios", snapshots);
  };

  if (!projectId) return null;
  if (loading && !data) {
    return <div className="p-8 text-sm text-slate-500">Cargando…</div>;
  }
  if (err && !data) return <div className="p-8 text-sm text-rose-600">{err}</div>;
  if (!data || !proyecto) return null;

  const panelCls =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
  const labelCls = "text-xs font-medium uppercase tracking-wide text-slate-500";
  const inputCls =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";

  const rootClass =
    variant === "modal"
      ? "flex h-full min-h-0 flex-col bg-white"
      : "mx-auto max-w-5xl space-y-6 p-6";

  return (
    <div className={rootClass}>
      {variant === "page" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/proyectos"
            className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Kanban
          </Link>
        </div>
      ) : null}

      <div
        className={
          variant === "modal"
            ? "flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-white via-white to-[#4FAEB2]/5 px-6 pb-5 pt-6"
            : "flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4"
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
              Proyecto
            </p>
          </div>
          <h1
            id={variant === "modal" ? "proyecto-detalle-titulo" : undefined}
            className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900"
          >
            {String(proyecto.titulo ?? "")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {(proyecto as { proyecto_tipo?: { nombre?: string } }).proyecto_tipo?.nombre ?? "—"} ·{" "}
            <span className="text-slate-600">Avance {data.avance_pct ?? "—"}%</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FancySelect
            className="min-w-[180px]"
            ariaLabel="Cambiar estado del proyecto"
            value={String(proyecto.estado_id ?? "")}
            onChange={(v) => void cambiarEstado(v)}
            options={estados.map((e) => ({ value: e.id, label: e.nombre }))}
          />
          {variant === "modal" ? (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
              onClick={() => onClose?.()}
            >
              Cerrar
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
              onClick={() => router.push("/dashboard/proyectos")}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      {err ? (
        <div
          className={
            variant === "modal"
              ? "mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-900"
              : "rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-900"
          }
        >
          {err}
        </div>
      ) : null}

      <div
        className={
          variant === "modal"
            ? "flex flex-wrap gap-1.5 border-b border-slate-100 bg-white px-6 pb-3 pt-4"
            : "flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
        }
      >
        {TAB_IDS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91] shadow-sm"
                  : "border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      <div
        className={
          variant === "modal"
            ? "min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-6 py-5"
            : ""
        }
      >
        {tab === "resumen" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className={panelCls}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">Resumen del proyecto</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Cliente</dt>
                  <dd className="text-right font-medium text-slate-900">{clienteNombre(proyecto)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Vendedor / comercial</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {(proyecto as { responsable_comercial?: { nombre?: string } }).responsable_comercial?.nombre ?? "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Técnico responsable</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {(proyecto as { responsable_tecnico?: { nombre?: string } }).responsable_tecnico?.nombre ?? "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Fecha prometida</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {proyecto.fecha_prometida != null && String(proyecto.fecha_prometida).trim() !== ""
                      ? formatFechaPyFull(String(proyecto.fecha_prometida))
                      : "—"}
                  </dd>
                </div>
                {esSaas ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Empresa SaaS / ERP</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.empresa_nombre.trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Módulos necesarios</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.modulos_necesarios.length > 0
                          ? saasForm.modulos_necesarios.map((m) => m.nombre).join(", ")
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>WhatsApp contacto</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.whatsapp_contacto.trim() || "—"}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Nombre de la marca</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {(briefCoerced.marca || "").trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Dominio a usar</dt>
                      <dd className="max-w-[55%] break-all text-right font-medium text-slate-900">
                        {(briefCoerced.dominio_usar || "").trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Tipo de web</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {(briefCoerced.tipo_web || "").trim() || "—"}
                      </dd>
                    </div>
                  </>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className={labelCls}>Prioridad</dt>
                  <dd className="text-right font-medium text-slate-900">{prioridadLabel(proyecto.prioridad)}</dd>
                </div>
              </dl>
            </div>
            <div className={panelCls}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">SLA acumulado</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Tiempo interno</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.interno}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Espera cliente</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.cliente}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Pausado</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.pausado}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {tab === "datos" ? (
          <div className={`space-y-5 ${panelCls}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                  <h2 className="text-sm font-semibold text-slate-900">Datos del proyecto</h2>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Editá los campos guardados en el proyecto. Los datos previos se conservan al guardar.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                disabled={!datosDirty}
                onClick={() => void guardarDatos()}
              >
                Guardar datos
              </button>
            </div>

            {esWeb ? (
              <p className="rounded-lg bg-[#4FAEB2]/8 px-3 py-2 text-xs text-[#3F8E91]">
                Tipo &quot;Proyecto Web&quot;: campos adicionales del brief comercial.
              </p>
            ) : null}
            {esSaas ? (
              <p className="rounded-lg bg-[#4FAEB2]/8 px-3 py-2 text-xs text-[#3F8E91]">
                Tipo &quot;SaaS / ERP&quot;: snapshot de módulos requeridos, sin activar permisos ni módulos reales.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="block text-sm">
                <span className={labelCls}>Técnico responsable</span>
                <div className="mt-1.5">
                  <FancySelect
                    ariaLabel="Técnico responsable"
                    placeholder="—"
                    value={responsableTecnicoId}
                    onChange={setResponsableTecnicoId}
                    options={[
                      { value: "", label: "—" },
                      ...usuarios.map((u) => ({
                        value: u.id,
                        label: u.nombre || u.email || u.id.slice(0, 8),
                      })),
                    ]}
                  />
                </div>
              </div>
              {esWeb ? (
                <label className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Observaciones comerciales</span>
                  <textarea
                    className={`${inputCls} min-h-[88px]`}
                    rows={3}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Detalle adicional negociado con el cliente…"
                  />
                </label>
              ) : null}
            </div>

            {esWeb ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {PROYECTO_DATOS_BRIEF_FIELDS.map((f) => {
                  if (f.kind === "checkbox") {
                    return (
                      <label
                        key={f.key}
                        className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors hover:border-[#4FAEB2]/60"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
                          checked={briefForm[f.key] === "1"}
                          onChange={(e) =>
                            setBriefForm((b) => ({ ...b, [f.key]: e.target.checked ? "1" : "" }))
                          }
                        />
                        {f.label}
                      </label>
                    );
                  }
                  if (f.kind === "url_list") {
                    const urls = briefLists[f.key] ?? [];
                    const items = urls.length > 0 ? urls : [""];
                    return (
                      <div key={f.key} className="block text-sm sm:col-span-2">
                        <span className={labelCls}>{f.label}</span>
                        <div className="mt-1.5 space-y-2">
                          {items.map((url, idx) => (
                            <div key={idx} className="flex items-stretch gap-2">
                              <input
                                type="url"
                                className={`${inputCls} mt-0 flex-1`}
                                placeholder={f.placeholder ?? "https://..."}
                                value={url}
                                onChange={(e) => {
                                  const next = [...items];
                                  next[idx] = e.target.value;
                                  setBriefLists((b) => ({ ...b, [f.key]: next }));
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const next = items.filter((_, i) => i !== idx);
                                  setBriefLists((b) => ({ ...b, [f.key]: next }));
                                }}
                                disabled={items.length === 1 && !items[0]}
                                aria-label={`Eliminar link ${idx + 1}`}
                                title="Eliminar"
                                className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-400"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  aria-hidden="true"
                                >
                                  <line x1="18" y1="6" x2="6" y2="18" />
                                  <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setBriefLists((b) => ({
                                ...b,
                                [f.key]: [...(b[f.key] ?? []), ""],
                              }))
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#4FAEB2]/40 bg-[#4FAEB2]/5 px-3 py-2 text-xs font-semibold text-[#3F8E91] transition-colors hover:border-[#4FAEB2] hover:bg-[#4FAEB2]/10"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Agregar otro link
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <label key={f.key} className={`block text-sm ${f.key === "secciones" ? "sm:col-span-2" : ""}`}>
                      <span className={labelCls}>{f.label}</span>
                      <input
                        className={inputCls}
                        placeholder={f.placeholder}
                        value={briefForm[f.key] ?? ""}
                        onChange={(e) => setBriefForm((b) => ({ ...b, [f.key]: e.target.value }))}
                      />
                    </label>
                  );
                })}
              </div>
            ) : null}

            {esSaas ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className={labelCls}>Nombre de la empresa</span>
                  <input
                    className={inputCls}
                    value={saasForm.empresa_nombre}
                    onChange={(e) => updateSaasField("empresa_nombre", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className={labelCls}>WhatsApp contacto</span>
                  <input
                    className={inputCls}
                    placeholder="+595..."
                    value={saasForm.whatsapp_contacto}
                    onChange={(e) => updateSaasField("whatsapp_contacto", e.target.value)}
                  />
                </label>
                <div className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Módulos necesarios</span>
                  <div className="mt-1.5">
                    <ProyectoModuloSelector
                      modulos={modulosCatalogo}
                      selectedIds={saasModuloIds}
                      onChange={updateSaasModulos}
                    />
                  </div>
                </div>
                <label className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Observaciones</span>
                  <textarea
                    className={`${inputCls} min-h-[88px]`}
                    rows={3}
                    value={saasForm.observaciones}
                    onChange={(e) => updateSaasField("observaciones", e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {Object.keys(briefCoerced).length === 0 &&
            !observaciones.trim() ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Todavía no hay datos cargados. Completá el formulario y guardá.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "tareas" ? (
          <div className="space-y-4">
            <div className={`space-y-4 ${panelCls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Nueva tarea</h2>
                    <p className="text-xs text-slate-500">
                      Sumá una tarea con todo el contexto: descripción, responsable y fecha límite.
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                  {(data.tareas ?? []).length} tarea{(data.tareas ?? []).length === 1 ? "" : "s"}
                </span>
              </div>
              <form onSubmit={agregarTarea} className="space-y-3">
                <label className="block">
                  <span className={labelCls}>Título de la tarea *</span>
                  <input
                    className={inputCls}
                    placeholder="Ej.: Diseñar wireframes para la landing"
                    value={tareaTitulo}
                    onChange={(e) => setTareaTitulo(e.target.value)}
                    maxLength={200}
                    required
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>Descripción / Contexto (opcional)</span>
                  <textarea
                    className={`${inputCls} min-h-[80px] resize-y`}
                    placeholder="Aclaraciones, criterios de aceptación, links útiles…"
                    rows={3}
                    value={tareaDescripcion}
                    onChange={(e) => setTareaDescripcion(e.target.value)}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="block">
                    <span className={labelCls}>Responsable (opcional)</span>
                    <div className="mt-1.5">
                      <FancySelect
                        ariaLabel="Responsable de la tarea"
                        placeholder="Sin asignar"
                        value={tareaResponsableId}
                        onChange={setTareaResponsableId}
                        options={[
                          { value: "", label: "Sin asignar" },
                          ...usuarios.map((u) => ({
                            value: u.id,
                            label: u.nombre || u.email || u.id.slice(0, 8),
                          })),
                        ]}
                      />
                    </div>
                  </div>
                  <label className="block">
                    <span className={labelCls}>Fecha límite (opcional)</span>
                    <input
                      type="date"
                      className={inputCls}
                      value={tareaFechaLimite}
                      onChange={(e) => setTareaFechaLimite(e.target.value)}
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={limpiarFormularioTarea}
                    disabled={
                      tareaSaving ||
                      (!tareaTitulo &&
                        !tareaDescripcion &&
                        !tareaResponsableId &&
                        !tareaFechaLimite)
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={tareaSaving || !tareaTitulo.trim()}
                    className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  >
                    {tareaSaving ? "Agregando…" : "Agregar tarea"}
                  </button>
                </div>
              </form>
            </div>

            <div className={`space-y-3 ${panelCls}`}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">Listado de tareas</h2>
              </div>
              <ul className="space-y-2.5">
                {(data.tareas ?? []).map((raw) => {
                  const t = raw as Record<string, unknown>;
                  const tid = String(t.id ?? "");
                  const estado = String(t.estado ?? "pendiente");
                  const tone = TAREA_ESTADO_TONE[estado] ?? TAREA_ESTADO_TONE.pendiente;
                  const descripcion =
                    typeof t.descripcion === "string" ? t.descripcion.trim() : "";
                  const fechaLimite =
                    typeof t.fecha_limite === "string" && t.fecha_limite.trim()
                      ? t.fecha_limite
                      : "";
                  const creadoPor =
                    (t.created_by_nombre as string | null | undefined) ?? "Usuario";
                  const creadoAt = t.created_at ? String(t.created_at) : "";
                  const cambioPor =
                    (t.status_changed_by_nombre as string | null | undefined) ?? null;
                  const cambioAt = t.status_changed_at
                    ? String(t.status_changed_at)
                    : "";
                  const huboCambioEstado =
                    Boolean(cambioAt) &&
                    Boolean(creadoAt) &&
                    new Date(cambioAt).getTime() - new Date(creadoAt).getTime() > 2000;
                  return (
                    <li
                      key={tid}
                      className={`rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md`}
                    >
                      <div className="flex flex-wrap items-start gap-2">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ${tone.dot} ${tone.ring}`}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm font-semibold ${
                              estado === "completada"
                                ? "text-slate-500 line-through"
                                : "text-slate-900"
                            }`}
                          >
                            {String(t.titulo ?? "")}
                          </p>
                          {descripcion ? (
                            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                              {descripcion}
                            </p>
                          ) : null}
                          {fechaLimite ? (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              <IconTareaCalendar />
                              Vence {formatFechaPyFull(fechaLimite).slice(0, 10)}
                            </p>
                          ) : null}
                        </div>
                        <FancySelect
                          size="sm"
                          className="min-w-[150px]"
                          ariaLabel="Estado de la tarea"
                          value={estado}
                          onChange={(v) => void patchTarea(tid, { estado: v })}
                          options={TAREA_ESTADO_OPTIONS.map((opt) => ({ ...opt }))}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                        <span
                          className="inline-flex items-center gap-1.5"
                          title={creadoAt ? formatFechaPyFull(creadoAt) : undefined}
                        >
                          <span className="text-slate-400">
                            <IconTareaUser />
                          </span>
                          <span>
                            Creada por{" "}
                            <span className="font-medium text-slate-700">{creadoPor}</span>
                            {creadoAt ? ` · ${formatFechaRelativa(creadoAt)}` : ""}
                          </span>
                        </span>
                        {huboCambioEstado ? (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tone.chip}`}
                            title={cambioAt ? formatFechaPyFull(cambioAt) : undefined}
                          >
                            <IconTareaRefresh />
                            <span>
                              {tareaEstadoLabel(estado)}
                              {cambioPor ? (
                                <>
                                  {" "}por{" "}
                                  <span className="font-medium">{cambioPor}</span>
                                </>
                              ) : null}
                              {cambioAt ? ` · ${formatFechaRelativa(cambioAt)}` : ""}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                            <IconTareaRefresh />
                            <span>Estado: {tareaEstadoLabel(estado)} (inicial)</span>
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {(data.tareas ?? []).length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Sin tareas registradas. Agregá la primera arriba.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : null}

        {tab === "comentarios" ? (
          <div className={`space-y-4 ${panelCls}`}>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Comentarios internos</h2>
            </div>
            <form onSubmit={agregarComentario} className="space-y-2">
              <textarea
                className={`${inputCls} min-h-[88px]`}
                rows={3}
                placeholder="Comentario interno"
                value={comTexto}
                onChange={(e) => setComTexto(e.target.value)}
              />
              <button
                type="submit"
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91]"
              >
                Publicar
              </button>
            </form>
            <ul className="space-y-3">
              {(data.comentarios ?? []).map((c) => {
                const cid = String(c.id ?? "");
                const autorId = String((c as { usuario_id?: string }).usuario_id ?? "");
                const esAutor =
                  !!data.current_user_id && autorId === data.current_user_id;
                const enEdicion = comEditandoId === cid;
                const enAccion = comActionId === cid;
                const textoOriginal = String(c.comentario ?? "");
                return (
                  <li
                    key={cid}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="font-medium text-[#4FAEB2]">
                        {String((c as { usuario_nombre?: string }).usuario_nombre ?? "")}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>{formatFechaPyFull(String(c.created_at ?? ""))}</span>
                      {esAutor && !enEdicion ? (
                        <span className="ml-auto flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => iniciarEdicionComentario(cid, textoOriginal)}
                            disabled={enAccion}
                            aria-label="Editar comentario"
                            title="Editar"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-[#4FAEB2]/10 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <IconPencil />
                          </button>
                          <button
                            type="button"
                            onClick={() => void eliminarComentario(cid)}
                            disabled={enAccion}
                            aria-label="Eliminar comentario"
                            title="Eliminar"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {enAccion ? <IconSpinner /> : <IconTrash />}
                          </button>
                        </span>
                      ) : null}
                    </div>
                    {enEdicion ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className={`${inputCls} min-h-[72px]`}
                          rows={3}
                          value={comEditTexto}
                          onChange={(e) => setComEditTexto(e.target.value)}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelarEdicionComentario}
                            disabled={enAccion}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => void guardarEdicionComentario(cid)}
                            disabled={enAccion || !comEditTexto.trim()}
                            className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                          >
                            {enAccion ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
                        {textoOriginal}
                      </div>
                    )}
                  </li>
                );
              })}
              {(data.comentarios ?? []).length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Aún no hay comentarios.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {tab === "archivos" ? (
          <div className={`${panelCls}`}>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Archivos del proyecto</h2>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Registro en base de datos listo; subida a almacenamiento en una siguiente iteración.
            </p>
            <ul className="mt-4 space-y-2">
              {(data.archivos ?? []).length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Sin archivos registrados.
                </li>
              ) : (
                (data.archivos ?? []).map((a) => (
                  <li
                    key={String(a.id)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-sm"
                  >
                    <span className="font-medium text-slate-800">{String(a.nombre ?? "")}</span>
                    <span className="text-xs text-slate-500">{formatFechaPyFull(String(a.created_at ?? ""))}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        {tab === "historial" ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Estado anterior</th>
                    <th className="px-3 py-2.5">Estado nuevo</th>
                    <th className="px-3 py-2.5">Tipo SLA</th>
                    <th className="px-3 py-2.5">Entrada</th>
                    <th className="px-3 py-2.5">Salida</th>
                    <th className="px-3 py-2.5">Duración</th>
                    <th className="px-3 py-2.5">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.historial ?? []).map((h) => {
                    const hr = h as Record<string, unknown>;
                    const ant =
                      (hr.estado_anterior_nombre as string | undefined) ??
                      (hr.estado_anterior_id ? String(hr.estado_anterior_id) : "—");
                    const nue =
                      (hr.estado_nuevo_nombre as string | undefined) ??
                      String(hr.estado_nuevo_id ?? "—");
                    const slaL =
                      (hr.tipo_sla_label as string | undefined) ??
                      String(hr.tipo_sla_snapshot ?? "—");
                    const usr = (hr.usuario_cambio_label as string | undefined) ?? "No registrado";
                    const dur =
                      (hr.duration_label as string | undefined) ??
                      (hr.duration_seconds != null ? String(hr.duration_seconds) + " s" : "—");
                    return (
                      <tr key={String(h.id)} className="text-slate-700 hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-xs">{ant}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-900">{nue}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{slaL}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">
                          {formatFechaPyFull(String(h.entered_at ?? ""))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">
                          {h.exited_at ? formatFechaPyFull(String(h.exited_at)) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{dur}</td>
                        <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500" title={usr}>
                          {usr}
                        </td>
                      </tr>
                    );
                  })}
                  {(data.historial ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-400">
                        Sin historial registrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
