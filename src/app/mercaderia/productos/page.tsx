import { listProductos, listStockPorVendedor } from "@/lib/mercaderia/server-queries";
import { requireAdminOrRedirect } from "@/lib/mercaderia/guard-admin";
import ProductosClient from "./ProductosClient";

export default async function MercaderiaProductosPage() {
  await requireAdminOrRedirect();
  const [productos, stock] = await Promise.all([
    listProductos(false),
    listStockPorVendedor(null),
  ]);
  // Suma total por producto = mercadería en manos de todos los vendedores.
  const stockPorProducto = new Map<string, number>();
  for (const s of stock) {
    const cur = stockPorProducto.get(s.producto_id) ?? 0;
    stockPorProducto.set(s.producto_id, cur + (Number(s.stock) || 0));
  }
  const stockDict: Record<string, number> = {};
  for (const [k, v] of stockPorProducto) stockDict[k] = v;
  return <ProductosClient inicial={productos} stockPorProducto={stockDict} />;
}
