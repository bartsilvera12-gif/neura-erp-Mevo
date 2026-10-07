import { redirect } from "next/navigation";
import { getMercRole } from "@/lib/mercaderia/roles";
import { listVendedores } from "@/lib/mercaderia/server-queries";
import GenerarBoletaClient from "./GenerarBoletaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function GenerarBoletaPage() {
  const role = await getMercRole();
  if (role.mode === "none") redirect("/");

  const esAdmin = role.mode === "admin";
  const vendedorNombre = role.mode === "vendedor" ? role.vendedor?.nombre ?? null : null;
  const vendedores = esAdmin
    ? (await listVendedores(true)).map((v) => ({ id: v.id, nombre: v.nombre }))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Boletas · Venta presencial
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Generar boleta</h1>
        <p className="mt-1 text-sm text-slate-500">
          Para clientes en el local. Cargá los datos y el monto; se crea la boleta con sus números.
          {vendedorNombre ? ` Queda registrada a tu nombre (${vendedorNombre}).` : ""}
        </p>
      </div>

      <GenerarBoletaClient esAdmin={esAdmin} vendedores={vendedores} />
    </div>
  );
}
