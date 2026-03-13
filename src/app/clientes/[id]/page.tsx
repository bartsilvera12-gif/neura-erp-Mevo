"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  addNotaCliente,
  clienteNombre,
  deleteCliente,
  getCliente,
  getNotasCliente,
  toggleEstado,
  updateCliente,
} from "@/lib/clientes/storage";
import type { Cliente, NotaCliente } from "@/lib/clientes/types";

// ── Estilos ────────────────────────────────────────────────────────────────────

const inputClass =
  "w-full border border-gray-300 rounded-lg px-4 py-2.5 outline-none focus:border-gray-500 transition-colors text-sm";
const labelClass = "block text-xs font-medium text-gray-500 mb-1";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
      {children}
    </p>
  );
}

// ── Tipos de pestaña ──────────────────────────────────────────────────────────

type TabId = "informacion" | "estado_cuenta" | "suscripciones" | "proyectos" | "actividad" | "notas";

const TABS: { id: TabId; label: string }[] = [
  { id: "informacion",   label: "Información"      },
  { id: "estado_cuenta", label: "Estado de cuenta" },
  { id: "suscripciones", label: "Suscripciones"    },
  { id: "proyectos",     label: "Proyectos"         },
  { id: "actividad",     label: "Actividad"         },
  { id: "notas",         label: "Notas"             },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return ""; }
}

function formatFechaHora(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch { return ""; }
}

// ── Placeholder para pestañas futuras ─────────────────────────────────────────

