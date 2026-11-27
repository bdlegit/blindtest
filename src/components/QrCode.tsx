"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#07050d", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [value, size]);
  return (
    <div className="rounded-3xl bg-white p-3 glow-pink" style={{ width: size + 24, height: size + 24 }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR code pour rejoindre : ${value}`} width={size} height={size} className="rounded-xl" />
      ) : (
        <div className="shimmer h-full w-full rounded-xl" />
      )}
    </div>
  );
}
