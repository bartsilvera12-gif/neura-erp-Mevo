"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveProspecto } from "@/lib/crm/storage";
import type { EtapaFunnel } from "@/lib/crm/types";

// ── Estilos ────────────────────────────────────────────────────────────────────

const inputClass =
  "w-full border border-gray-300 rounded-lg px-4 py-3 outline-none focus:border-gray-500 transition-colors text-sm";
const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
      {children}
    </p>
  );
}

const ETAPAS: { value: EtapaFunnel; label: string }[] = [
  { value: "LEAD",        label: "Lead"        },
  { value: "CONTACTADO",  label: "Contactado"  },
  { value: "NEGOCIACION", label: "Negociación" },
];

// ── Componente ────────────────────────────────────────────────────────────────

export default function NuevoProspectoPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    empresa:               "",
    contacto:              "",
    email:                 "",
    telefono:              "",
    servicio:              "",
    valor_estimado:        "",
    etapa:                 "LEAD" as EtapaFunnel,
    proxima_accion:        "",
    fecha_proxima_accion:  "",
    responsable:           "",
    creado_por:            "",
  });

  const [error, setError] = useState<string | null>(null);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    setError(null);
    const { name, value } = e.target;
    const upper = ["empresa", "contacto", "responsable", "creado_por"];
    setForm((prev) => ({
      ...prev,
      [name]: upper.includes(name) ? value.toUpperCase() : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.empresa.trim())   return setError("La empresa es obligatoria.");
    if (!form.contacto.trim())  return setError("El contacto es obligatorio.");
    if (!form.servicio.trim())  return setError("El servicio o interés es obligatorio.");

    const valorNum = parseFloat(form.valor_estimado) || 0;

    const guardado = await saveProspecto({
      empresa:              form.empresa.trim().toUpperCase(),
      contacto:             form.contacto.trim().toUpperCase(),
      email:                form.email.trim()    || undefined,
      telefono:             form.telefono.trim() || undefined,
      servicio:             form.servicio.trim(),
      valor_estimado:       valorNum,
      etapa:                form.etapa,
      proxima_accion:       form.proxima_accion.trim()       || undefined,
      fecha_proxima_accion: form.fecha_proxima_accion        || undefined,
      responsable:          form.responsable.trim().toUpperCase() || undefined,
      creado_por:           form.creado_por.trim().toUpperCase()  || undefined,
    });

    if (guardado) router.push("/crm");
  }

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-3xl font-bold text-gray-800">Nuevo prospecto</h1>
        <p className="text-gray-600 text-sm mt-1">Registrá una nueva oportunidad en el funnel comercial</p>
      </div>

      <div className="bg-white rounded-xl shadow p-6 max-w-2xl">
        <form className="space-y-8" onSubmit={handleSubmit}>

          {/* ── Empresa y contacto ───────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Datos del prospecto</SectionTitle>

            <div>
              <label className={labelClass}>
                Empresa <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="empresa"
                value={form.empresa}
                onChange={handleChange}
                placeholder="Nombre de la empresa"
                className={`${inputClass} uppercase`}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Persona de contacto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="contacto"
                  value={form.contacto}
                  onChange={handleChange}
                  placeholder="Nombre y apellido"
                  className={`${inputClass} uppercase`}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  type="text"
                  name="telefono"
                  value={form.telefono}
                  onChange={handleChange}
                  placeholder="Ej: 0981-123456"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="contacto@empresa.com"
                className={inputClass}
              />
            </div>
          </section>

          {/* ── Oportunidad ──────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Oportunidad</SectionTitle>

            <div>
              <label className={labelClass}>
                Servicio / Producto de interés <span className="text-red-500">*</span>
              </label>
              <textarea
                name="servicio"
                value={form.servicio}
                onChange={handleChange}
                placeholder="Describí qué necesita el prospecto"
                rows={2}
                className={`${inputClass} resize-none`}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Valor estimado (Gs.)</label>
                <input
                  type="number"
                  name="valor_estimado"
                  value={form.valor_estimado}
                  onChange={handleChange}
                  placeholder="Ej: 15000000"
                  className={inputClass}
                  min={0}
                  step={1}
                />
              </div>
              <div>
                <label className={labelClass}>Etapa inicial</label>
                <select
                  name="etapa"
                  value={form.etapa}
                  onChange={handleChange}
                  className={inputClass}
                >
                  {ETAPAS.map((e) => (
                    <option key={e.value} value={e.value}>{e.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* ── Seguimiento ──────────────────────────────────────────────── */}
          <section className="space-y-4">
            <SectionTitle>Seguimiento</SectionTitle>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Próxima acción</label>
                <input
                  type="text"
                  name="proxima_accion"
                  value={form.proxima_accion}
                  onChange={handleChange}
                  placeholder="Ej: Enviar propuesta"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Fecha próxima acción</label>
                <input
                  type="date"
                  name="fecha_proxima_accion"
                  value={form.fecha_proxima_accion}
                  onChange={handleChange}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Responsable</label>
                <input
                  type="text"
                  name="responsable"
                  value={form.responsable}
                  onChange={handleChange}
                  placeholder="Ej: JUAN PÉREZ"
                  className={`${inputClass} uppercase`}
                />
              </div>
              <div>
                <label className={labelClass}>Creado por</label>
                <input
                  type="text"
                  name="creado_por"
                  value={form.creado_por}
                  onChange={handleChange}
                  placeholder="Ej: MARIA LOPEZ"
                  className={`${inputClass} uppercase`}
                />
              </div>
            </div>
          </section>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <span>⚠</span>
              <span className="font-medium">{error}</span>
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              className="bg-gray-900 text-white px-6 py-3 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Guardar prospecto
            </button>
            <button
              type="button"
              onClick={() => router.push("/crm")}
              className="border border-gray-300 px-6 py-3 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>

        </form>
      </div>

    </div>
  );
}
