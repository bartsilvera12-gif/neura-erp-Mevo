"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ConectarCanalModal } from "@/components/chat/ConectarCanalModal";
import { ChannelBadge, channelTypeLabel } from "@/components/chat/ChannelBadge";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { fetchChatChannels, type ChatChannelRow } from "@/lib/chat/actions";

function hasOmnichannelFromModuleAccess(body: {
  superAdmin?: boolean;
  slugs?: string[];
}): boolean {
  if (body.superAdmin) return true;
  const slugs = Array.isArray(body.slugs) ? body.slugs : [];
  return slugs.includes("conversaciones") || slugs.includes("omnicanal");
}

export default function ConfiguracionCanalesHubPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ChatChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchChatChannels();
      setRows(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar canales");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWithSupabaseSession("/api/empresas/module-access", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setAllowed(false);
          return;
        }
        const body = (await res.json()) as { superAdmin?: boolean; slugs?: string[] };
        setAllowed(hasOmnichannelFromModuleAccess(body));
      })
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400">Cargando…</div>
    );
  }

  if (!allowed) {
    return (
      <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-medium">Módulo no habilitado</p>
        <p className="mt-2 text-amber-800/90">
          Tu empresa no tiene el módulo de conversaciones u omnicanal. Contactá al administrador.
        </p>
        <Link href="/configuracion" className="mt-4 inline-block text-sm font-semibold text-amber-900 underline">
          Volver a configuración
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            <Link href="/configuracion" className="hover:text-slate-800">
              Configuración
            </Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Canales y comunicación</span>
          </nav>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Canales y comunicación</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-xl">
            Gestioná los puntos de contacto omnicanal de tu empresa. Conectá WhatsApp (Meta) y, en el futuro, otros
            canales desde el mismo lugar.
          </p>
        </div>
        <Link
          href="/configuracion/canales/nuevo"
          className="inline-flex items-center justify-center shrink-0 rounded-xl bg-[#0EA5E9] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0284C7] transition-colors"
        >
          Conectar canal
        </Link>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-44 rounded-2xl border border-slate-200 bg-slate-50 animate-pulse"
              aria-hidden
            />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-8 py-14 text-center">
          <p className="text-slate-600 font-medium">Aún no tenés canales conectados</p>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            Conectá WhatsApp con tu Phone number ID de Meta para empezar a recibir y enviar mensajes desde el inbox.
          </p>
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#0EA5E9] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#0284C7]"
          >
            Conectar canal
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
          {rows.map((r) => (
            <li key={r.id}>
              <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-slate-900 truncate">{r.nombre ?? channelTypeLabel(r.type)}</h2>
                    <div className="mt-2">
                      <ChannelBadge type={r.type} nombre={null} />
                    </div>
                  </div>
                  {r.activo ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800 border border-emerald-200">
                      Activo
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-600 border border-slate-200">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-500 font-mono truncate" title={r.meta_phone_number_id}>
                  {r.meta_phone_number_id ? `ID: ${r.meta_phone_number_id}` : "Sin Phone number ID"}
                </p>
                <div className="mt-auto pt-5">
                  <Link
                    href={`/configuracion/canales/${r.id}`}
                    className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Editar
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
