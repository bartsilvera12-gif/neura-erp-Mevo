import { listVendedores, listVentas } from "@/lib/mercaderia/server-queries";
import { requireAdminOrRedirect } from "@/lib/mercaderia/guard-admin";
import VentasClient from "./VentasClient";

type Sp = Record<string, string | string[] | undefined>;

function pick(sp: Sp, k: string): string | undefined {
  const v = sp[k];
  if (typeof v === "string") return v.trim() || undefined;
  if (Array.isArray(v) && v[0]) return String(v[0]).trim() || undefined;
  return undefined;
}

export default async function MercaderiaVentasPage({
  searchParams,
}: {
  searchParams?: Sp | Promise<Sp>;
}) {
  await requireAdminOrRedirect();
  const sp = await Promise.resolve(searchParams ?? {});
  const vendedorId = pick(sp, "vendedor") ?? null;
  const desde = pick(sp, "desde") ?? null;
  const hasta = pick(sp, "hasta") ?? null;
  const tipoRaw = pick(sp, "tipo");
  const tipo = tipoRaw === "simple" || tipoRaw === "combo" ? tipoRaw : null;

  const [vendedores, ventas] = await Promise.all([
    listVendedores(false),
    listVentas({ vendedorId, desde, hasta, tipo, limit: 300 }),
  ]);

  return <VentasClient vendedores={vendedores} ventas={ventas} filtros={{ vendedorId, desde, hasta, tipo }} />;
}
