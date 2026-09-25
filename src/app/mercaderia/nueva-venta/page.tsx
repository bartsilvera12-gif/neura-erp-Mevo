import { redirect } from "next/navigation";
import { listProductos, listStockPorVendedor, listVendedores } from "@/lib/mercaderia/server-queries";
import { getMercRole } from "@/lib/mercaderia/roles";
import NuevaVentaClient from "./NuevaVentaClient";

export default async function NuevaVentaPage() {
  const role = await getMercRole();
  if (role.mode === "none") redirect("/");

  // Vendedor solo ve/registra ventas propias; admin ve todo el flujo.
  if (role.mode === "vendedor") {
    const vendedorId = role.vendedor.id;
    const [productos, stock] = await Promise.all([
      listProductos(true),
      listStockPorVendedor(vendedorId),
    ]);
    // El costo es información exclusiva del administrador: no debe salir del
    // servidor hacia el navegador del vendedor. Lo neutralizamos en el payload
    // (no afecta comisión ni precios; ver escala.ts) y ocultamos la UI de costo.
    const productosSinCosto = productos.map((p) => ({ ...p, costo_unitario: 0 }));
    return (
      <NuevaVentaClient
        vendedores={[role.vendedor]}
        productos={productosSinCosto}
        stock={stock}
        forcedVendedorId={vendedorId}
        mostrarCosto={false}
      />
    );
  }

  const [vendedores, productos, stock] = await Promise.all([
    listVendedores(true),
    listProductos(true),
    listStockPorVendedor(null),
  ]);
  return (
    <NuevaVentaClient
      vendedores={vendedores}
      productos={productos}
      stock={stock}
      mostrarCosto
    />
  );
}
