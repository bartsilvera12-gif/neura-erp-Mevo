"use client";

import { useState } from "react";

function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Asuncion" });
}

export default function ComprobantesDelDiaClient() {
  const [fecha, setFecha] = useState<string>(todayYmd());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function descargar() {
    if (!fecha) {
      setErr("Elegí una fecha.");
      return;
    }
    setErr(null);
    setOk(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/sorteos/comprobantes-del-dia?fecha=${encodeURIComponent(fecha)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comprobantes-${fecha}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOk(`Descargado comprobantes-${fecha}.xlsx`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <header>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Sorteos
          </span>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Comprobantes del día
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Descargá un Excel con todos los comprobantes recibidos por el bot en la fecha elegida.
            Sirve para conciliar contra el extracto del banco.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              <span className="font-semibold uppercase tracking-[0.12em] text-slate-500">
                Fecha
              </span>
              <input
                type="date"
                value={fecha}
                max={todayYmd()}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
              />
            </label>
            <div className="flex flex-col justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={descargar}
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91] disabled:opacity-50"
              >
                {busy ? "Descargando…" : "Descargar Excel"}
              </button>
            </div>
          </div>

          {err ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {err}
            </div>
          ) : null}
          {ok ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {ok}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Qué columnas trae el Excel
          </h2>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li><strong>Hora</strong>: la hora en que el bot recibió y validó el comprobante (zona Paraguay).</li>
            <li><strong>Monto</strong>: el monto que detectó el OCR.</li>
            <li><strong>Cliente</strong>: el nombre + apellido que la persona <em>cargó en el bot al comprar</em>. Si todavía no lo cargó, se usa el nombre de agenda de WhatsApp.</li>
            <li><strong>Cédula</strong> y <strong>Ciudad</strong>: lo que ingresó en el bot al comprar (si lo llegó a cargar).</li>
            <li><strong>Teléfono</strong> y <strong>Nombre en agenda WhatsApp</strong>: dato de contacto crudo desde WhatsApp.</li>
            <li><strong>Titular (según OCR)</strong>: nombre del receptor que aparece en el comprobante (dueño de la cuenta destino).</li>
            <li><strong>Estado</strong> y <strong>motivo</strong>: si fue aprobado, rechazado, pendiente de revisión, etc.</li>
            <li><strong>Banco</strong>, <strong>Nº comprobante</strong>, <strong>Fecha y hora en el comprobante</strong>: datos leídos por OCR del propio comprobante.</li>
            <li><strong>URL del comprobante</strong>: link directo a la imagen guardada.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
