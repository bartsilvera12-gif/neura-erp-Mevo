import { getMercRole } from "@/lib/mercaderia/roles";
import MercaderiaNav from "./MercaderiaNav";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MercaderiaLayout({ children }: { children: React.ReactNode }) {
  const role = await getMercRole();
  const mode: "admin" | "vendedor" = role.mode === "vendedor" ? "vendedor" : "admin";
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        <header className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Mercadería
          </span>
          <h1 className="text-2xl font-semibold text-slate-900">
            {mode === "vendedor" ? "Mi panel" : "Ventas por vendedor"}
          </h1>
          <p className="text-sm text-slate-500">
            {mode === "vendedor"
              ? "Tu stock actual, tus ventas y el formulario para registrar nuevas."
              : "Stock, ventas y rendiciones de cada vendedor. Los combos usan la comisión de cada producto según la cantidad total del combo."}
          </p>
        </header>
        <MercaderiaNav mode={mode} />
        {children}
      </div>
    </div>
  );
}
