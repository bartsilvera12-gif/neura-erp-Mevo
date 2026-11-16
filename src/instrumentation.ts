/**
 * Next.js instrumentation: corre una vez al arrancar el proceso del servidor.
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * Uso: arrancar el pump de campañas (envío por lotes del lado servidor) para que
 * las campañas en `sending` se completen sin depender de una pestaña del navegador
 * abierta. Ver src/lib/campaigns/campaign-pump.ts. También arranca el pump de
 * automatizaciones (cierre de sorteos por fecha y seguimiento por audio), ver
 * src/lib/chat/automation-pump.ts.
 */
export async function register(): Promise<void> {
  // Sólo en el runtime Node (no en edge) y una vez por proceso.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { isCampaignPumpEnabled, startCampaignPump } = await import(
    "@/lib/campaigns/campaign-pump"
  );
  if (!isCampaignPumpEnabled()) {
    console.info("[instrumentation] campaign-pump deshabilitado en este entorno");
    return;
  }
  startCampaignPump();

  // Mismo criterio de entorno: cierre de sorteos por fecha + seguimiento por audio (rkt), cada minuto.
  const { startAutomationPump } = await import("@/lib/chat/automation-pump");
  startAutomationPump();
}
