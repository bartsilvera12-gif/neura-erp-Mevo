import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { createSignedUrlForTicket } from "@/lib/sorteos/sorteo-ticket-storage";

/**
 * GET /api/sorteos/tickets/by-message/[messageId]/signed-url
 *
 * El ticket se envía por WhatsApp con una URL firmada de 600 s y esa URL no se
 * persiste en el mensaje, así que el inbox no puede mostrar la imagen después.
 * Acá se resuelve el delivery a partir del mensaje (`wa_message_id`) y se emite
 * una URL firmada nueva. Sirve también para tickets enviados antes de este cambio.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const { messageId } = await params;
    const mid = messageId?.trim() ?? "";
    if (!mid) {
      return NextResponse.json(errorResponse("messageId es obligatorio"), { status: 400 });
    }

    const ttl = Math.min(
      Math.max(Number(new URL(request.url).searchParams.get("ttl") ?? "600"), 60),
      3600
    );

    const sb = await getChatServiceClientForEmpresa(empresaId);

    const { data: msg, error: msgErr } = await sb
      .from("chat_messages")
      .select("wa_message_id")
      .eq("id", mid)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (msgErr || !msg) {
      return NextResponse.json(errorResponse("Mensaje no encontrado"), { status: 404 });
    }

    const waId = (msg as { wa_message_id?: string | null }).wa_message_id?.trim();
    if (!waId) {
      return NextResponse.json(errorResponse("El mensaje no tiene id de WhatsApp"), { status: 404 });
    }

    const { data: rows, error: delErr } = await sb
      .from("sorteo_ticket_deliveries")
      .select("id, storage_path, template_revision")
      .eq("empresa_id", empresaId)
      .eq("whatsapp_message_id", waId)
      .order("template_revision", { ascending: false })
      .limit(1);
    if (delErr) {
      return NextResponse.json(errorResponse(delErr.message), { status: 400 });
    }
    const row = rows?.[0] as { id?: string; storage_path?: string | null } | undefined;
    const path = row?.storage_path?.trim();
    if (!path) {
      return NextResponse.json(errorResponse("No hay ticket para este mensaje"), { status: 404 });
    }

    const signed = await createSignedUrlForTicket(sb, path, ttl);
    if (!signed.url) {
      return NextResponse.json(errorResponse(signed.error ?? "signed_url"), { status: 500 });
    }

    return NextResponse.json(
      successResponse({ url: signed.url, expires_in: ttl, delivery_id: row?.id ?? null })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
