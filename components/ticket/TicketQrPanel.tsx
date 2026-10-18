"use client";

import QRCode from "react-qr-code";

export function TicketQrPanel(props: { token: string }) {
  const { token } = props;
  return (
    <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-5 text-center">
      {/* The QR stays dark-on-white in both colour modes so scanners can read it. */}
      <div className="w-full max-w-[220px] rounded-md bg-white p-2.5">
        <QRCode value={token} size={240} bgColor="#FFFFFF" fgColor="#111111" level="M" style={{ height: "auto", maxWidth: "100%", width: "100%" }} />
      </div>
      <p className="max-w-[300px] text-sm text-ink-muted">Staff can scan this code or paste your ticket link. The code is unique to your registration.</p>
    </div>
  );
}
