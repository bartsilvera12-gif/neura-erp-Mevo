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

  const totals = useMemo(() => {
    let boletasC = 0;
    let boletasP = 0;
    let montoC = 0;
    let montoP = 0;
    for (const r of rows) {
      boletasC += r.boletas_confirmadas;
      boletasP += r.boletas_pendientes;
      montoC += r.monto_confirmado;
      montoP += r.monto_pendiente;
    }
    return { boletasC, boletasP, montoC, montoP };
  }, [rows]);

  const maxTotal = useMemo(() => {
    let m = 0;
    for (const r of rows) {
      const t = r.boletas_confirmadas + r.boletas_pendientes;
      if (t > m) m = t;
    }
    return m;
  }, [rows]);

  const chartWidth = 720;
  const chartHeight = 220;
  const chartPadL = 40;
  const chartPadR = 12;
  const chartPadT = 12;
  const chartPadB = 44;
  const innerW = chartWidth - chartPadL - chartPadR;
  const innerH = chartHeight - chartPadT - chartPadB;
  const nBars = Math.max(1, rows.length);
  const barGap = 4;
  const barW = Math.max(1, (innerW - barGap * (nBars - 1)) / nBars);

  return (
    <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Ventas por día
            {sorteoNombre ? (
              <span className="text-slate-400 normal-case tracking-normal">· {sorteoNombre}</span>
            ) : null}
          </h2>
        </div>
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
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Boletas confirmadas" value={totals.boletasC.toLocaleString("es-PY")} color="#4FAEB2" />
              <MiniStat label="Boletas pendientes" value={totals.boletasP.toLocaleString("es-PY")} color="#F59E0B" />
              <MiniStat label="Monto confirmado" value={formatGs(totals.montoC)} color="#4FAEB2" />
              <MiniStat label="Monto pendiente" value={formatGs(totals.montoP)} color="#F59E0B" />
            </div>

            <div className="flex items-center gap-4 pb-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#4FAEB2]" />
                Confirmadas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#F59E0B]" />
                Pendientes
              </span>
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
                {/* Eje Y */}
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
                {/* Barras */}
                {rows.map((r, idx) => {
                  const total = Math.max(0, r.boletas_confirmadas + r.boletas_pendientes);
                  const denom = maxTotal > 0 ? maxTotal : 1;
                  const hTotal = (total / denom) * innerH;
                  const hConf = ((r.boletas_confirmadas || 0) / denom) * innerH;
                  const hPend = hTotal - hConf;
                  const x = chartPadL + idx * (barW + barGap);
                  const yConf = chartPadT + innerH - hConf;
                  const yPend = chartPadT + innerH - hTotal;
                  const showLabel = rows.length <= 30 || idx % Math.ceil(rows.length / 15) === 0;
                  return (
                    <g key={r.fecha}>
                      {hPend > 0 ? (
                        <rect
                          x={x}
                          y={yPend}
                          width={barW}
                          height={hPend}
                          fill="#F59E0B"
                          rx={2}
                        >
                          <title>
                            {`${r.fecha}\nPendientes: ${r.boletas_pendientes} (${formatGs(r.monto_pendiente)})`}
                          </title>
                        </rect>
                      ) : null}
                      {hConf > 0 ? (
                        <rect
                          x={x}
                          y={yConf}
                          width={barW}
                          height={hConf}
                          fill="#4FAEB2"
                          rx={2}
                        >
                          <title>
                            {`${r.fecha}\nConfirmadas: ${r.boletas_confirmadas} (${formatGs(r.monto_confirmado)})`}
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
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                    <th className="px-3 py-2 text-left">Día</th>
                    <th className="px-3 py-2 text-right">Boletas conf.</th>
                    <th className="px-3 py-2 text-right">Boletas pend.</th>
                    <th className="px-3 py-2 text-right">Monto conf.</th>
                    <th className="px-3 py-2 text-right">Monto pend.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...rows].reverse().map((r) => (
                    <tr key={r.fecha} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 text-slate-700">{shortDate(r.fecha)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {r.boletas_confirmadas.toLocaleString("es-PY")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-600">
                        {r.boletas_pendientes.toLocaleString("es-PY")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-800">
                        {formatGs(r.monto_confirmado)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-600">
                        {formatGs(r.monto_pendiente)}
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
