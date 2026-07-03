import SorteosListClient from "./SorteosListClient";
import { getSorteosVentasKpis, type SorteosVentasKpis } from "@/lib/sorteos/ventas-kpis";

/** KPIs dependen de sesión y ventana calendario Paraguay; evitar cache estático de respuestas en 0. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SorteosPage() {
  let ventasKpis: SorteosVentasKpis = {
    boletosHoy: 0,
    boletosSorteo: 0,
    montoHoy: 0,
    montoSorteo: 0,
    sorteoNombre: null,
  };
  try {
    ventasKpis = await getSorteosVentasKpis();
  } catch {
    /* sin sesión o error de red: KPIs en cero */
  }
  return <SorteosListClient ventasKpis={ventasKpis} />;
}
