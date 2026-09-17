import { listProductos, listStockPorVendedor, listVendedores } from "@/lib/mercaderia/server-queries";
import NuevaVentaClient from "./NuevaVentaClient";

export default async function NuevaVentaPage() {
  const [vendedores, productos, stock] = await Promise.all([
    listVendedores(true),
    listProductos(true),
    listStockPorVendedor(null),
  ]);
  return <NuevaVentaClient vendedores={vendedores} productos={productos} stock={stock} />;
}
