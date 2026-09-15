"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getSorteoVentasPorDia,
  type VentasPorDiaRow,
} from "@/lib/sorteos/ventas-por-dia";

type Props = {
  sorteoId: string | null;
  sorteoNombre: string;
};

function formatGs(n: number) {
  return `${n.toLocaleString("es-PY")} ₲`;
}

function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return dt.toLocaleDateString("es-PY", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

export default function VentasPorDiaWidget({ sorteoId, sorteoNombre }: Props) {
  const [dias, setDias] = useState<number>(14);
  const [soloAprobadas, setSoloAprobadas] = useState<boolean>(false);
  const [rows, setRows] = useState<VentasPorDiaRow[]>([]);
  const [cargando, setCargando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sorteoId) return;
    let alive = true;
    setCargando(true);
    setErr(null);
    getSorteoVentasPorDia(sorteoId, dias)
      .then((data) => {
        if (!alive) return;
        setRows(data);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : "Error al cargar");
        setRows([]);
      })
      .finally(() => alive && setCargando(false));
    return () => {
      alive = false;
    };
  }, [sorteoId, dias]);

  /** Filas ya proyectadas al modo elegido. `total` = valor que se grafica y se lista. */
  const view = useMemo(
    () =>
      rows.map((r) => ({
        fecha: r.fecha,
        boletas: soloAprobadas
          ? r.boletas_confirmadas
          : r.boletas_confirmadas + r.boletas_pendientes,
        monto: soloAprobadas
          ? r.monto_confirmado
          : r.monto_confirmado + r.monto_pendiente,
      })),
    [rows, soloAprobadas]
  );

  const totals = useMemo(() => {
    let boletas = 0;
    let monto = 0;
    for (const r of view) {
      boletas += r.boletas;
      monto += r.monto;
    }
    return { boletas, monto };
  }, [view]);

  const maxTotal = useMemo(() => {
    let m = 0;
    for (const r of view) {
      if (r.boletas > m) m = r.boletas;
    }
    return m;
  }, [view]);

  const chartWidth = 720;
  const chartHeight = 220;
  const chartPadL = 40;
  const chartPadR = 12;
  const chartPadT = 12;
  const chartPadB = 44;
  const innerW = chartWidth - chartPadL - chartPadR;
  const innerH = chartHeight - chartPadT - chartPadB;
  const nBars = Math.max(1, view.length);
  const barGap = 4;
  const barW = Math.max(1, (innerW - barGap * (nBars - 1)) / nBars);

  const barColor = soloAprobadas ? "#4FAEB2" : "#F59E0B";

  return (
    <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Ventas por día
            {sorteoNombre ? (
              <span className="text-slate-400 normal-case tracking-normal">· {sorteoNombre}</span>
            ) : null}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
            <input
              type="checkbox"
              checked={soloAprobadas}
              onChange={(e) => setSoloAprobadas(e.target.checked)}
              className="h-3.5 w-3.5 accent-[#4FAEB2]"
            />
            Solo aprobadas por revisión
          </label>
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Rango</label>
            <select
              value={dias}
              onChange={(e) => setDias(Number(e.target.value) || 14)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:border-[#4FAEB2] focus:outline-none"
            >
              <option value={7}>7 días</option>
              <option value={14}>14 días</option>
              <option value={30}>30 días</option>
              <option value={60}>60 días</option>
              <option value={90}>90 días</option>
            </select>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        {!sorteoId ? (
          <div className="text-sm text-slate-500">
            Seleccioná un sorteo para ver sus ventas por día.
          </div>
        ) : cargando ? (
          <div className="text-sm text-slate-500">Cargando…</div>
        ) : err ? (
          <div className="text-sm text-red-600">Error: {err}</div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
              <MiniStat
                label={soloAprobadas ? "Boletas aprobadas" : "Boletas vendidas"}
                value={totals.boletas.toLocaleString("es-PY")}
                color={barColor}
              />
              <MiniStat
                label={soloAprobadas ? "Monto aprobado" : "Monto vendido"}
                value={formatGs(totals.monto)}
                color={barColor}
              />
            </div>

            <div className="pb-2 text-xs text-slate-500">
              {soloAprobadas
                ? "Solo entradas confirmadas por un admin desde revisión."
                : "Todas las entradas no rechazadas (incluye pagos pendientes de revisar)."}
            </div>

            <div className="overflow-x-auto">
              <svg
                viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                width="100%"
                height={chartHeight}
                role="img"
                aria-label="Boletas por día"
                style={{ minWidth: Math.max(chartWidth, nBars * 20) }}
              >
                {[0, 0.25, 0.5, 0.75, 1].map((t) => {
                  const y = chartPadT + innerH * (1 - t);
                  const v = Math.round(maxTotal * t);
                  return (
                    <g key={t}>
                      <line
                        x1={chartPadL}
                        x2={chartWidth - chartPadR}
                        y1={y}
                        y2={y}
                        stroke="#e5e7eb"
                        strokeDasharray="3 3"
                      />
                      <text x={chartPadL - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
                        {v.toLocaleString("es-PY")}
                      </text>
                    </g>
                  );
                })}
                {view.map((r, idx) => {
                  const total = Math.max(0, r.boletas);
                  const denom = maxTotal > 0 ? maxTotal : 1;
                  const h = (total / denom) * innerH;
                  const x = chartPadL + idx * (barW + barGap);
                  const y = chartPadT + innerH - h;
                  const showLabel = view.length <= 30 || idx % Math.ceil(view.length / 15) === 0;
                  return (
                    <g key={r.fecha}>
                      {h > 0 ? (
                        <rect x={x} y={y} width={barW} height={h} fill={barColor} rx={2}>
                          <title>
                            {`${r.fecha}\nBoletas: ${r.boletas}\n${formatGs(r.monto)}`}
                          </title>
                        </rect>
                      ) : null}
                      {showLabel ? (
                        <text
                          x={x + barW / 2}
                          y={chartHeight - chartPadB + 14}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#64748b"
                        >
                          {shortDate(r.fecha)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-3 py-2 text-left">Día</th>
                    <th className="px-3 py-2 text-right">Boletas</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...view].reverse().map((r) => (
                    <tr key={r.fecha} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-slate-700">{shortDate(r.fecha)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {r.boletas.toLocaleString("es-PY")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {formatGs(r.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
          {label}
        </span>
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-800 tabular-nums">{value}</div>
    </div>
  );
}
