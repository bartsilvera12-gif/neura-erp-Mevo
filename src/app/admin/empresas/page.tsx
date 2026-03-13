"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getEmpresas } from "@/lib/empresas/actions";
import type { Empresa } from "@/lib/empresas/actions";

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return ""; }
}

function BadgeEstado({ estado }: { estado: string }) {
  const activo = estado === "activo";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
      activo ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${activo ? "bg-green-500" : "bg-gray-400"}`} />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

export default function AdminEmpresasPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getEmpresas()
      .then(setEmpresas)
      .catch(console.error)
      .finally(() => setCargando(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Empresas</h1>
          <p className="text-gray-500 text-sm mt-1">Administración de empresas del SaaS</p>
        </div>
        <Link
          href="/admin/empresas/nueva"
          className="flex items-center gap-1.5 bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Nueva empresa
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {cargando ? (
          <div className="py-16 text-center text-gray-400 text-sm animate-pulse">Cargando empresas…</div>
        ) : empresas.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <p className="text-4xl mb-3">🏢</p>
            <p className="font-medium text-gray-600">No hay empresas registradas</p>
            <Link href="/admin/empresas/nueva" className="mt-4 inline-block text-sm text-gray-500 underline hover:text-gray-800">
              Crear primera empresa
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Empresa</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Plan</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">RUC</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Creada</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empresas.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-semibold text-gray-800">{e.nombre_empresa}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{e.plan ?? "—"}</td>
                  <td className="px-5 py-3.5 text-sm text-gray-600">{e.ruc ?? "—"}</td>
                  <td className="px-5 py-3.5"><BadgeEstado estado={e.estado} /></td>
                  <td className="px-5 py-3.5 text-xs text-gray-400">{formatFecha(e.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/empresas/${e.id}`}
                        className="text-xs text-gray-500 hover:text-gray-800 underline"
                      >
                        Ver
                      </Link>
                      <Link
                        href={`/admin/empresas/${e.id}/editar`}
                        className="text-xs text-gray-500 hover:text-gray-800 underline"
                      >
                        Editar
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-sm text-gray-500">
        <span className="font-semibold text-gray-800">{empresas.length}</span> empresas
      </p>
    </div>
  );
}
