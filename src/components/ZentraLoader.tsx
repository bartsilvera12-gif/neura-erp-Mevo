"use client";

import Image from "next/image";

/**
 * Pantalla de carga premium: muestra el logo oficial de ZENTRA centrado
 * sobre el fondo azul de marca. Sin animaciones del logo (estático).
 * Pequeño indicador "Cargando" textual debajo.
 */
export default function ZentraLoader({
  label = "Cargando",
  fullscreen = true,
}: {
  label?: string;
  /** Si es true, ocupa min-h-screen. Si es false, se acomoda al contenedor. */
  fullscreen?: boolean;
}) {
  return (
    <div
      className={`flex w-full flex-col items-center justify-center gap-6 bg-[color:var(--zentra-sidebar)] ${
        fullscreen ? "min-h-screen" : "min-h-[40vh] py-16"
      }`}
      aria-busy="true"
      role="status"
    >
      <div className="relative h-32 w-[15rem] sm:h-40 sm:w-[18rem]">
        <Image
          src="/brand/zentra-logo-official.png"
          alt="ZENTRA"
          fill
          sizes="(min-width: 640px) 18rem, 15rem"
          className="object-contain object-center"
          priority
        />
      </div>

      <p className="text-[11px] font-medium tracking-[0.32em] text-white/55 uppercase">
        {label}
      </p>

      <span className="sr-only">Cargando contenido…</span>
    </div>
  );
}
