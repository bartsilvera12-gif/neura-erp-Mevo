import { redirect } from "next/navigation";
import { getVentaConItems, listVentas } from "@/lib/mercaderia/server-queries";
import { getMercRole } from "@/lib/mercaderia/roles";
import type { MercVenta, MercVentaItem } from "@/lib/mercaderia/types";
import MisVentasClient from "./MisVentasClient";

export default async function MisVentasPage() {
  const role = await getMercRole();
  if (role.mode === "none") redirect("/");
  if (role.mode === "admin") redirect("/mercaderia/ventas");

  const ventas = await listVentas({
    vendedorId: role.vendedor.id,
    anuladas: "incluir",
    limit: 300,
  });
  const itemsPorVenta = await cargarItems(ventas);

  return <MisVentasClient ventas={ventas} itemsPorVenta={itemsPorVenta} />;
}

async function cargarItems(ventas: MercVenta[]): Promise<Record<string, MercVentaItem[]>> {
  const out: Record<string, MercVentaItem[]> = {};
  const ids = ventas.slice(0, 50).map((v) => v.id);
  await Promise.all(
    ids.map(async (id) => {
      const r = await getVentaConItems(id);
      if (r) out[id] = r.items;
    })
  );
  return out;
}
