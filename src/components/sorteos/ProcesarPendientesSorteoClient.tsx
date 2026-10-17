"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const PROCESAR_URL = "/api/sorteos/procesar-pendientes";
/** Cuántas procesar por llamada (acotado para no chocar con el timeout del server). */
const CHUNK = 15;

type DryRunData = { total_pendientes: number };
type ProcesarData = {
  procesados: number;
  cerrados: number;
  pendientes_datos: number;
  pendientes_confirmacion: number;
  fallidos: number;
  total_restante: number;
  errores: { id: string; message: string }[];
};

type Acumulado = {
  cerrados: number;
  pendientes_datos: number;
  pendientes_confirmacion: number;
  fallidos: number;
};

async function postJson<T>(sorteoId: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetchWithSupabaseSession(PROCESAR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sorteo_id: sorteoId, ...body }),
  });
  const raw = await res.text();
  let json: { success?: boolean; data?: T; error?: string };
  try {
    json = JSON.parse(raw) as { success?: boolean; data?: T; error?: string };
  } catch {
    throw new Error(raw || `Error ${res.status}`);
  }
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || `Error ${res.status}`);
  }
  return json.data;
}

export default function ProcesarPendientesSorteoClient({ sorteoId }: { sorteoId: string }) {
  const [buscando, setBuscando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalPendiente, setTotalPendiente] = useState<number | null>(null);
  const [restante, setRestante] = useState<number | null>(null);
  const [acum, setAcum] = useState<Acumulado | null>(null);
  const [listo, setListo] = useState(false);

  async function buscar() {
    setError(null);
    setListo(false);
    setAcum(null);
    setBuscando(true);
    try {
      const data = await postJson<DryRunData>(sorteoId, { dry_run: true });
      setTotalPendiente(data.total_pendientes);
      setRestante(data.total_pendientes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar.");
    } finally {
      setBuscando(false);
    }
  }

  async function procesarTodas() {
    setError(null);
    setListo(false);
    setProcesando(true);
    const total: Acumulado = {
      cerrados: 0,
      pendientes_datos: 0,
      pendientes_confirmacion: 0,
      fallidos: 0,
    };
    setAcum({ ...total });
    try {
      // Bucle por tandas hasta que no queden más o una tanda no avance.
      // Límite de seguridad de iteraciones para no quedar en bucle infinito.
      for (let i = 0; i < 1000; i++) {
        const data = await postJson<ProcesarData>(sorteoId, { limit: CHUNK });
        total.cerrados += data.cerrados;
        total.pendientes_datos += data.pendientes_datos;
        total.pendientes_confirmacion += data.pendientes_confirmacion;
        total.fallidos += data.fallidos;
        setAcum({ ...total });
        setRestante(data.total_restante);
        if (data.errores.length > 0 && !error) {
          setError(`Algunos no se pudieron cerrar. Ej.: ${data.errores[0]?.message ?? ""}`);
        }
        // Cortamos si ya no quedan, o si esta tanda no procesó nada (evita bucle).
        if (data.total_restante <= 0 || data.procesados === 0) break;
      }
      setListo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo procesar.");
    } finally {
      setProcesando(false);
    }
  }

  const hayPendientes = (totalPendiente ?? 0) > 0;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-amber-900">
          Dar número a los que quedaron sin boleta
        </h2>
        <p className="text-xs text-amber-800 mt-1 max-w-2xl">
          Busca las compras de WhatsApp cuyo comprobante ya fue aprobado pero que{" "}
          <strong>quedaron sin número</strong> porque en su momento se habían agotado las boletas.
          Al procesarlas, a cada persona se le genera su número y se le{" "}
          <strong>reenvía el ticket por WhatsApp</strong> automáticamente. Ahora que ampliaste el
          límite, conviene correrlo.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-4 py-2" role="alert">
          {error}
        </div>
      )}

      {totalPendiente === null ? (
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={buscando}
          className="inline-flex items-center rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {buscando ? "Buscando…" : "Buscar compras pendientes"}
        </button>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-amber-900">
            {hayPendientes ? (
              <>
                Hay <strong>{totalPendiente}</strong> compra(s) esperando su número.
              </>
            ) : (
              <>No hay compras pendientes. Está todo al día ✅</>
            )}
          </p>

          {hayPendientes && (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void procesarTodas()}
                disabled={procesando}
                className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {procesando ? "Procesando…" : `Dar número a todas (${totalPendiente})`}
              </button>
              <button
                type="button"
                onClick={() => void buscar()}
                disabled={buscando || procesando}
                className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                Actualizar conteo
              </button>
            </div>
          )}

          {procesando && restante != null && (
            <p className="text-xs text-amber-800">Quedan por procesar: {restante}…</p>
          )}

          {acum && (
            <div className="rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm text-slate-700 space-y-1">
              <p>
                ✅ Con número generado y ticket enviado: <strong>{acum.cerrados}</strong>
              </p>
              {acum.pendientes_datos > 0 && (
                <p>
                  ✍️ Les faltan datos (el bot se los pide por WhatsApp):{" "}
                  <strong>{acum.pendientes_datos}</strong>
                </p>
              )}
              {acum.pendientes_confirmacion > 0 && (
                <p>
                  ⏳ Esperan que el cliente confirme en el chat:{" "}
                  <strong>{acum.pendientes_confirmacion}</strong>
                </p>
              )}
              {acum.fallidos > 0 && (
                <p className="text-red-700">
                  ⚠️ No se pudieron cerrar: <strong>{acum.fallidos}</strong> (revisalos a mano en el
                  chat)
                </p>
              )}
              {listo && (
                <p className="pt-1 font-medium text-emerald-800">
                  Listo. {restante != null && restante > 0 ? `Quedan ${restante} para revisar a mano.` : "No quedó ninguna pendiente."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