function PlaceholderTab({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-5xl mb-4">{icon}</span>
      <h3 className="text-base font-semibold text-gray-600 mb-2">{title}</h3>
      <p className="text-sm text-gray-400 max-w-xs">{desc}</p>
      <span className="mt-5 text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full">Próximamente</span>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  if (!params) return null;
  const id = params.id as string;

  const [cliente,   setCliente]   = useState<Cliente | null>(null);
  const [notFound,  setNotFound]  = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("informacion");
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);

  // Estados del formulario de información
  const [form, setForm] = useState({
    tipo_cliente:        "empresa" as Cliente["tipo_cliente"],
    empresa:             "",
    nombre_contacto:     "",
    ruc:                 "",
    documento:           "",
    telefono:            "",
    telefono_secundario: "",
    email:               "",
    email_secundario:    "",
    direccion:           "",
    ciudad:              "",
    pais:                "",
    sitio_web:           "",
    instagram:           "",
    linkedin:            "",
    categoria_cliente:   "",
    industria:           "",
    valor_cliente:       "",
    condicion_pago:      "",
    moneda_preferida:    "GS" as "GS" | "USD",
    vendedor_asignado:   "",
    estado:              "activo" as Cliente["estado"],
  });

  const [formError, setFormError] = useState<string | null>(null);

  // Estados de notas
  const [nuevaNota,     setNuevaNota]     = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const notaRef = useRef<HTMLTextAreaElement>(null);

  async function cargar() {
    const c = await getCliente(id);
    if (!c) { setNotFound(true); return; }
    c.notas = await getNotasCliente(id);
    setCliente(c);
    setForm({
      tipo_cliente:        c.tipo_cliente,
      empresa:             c.empresa             ?? "",
      nombre_contacto:     c.nombre_contacto,
      ruc:                 c.ruc                 ?? "",
      documento:           c.documento           ?? "",
      telefono:            c.telefono            ?? "",
      telefono_secundario: c.telefono_secundario ?? "",
      email:               c.email               ?? "",
      email_secundario:    c.email_secundario    ?? "",
      direccion:           c.direccion           ?? "",
      ciudad:              c.ciudad              ?? "",
      pais:                c.pais                ?? "",
      sitio_web:           c.sitio_web           ?? "",
      instagram:           c.instagram           ?? "",
      linkedin:            c.linkedin            ?? "",
      categoria_cliente:   c.categoria_cliente   ?? "",
      industria:           c.industria           ?? "",
      valor_cliente:       c.valor_cliente != null ? String(c.valor_cliente) : "",
      condicion_pago:      c.condicion_pago      ?? "",
      moneda_preferida:    c.moneda_preferida    ?? "GS",
      vendedor_asignado:   c.vendedor_asignado   ?? "",
      estado:              c.estado,
    });
  }

  useEffect(() => { if (id) cargar(); else setNotFound(true); }, [id]);

  const upper = ["empresa", "nombre_contacto", "ciudad", "pais", "categoria_cliente", "industria", "vendedor_asignado", "condicion_pago"];

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setFormError(null);
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: upper.includes(name) ? value.toUpperCase() : value,
    }));
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.nombre_contacto.trim())                             return setFormError("El contacto es obligatorio.");
    if (form.tipo_cliente === "empresa" && !form.empresa.trim())  return setFormError("La razón social es obligatoria para empresas.");

    await updateCliente(id, {
      tipo_cliente:        form.tipo_cliente,
      empresa:             form.tipo_cliente === "empresa" ? form.empresa.trim().toUpperCase() : undefined,
      nombre_contacto:     form.nombre_contacto.trim().toUpperCase(),
      ruc:                 form.ruc.trim()                 || undefined,
      documento:           form.documento.trim()           || undefined,
      telefono:            form.telefono.trim()            || undefined,
      telefono_secundario: form.telefono_secundario.trim() || undefined,
      email:               form.email.trim()               || undefined,
      email_secundario:    form.email_secundario.trim()    || undefined,
      direccion:           form.direccion.trim()           || undefined,
      ciudad:              form.ciudad.trim().toUpperCase()  || undefined,
      pais:                form.pais.trim().toUpperCase()    || undefined,
      sitio_web:           form.sitio_web.trim()           || undefined,
      instagram:           form.instagram.trim()           || undefined,
      linkedin:            form.linkedin.trim()            || undefined,
      categoria_cliente:   form.categoria_cliente.trim().toUpperCase() || undefined,
      industria:           form.industria.trim().toUpperCase()         || undefined,
      valor_cliente:       parseFloat(form.valor_cliente) || undefined,
      condicion_pago:      form.condicion_pago.trim().toUpperCase()    || undefined,
      moneda_preferida:    form.moneda_preferida,
      vendedor_asignado:   form.vendedor_asignado.trim().toUpperCase() || undefined,
      estado:              form.estado,
    });

    router.push("/clientes");
  }

  async function handleToggleEstado() {
    if (!cliente) return;
    const nuevo = cliente.estado === "activo" ? "inactivo" : "activo";
    await toggleEstado(id, nuevo);
    cargar();
  }

  async function handleEliminar() {
    await deleteCliente(id);
    router.push("/clientes");
  }

  async function handleAgregarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaNota.trim()) return;
    setGuardandoNota(true);
    await addNotaCliente(id, nuevaNota);
    setNuevaNota("");
    await cargar();
    setGuardandoNota(false);
    setTimeout(() => notaRef.current?.focus(), 0);
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Cliente no encontrado</h1>
        <button onClick={() => router.push("/clientes")} className="text-sm text-gray-500 underline">
          ← Volver a Clientes
        </button>
      </div>
    );
  }

  if (!cliente) return null;

  const nombre = clienteNombre(cliente);

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <button
        onClick={() => router.push("/clientes")}
        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
      >
        ← Clientes
      </button>

      {/* ── Panel resumen ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-gray-900 to-gray-700 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold text-white shrink-0 ${
                cliente.tipo_cliente === "empresa" ? "bg-blue-500/80" : "bg-violet-500/80"
              }`}>
                {nombre.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight">{nombre}</h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-gray-300 font-mono text-xs">{cliente.codigo_cliente}</span>
                  {cliente.ruc && (
                    <span className="text-gray-300 text-xs">RUC: {cliente.ruc}</span>
                  )}
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    cliente.estado === "activo"
                      ? "bg-green-500/20 text-green-300"
                      : "bg-gray-500/30 text-gray-300"
                  }`}>
                    ● {cliente.estado === "activo" ? "Activo" : "Inactivo"}
                  </span>
                  <span className="text-xs text-gray-400">
                    Cliente desde {formatFecha(cliente.created_at)}
                  </span>
                </div>
              </div>
            </div>
            {/* Acciones del header */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleToggleEstado}
                className="text-xs font-medium border border-white/20 text-white/80 hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                {cliente.estado === "activo" ? "Desactivar" : "Activar"}
              </button>
              <button
                onClick={() => setConfirmarEliminar(true)}
                className="text-red-300 hover:text-red-200 hover:bg-red-900/30 p-1.5 rounded-lg transition-colors"
                title="Eliminar cliente"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Estadísticas rápidas */}
        <div className="grid grid-cols-4 divide-x divide-gray-100 border-t border-gray-100">
          {[
            { label: "Origen",      value: cliente.origen                                   },
            { label: "Condición",   value: cliente.condicion_pago  ?? "—"                   },
            { label: "Moneda",      value: cliente.moneda_preferida ?? "GS"                 },
            { label: "Vendedor",    value: cliente.vendedor_asignado ?? "—"                 },
          ].map((item) => (
            <div key={item.label} className="px-5 py-3">
              <p className="text-xs text-gray-400">{item.label}</p>
              <p className="text-sm font-semibold text-gray-700 mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmación de eliminación */}
      {confirmarEliminar && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700 font-medium">¿Eliminar permanentemente este cliente?</p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleEliminar}
              className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-700"
            >
              Sí, eliminar
            </button>
            <button
              onClick={() => setConfirmarEliminar(false)}
              className="border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-xs hover:bg-red-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Pestañas ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Tab nav */}
        <div className="border-b border-gray-200 flex overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                activeTab === tab.id
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              } ${tab.id === "notas" && cliente.notas.length > 0 ? "relative" : ""}`}
            >
              {tab.label}
              {tab.id === "notas" && cliente.notas.length > 0 && (
                <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {cliente.notas.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">

          {/* ── INFORMACIÓN ─────────────────────────────────────────────── */}
          {activeTab === "informacion" && (
            <form onSubmit={handleGuardar} className="space-y-8 max-w-2xl">

              {/* Tipo */}
              <section className="space-y-4">
                <SectionTitle>Datos de identificación</SectionTitle>

                <div>
                  <label className={labelClass}>Tipo de cliente</label>
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden w-fit">
                    {(["empresa", "persona"] as Cliente["tipo_cliente"][]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, tipo_cliente: t }))}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                          form.tipo_cliente === t ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {t === "empresa" ? "Empresa" : "Persona"}
                      </button>
                    ))}
                  </div>
                </div>

                {form.tipo_cliente === "empresa" && (
                  <div>
                    <label className={labelClass}>Razón social</label>
                    <input type="text" name="empresa" value={form.empresa} onChange={handleChange} className={`${inputClass} uppercase`} />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>{form.tipo_cliente === "empresa" ? "Persona de contacto" : "Nombre completo"}</label>
                    <input type="text" name="nombre_contacto" value={form.nombre_contacto} onChange={handleChange} className={`${inputClass} uppercase`} required />
                  </div>
                  <div>
                    <label className={labelClass}>{form.tipo_cliente === "empresa" ? "RUC" : "CI / Documento"}</label>
                    {form.tipo_cliente === "empresa" ? (
                      <input type="text" name="ruc" value={form.ruc} onChange={handleChange} className={inputClass} />
                    ) : (
                      <input type="text" name="documento" value={form.documento} onChange={handleChange} className={inputClass} />
                    )}
                  </div>
                </div>
              </section>

              {/* Contacto */}
              <section className="space-y-4">
                <SectionTitle>Contacto</SectionTitle>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Teléfono principal</label>
                    <input type="text" name="telefono" value={form.telefono} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Teléfono secundario</label>
                    <input type="text" name="telefono_secundario" value={form.telefono_secundario} onChange={handleChange} className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Email principal</label>
                    <input type="email" name="email" value={form.email} onChange={handleChange} className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Email secundario</label>
                    <input type="email" name="email_secundario" value={form.email_secundario} onChange={handleChange} className={inputClass} />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Dirección</label>
                  <input type="text" name="direccion" value={form.direccion} onChange={handleChange} className={inputClass} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Ciudad</label>
                    <input type="text" name="ciudad" value={form.ciudad} onChange={handleChange} className={`${inputClass} uppercase`} />
                  </div>
                  <div>
                    <label className={labelClass}>País</label>
                    <input type="text" name="pais" value={form.pais} onChange={handleChange} className={`${inputClass} uppercase`} />
                  </div>
                </div>
              </section>

              {/* Digital */}
              <section className="space-y-4">
                <SectionTitle>Presencia digital</SectionTitle>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Sitio web</label>
                    <input type="text" name="sitio_web" value={form.sitio_web} onChange={handleChange} placeholder="https://" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Instagram</label>
                    <input type="text" name="instagram" value={form.instagram} onChange={handleChange} placeholder="@usuario" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>LinkedIn</label>
                    <input type="text" name="linkedin" value={form.linkedin} onChange={handleChange} placeholder="URL o perfil" className={inputClass} />
                  </div>
                </div>
              </section>

              {/* Comercial */}
              <section className="space-y-4">
                <SectionTitle>Datos comerciales</SectionTitle>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Categoría</label>
                    <input type="text" name="categoria_cliente" value={form.categoria_cliente} onChange={handleChange} className={`${inputClass} uppercase`} />
                  </div>
                  <div>
                    <label className={labelClass}>Industria</label>
                    <input type="text" name="industria" value={form.industria} onChange={handleChange} className={`${inputClass} uppercase`} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelClass}>Condición de pago</label>
                    <input type="text" name="condicion_pago" value={form.condicion_pago} onChange={handleChange} className={`${inputClass} uppercase`} />
                  </div>
                  <div>
                    <label className={labelClass}>Moneda preferida</label>
                    <select
                      name="moneda_preferida"
                      value={form.moneda_preferida}
                      onChange={(e) => setForm((p) => ({ ...p, moneda_preferida: e.target.value as "GS" | "USD" }))}
                      className={inputClass}
                    >
                      <option value="GS">Guaraníes (GS)</option>
                      <option value="USD">Dólares (USD)</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Valor anual estimado (Gs.)</label>
                    <input type="number" name="valor_cliente" value={form.valor_cliente} onChange={handleChange} min={0} step={1} className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Vendedor asignado</label>
                    <input type="text" name="vendedor_asignado" value={form.vendedor_asignado} onChange={handleChange} className={`${inputClass} uppercase`} />
                  </div>
                  <div>
                    <label className={labelClass}>Estado</label>
                    <select
                      name="estado"
                      value={form.estado}
                      onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value as Cliente["estado"] }))}
                      className={inputClass}
                    >
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                    </select>
                  </div>
                </div>
              </section>

              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  <span>⚠</span><span className="font-medium">{formError}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  className="bg-gray-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                >
                  Guardar cambios
                </button>
              </div>
            </form>
          )}

          {/* ── ESTADO DE CUENTA ─────────────────────────────────────────── */}
          {activeTab === "estado_cuenta" && (
            <PlaceholderTab
              icon="📊"
              title="Estado de cuenta"
              desc="Aquí se mostrarán las facturas, compras y el historial de pagos del cliente."
            />
          )}

          {/* ── SUSCRIPCIONES ────────────────────────────────────────────── */}
          {activeTab === "suscripciones" && (
            <PlaceholderTab
              icon="🔄"
              title="Suscripciones"
              desc="Planes y suscripciones activas del cliente, fechas de renovación y estados de pago."
            />
          )}

          {/* ── PROYECTOS ────────────────────────────────────────────────── */}
          {activeTab === "proyectos" && (
            <PlaceholderTab
              icon="📁"
              title="Proyectos"
              desc="Proyectos en curso y finalizados asociados a este cliente, con etapas y responsables."
            />
          )}

          {/* ── ACTIVIDAD ────────────────────────────────────────────────── */}
          {activeTab === "actividad" && (
            <PlaceholderTab
              icon="🕐"
              title="Actividad"
              desc="Timeline completo de interacciones, cambios de estado, ventas y eventos del cliente."
            />
          )}

          {/* ── NOTAS ───────────────────────────────────────────────────── */}
          {activeTab === "notas" && (
            <div className="max-w-2xl space-y-6">
              <form onSubmit={handleAgregarNota}>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Nueva nota</label>
                <textarea
                  ref={notaRef}
                  value={nuevaNota}
                  onChange={(e) => setNuevaNota(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleAgregarNota(e as unknown as React.FormEvent);
                    }
                  }}
                  rows={3}
                  placeholder="Escribí una nota interna (Ctrl+Enter para guardar)..."
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-gray-500 transition-colors text-sm resize-none mb-3"
                />
                <button
                  type="submit"
                  disabled={!nuevaNota.trim() || guardandoNota}
                  className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Agregar nota
                </button>
              </form>

              {cliente.notas.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No hay notas registradas aún.</p>
              ) : (
                <div className="space-y-3">
                  {[...cliente.notas].reverse().map((nota: NotaCliente) => (
                    <div key={nota.id} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{nota.texto}</p>
                      <p className="text-xs text-gray-400 mt-2">{formatFechaHora(nota.fecha)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
