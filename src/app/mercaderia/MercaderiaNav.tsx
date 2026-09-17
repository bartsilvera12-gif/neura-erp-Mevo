"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; match: (p: string) => boolean };

const TABS_ADMIN: Tab[] = [
  { href: "/mercaderia", label: "Dashboard", match: (p) => p === "/mercaderia" },
  { href: "/mercaderia/productos", label: "Productos", match: (p) => p.startsWith("/mercaderia/productos") },
  { href: "/mercaderia/vendedores", label: "Vendedores", match: (p) => p.startsWith("/mercaderia/vendedores") },
  { href: "/mercaderia/ventas", label: "Ventas", match: (p) => p.startsWith("/mercaderia/ventas") },
  { href: "/mercaderia/nueva-venta", label: "Registrar venta", match: (p) => p.startsWith("/mercaderia/nueva-venta") },
  { href: "/mercaderia/rendiciones", label: "Rendiciones", match: (p) => p.startsWith("/mercaderia/rendiciones") },
];

const TABS_VENDEDOR: Tab[] = [
  { href: "/mercaderia/mi-stock", label: "Mi stock", match: (p) => p === "/mercaderia/mi-stock" || p === "/mercaderia" },
  { href: "/mercaderia/nueva-venta", label: "Registrar venta", match: (p) => p.startsWith("/mercaderia/nueva-venta") },
  { href: "/mercaderia/mis-ventas", label: "Mis ventas", match: (p) => p.startsWith("/mercaderia/mis-ventas") },
];

export default function MercaderiaNav({ mode }: { mode: "admin" | "vendedor" }) {
  const pathname = usePathname() ?? "";
  const tabs = mode === "vendedor" ? TABS_VENDEDOR : TABS_ADMIN;
  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
      {tabs.map((t) => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-xl px-3 py-1.5 transition-colors ${
              active
                ? "bg-[#4FAEB2] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
