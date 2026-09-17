import Link from "next/link";
import { listProductos, listStockPorVendedor, listVendedores } from "@/lib/mercaderia/server-queries";
import { requireAdminOrRedirect } from "@/lib/mercaderia/guard-admin";
import VendedoresClient from "./VendedoresClient";

export default async function MercaderiaVendedoresPage() {
  await requireAdminOrRedirect();
  const [vendedores, productos, stock] = await Promise.all([
    listVendedores(false),
    listProductos(true),
    listStockPorVendedor(null),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          6 vendedores actuales. Cada uno tiene su propio stock que se descuenta con las ventas.
        </p>
        <Link
          href="#nuevo"
          className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[#3F8E91]"
        >
          + Nuevo vendedor
        </Link>
      </div>
      <VendedoresClient vendedores={vendedores} productos={productos} stock={stock} />
    </div>
  );
}
