import { listRendiciones, listVendedores } from "@/lib/mercaderia/server-queries";
import RendicionesClient from "./RendicionesClient";

export default async function MercaderiaRendicionesPage() {
  const [vendedores, rendiciones] = await Promise.all([
    listVendedores(true),
    listRendiciones({ limit: 200 }),
  ]);
  return <RendicionesClient vendedores={vendedores} rendiciones={rendiciones} />;
}
