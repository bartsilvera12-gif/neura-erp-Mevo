import { listProductos } from "@/lib/mercaderia/server-queries";
import ProductosClient from "./ProductosClient";

export default async function MercaderiaProductosPage() {
  const productos = await listProductos(false);
  return <ProductosClient inicial={productos} />;
}
