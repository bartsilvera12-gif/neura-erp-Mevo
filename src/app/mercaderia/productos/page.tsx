import { listProductos } from "@/lib/mercaderia/server-queries";
import { requireAdminOrRedirect } from "@/lib/mercaderia/guard-admin";
import ProductosClient from "./ProductosClient";

export default async function MercaderiaProductosPage() {
  await requireAdminOrRedirect();
  const productos = await listProductos(false);
  return <ProductosClient inicial={productos} />;
}
