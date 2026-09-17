"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/mercaderia", label: "Dashboard", match: (p: string) => p === "/mercaderia" },
  { href: "/mercaderia/productos", label: "Productos", match: (p: string) => p.startsWith("/mercaderia/productos") },
  { href: "/mercaderia/vendedores", label: "Vendedores", match: (p: string) => p.startsWith("/mercaderia/vendedores") },
  { href: "/mercaderia/ventas", label: "Ventas", match: (p: string) => p.startsWith("/mercaderia/ventas") },
  { href: "/mercaderia/nueva-venta", label: "Registrar venta", match: (p: string) => p.startsWith("/mercaderia/nueva-venta") },
  { href: "/mercaderia/rendiciones", label: "Rendiciones", match: (p: string) => p.startsWith("/mercaderia/rendiciones") },
];

export default function MercaderiaNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl border border-slate-200 bg-white p-1 text-sm shadow-sm">
      {TABS.map((t) => {
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
