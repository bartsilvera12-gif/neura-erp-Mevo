"use client";

import { Fragment, useCallback, useState } from "react";
import type { FacturaElectronicaDTO } from "@/lib/sifen/types";
import { SifenEstadoBadge, labelSifenEstado } from "./SifenEstadoBadge";

type Resumen = {
  sifen_config_exists: boolean;
  sifen_config_activa: boolean;
  factura_electronica: FacturaElectronicaDTO | null;
};

type PasoEmisionKey = "comercial" | "borrador" | "xml" | "firma" | "set" | "aprobacion";

type PasoEmisionEstado = "pendiente" | "listo" | "espera" | "rechazado";

const PASOS_EMISION: { key: PasoEmisionKey; label: string }[] = [
  { key: "comercial", label: "Comercial" },
  { key: "borrador", label: "Borrador" },
  { key: "xml", label: "XML" },
  { key: "firma", label: "Firma" },
  { key: "set", label: "SET" },
  { key: "aprobacion", label: "Aprobación" },
];

/** Mensaje en lenguaje simple + estado de cada paso del circuito (solo UI). */
function resolverEstadoEmisionVisual(resumen: Resumen): {
  mensaje: string;
  pasos: Record<PasoEmisionKey, PasoEmisionEstado>;
} {
  const sinConfigActiva = !resumen.sifen_config_activa;
  const pendientes: Record<PasoEmisionKey, PasoEmisionEstado> = {
    comercial: "pendiente",
    borrador: "pendiente",
    xml: "pendiente",
    firma: "pendiente",
    set: "pendiente",
    aprobacion: "pendiente",
  };
  const soloComercial: Record<PasoEmisionKey, PasoEmisionEstado> = {
    ...pendientes,
    comercial: "listo",
  };

  if (sinConfigActiva) {
    return {
      mensaje: "Esta empresa aún no tiene configurada la facturación electrónica.",
      pasos: soloComercial,
    };
  }

  const fe = resumen.factura_electronica;
  if (!fe) {
    return {
      mensaje: "Factura comercial creada. Aún no se inició el proceso electrónico.",
      pasos: soloComercial,
    };
  }

  const e = String(fe.estado_sifen);

  switch (e) {
    case "borrador":
      return {
        mensaje: "Borrador electrónico generado. Aún no fue convertido en XML fiscal.",
        pasos: { ...soloComercial, borrador: "listo" },
      };
    case "generado":
      return {
        mensaje: "XML generado. Aún no fue firmado digitalmente.",
        pasos: { ...soloComercial, borrador: "listo", xml: "listo" },
      };
    case "firmado":
      return {
        mensaje:
          "Documento firmado digitalmente. Aún no fue enviado a SET, por lo tanto todavía no es una factura electrónica emitida legalmente.",
        pasos: { ...soloComercial, borrador: "listo", xml: "listo", firma: "listo" },
      };
    case "enviado":
      return {
        mensaje: "Documento enviado a SET. Pendiente de confirmación.",
        pasos: {
          ...soloComercial,
          borrador: "listo",
          xml: "listo",
          firma: "listo",
          set: "espera",
        },
      };
    case "aprobado":
      return {
        mensaje: "Factura electrónica aprobada correctamente.",
        pasos: {
          comercial: "listo",
          borrador: "listo",
          xml: "listo",
          firma: "listo",
          set: "listo",
          aprobacion: "listo",
        },
      };
    case "rechazado":
      return {
        mensaje: "SET rechazó el documento. Revisar observaciones.",
        pasos: {
          comercial: "listo",
          borrador: "listo",
          xml: "listo",
          firma: "listo",
          set: "listo",
          aprobacion: "rechazado",
        },
      };
    default:
      return {
        mensaje:
          "Hay un registro electrónico asociado, pero el estado no es el esperado. Revisá el detalle técnico o contactá soporte.",
        pasos: { ...soloComercial, borrador: "listo" },
      };
  }
}

function clasePaso(estado: PasoEmisionEstado): string {
  switch (estado) {
    case "listo":
      return "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200/80 shadow-sm";
    case "espera":
      return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80 shadow-sm";
    case "rechazado":
      return "bg-red-50 text-red-800 ring-1 ring-red-200/80 shadow-sm";
    default:
      return "bg-slate-100 text-slate-400 ring-1 ring-slate-200/80";
  }
}

function EstadoEmisionElectronicaBlock({ resumen }: { resumen: Resumen }) {
  const { mensaje, pasos } = resolverEstadoEmisionVisual(resumen);
  const sinConfigActiva = !resumen.sifen_config_activa;

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white px-4 py-4 space-y-3">
      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Estado de emisión electrónica</h4>
      <p className="text-sm text-slate-800 leading-relaxed font-medium">{mensaje}</p>
      {sinConfigActiva && (
        <p className="text-xs text-slate-500">
          Si corresponde, podés configurarla en{" "}
          <a href="/configuracion/facturacion-electronica" className="text-[#0EA5E9] font-semibold underline hover:no-underline">
            Configuración → Facturación electrónica
          </a>
          .
        </p>
      )}

      <div className="pt-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Avance del proceso</p>
        <div className="flex flex-wrap items-center gap-y-2 gap-x-0.5">
          {PASOS_EMISION.map((p, i) => (
            <Fragment key={p.key}>
              {i > 0 && (
                <span
                  className={`mx-0.5 sm:mx-1 text-xs select-none ${
                    pasos[PASOS_EMISION[i - 1].key] === "listo" ? "text-emerald-400" : "text-slate-200"
                  }`}
                  aria-hidden
                >
                  →
                </span>
              )}
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] sm:text-xs font-semibold ${clasePaso(pasos[p.key])}`}
              >
                {p.label}
              </span>
            </Fragment>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 mt-2 leading-snug">
          Verde: listo · Gris: pendiente · Ámbar: en espera de respuesta · Rojo: rechazo en SET
        </p>
      </div>
    </div>
  );
}

const XML_BLOQUEADOS = new Set(["aprobado", "enviado", "firmado"]);
const FIRMAR_BLOQUEADOS = new Set(["aprobado", "enviado"]);

async function readApiError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    return j.error ?? `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export function FacturaElectronicaPanel({
  facturaId,
  resumen,
  loadingResumen,
  onResumenLoaded,
}: {
  facturaId: string;
  resumen: Resumen | null;
  loadingResumen: boolean;
  onResumenLoaded: (r: Resumen) => void;
}) {
  const [action, setAction] = useState<"borrador" | "xml" | "firmar" | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/facturas/${facturaId}/sifen/resumen`);
    const j = (await res.json()) as { success?: boolean; data?: Resumen };
    if (res.ok && j.success && j.data) onResumenLoaded(j.data);
  }, [facturaId, onResumenLoaded]);

  const run = async (kind: "borrador" | "xml" | "firmar") => {
    setFlash(null);
    setAction(kind);
    try {
      const path =
        kind === "borrador"
          ? `/api/facturas/${facturaId}/sifen/borrador`
          : kind === "xml"
            ? `/api/facturas/${facturaId}/sifen/xml`
            : `/api/facturas/${facturaId}/sifen/firmar`;
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        setFlash({ kind: "err", text: await readApiError(res) });
        return;
      }
      setFlash({
        kind: "ok",
        text:
          kind === "borrador"
            ? "Borrador electrónico listo."
            : kind === "xml"
              ? "XML generado correctamente."
              : "XML firmado correctamente.",
      });
      await refresh();
    } catch (e) {
      setFlash({ kind: "err", text: e instanceof Error ? e.message : "Error de red" });
    } finally {
      setAction(null);
    }
  };

  const fe = resumen?.factura_electronica ?? null;
  const estado = fe?.estado_sifen ?? null;
  const estadoLabel = fe ? labelSifenEstado(estado) : "Sin SIFEN";

  const puedeBorrador = Boolean(resumen?.sifen_config_activa) && !fe;
  const puedeGenerarXml =
    Boolean(resumen?.sifen_config_activa) && fe != null && !XML_BLOQUEADOS.has(String(estado));
  const puedeFirmar =
    Boolean(resumen?.sifen_config_activa) &&
    fe != null &&
    Boolean(fe.xml_path?.trim()) &&
    !FIRMAR_BLOQUEADOS.has(String(estado)) &&
    estado !== "firmado";

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide border-b border-slate-100 pb-2">
        Facturación electrónica (SIFEN)
      </h3>

      {loadingResumen && (
        <p className="text-sm text-slate-400">Cargando estado SIFEN…</p>
      )}

      {!loadingResumen && resumen && <EstadoEmisionElectronicaBlock resumen={resumen} />}

      {!loadingResumen && resumen && (
        <>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-1">
            Detalle técnico y acciones
          </p>
          <div className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500">Estado SIFEN:</span>
              <SifenEstadoBadge estadoSifen={fe ? estado : null} mostrarPistaEnvioSet={false} />
              {!fe && <span className="text-slate-400">({estadoLabel})</span>}
            </div>
            {fe && (
              <>
                <p className="text-slate-600">
                  <span className="text-slate-400">ID documento electrónico:</span>{" "}
                  <code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded">{fe.id}</code>
                </p>
                <p className="text-slate-600 break-all">
                  <span className="text-slate-400">xml_path:</span>{" "}
                  <code className="text-xs">{fe.xml_path ?? "—"}</code>
                </p>
                <p className="text-slate-600 break-all">
                  <span className="text-slate-400">xml_firmado_path:</span>{" "}
                  <code className="text-xs">{fe.xml_firmado_path ?? "—"}</code>
                </p>
                {fe.cdc && (
                  <p className="text-slate-600 break-all">
                    <span className="text-slate-400">CDC:</span> <code className="text-xs">{fe.cdc}</code>
                  </p>
                )}
                {fe.error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2 whitespace-pre-wrap">
                    <span className="font-semibold">Error: </span>
                    {fe.error}
                  </div>
                )}
              </>
            )}
          </div>

          {flash && (
            <div
              className={`rounded-lg text-sm px-4 py-2 ${
                flash.kind === "ok"
                  ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                  : "bg-red-50 border border-red-200 text-red-800"
              }`}
            >
              {flash.text}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={!puedeBorrador || action !== null}
              onClick={() => run("borrador")}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800"
            >
              {action === "borrador" ? "Generando…" : "Generar borrador"}
            </button>
            <button
              type="button"
              disabled={!puedeGenerarXml || action !== null}
              onClick={() => run("xml")}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              {action === "xml"
                ? "Generando XML…"
                : fe?.xml_path?.trim()
                  ? "Regenerar XML"
                  : "Generar XML"}
            </button>
            <button
              type="button"
              disabled={!puedeFirmar || action !== null}
              onClick={() => run("firmar")}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-300 text-indigo-900 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-50"
            >
              {action === "firmar" ? "Firmando…" : "Firmar XML"}
            </button>
          </div>

          {fe && estado === "firmado" && (
            <div className="rounded-lg border border-dashed border-violet-200 bg-violet-50/50 px-4 py-3 space-y-2">
              <p className="text-[10px] font-bold text-violet-900/70 uppercase tracking-wide">Siguiente paso</p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2 sm:gap-3">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  title="Disponible cuando se integre el envío a SET"
                  className="w-fit px-3 py-2 text-xs font-semibold rounded-lg bg-violet-600 text-white opacity-50 cursor-not-allowed shadow-sm"
                >
                  Enviar a SET
                </button>
                <p className="text-xs text-violet-900/75 font-medium">
                  Próximamente disponible · Pendiente de integración con SET
                </p>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                Esta será la acción final para emitir legalmente la factura electrónica.
              </p>
            </div>
          )}

          {fe && (
            <div className="text-xs text-slate-400 pt-2 border-t border-slate-100 space-y-1">
              <p>
                Debug:{" "}
                <a className="text-[#0EA5E9] hover:underline" href={`/api/facturas/${facturaId}/sifen/payload`} target="_blank" rel="noreferrer">
                  payload JSON
                </a>
                {" · "}
                <a className="text-[#0EA5E9] hover:underline" href={`/api/facturas/${facturaId}/sifen/documento`} target="_blank" rel="noreferrer">
                  documento
                </a>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
