import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "KillaAssistant — AI assistant for Telegram";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logoSrc = await fetch(new URL("../../public/logo.png", import.meta.url)).then((r) => r.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          backgroundColor: "#0b0d14",
          backgroundImage:
            "radial-gradient(circle at 15% 20%, rgba(124, 92, 230, 0.45), transparent 55%), radial-gradient(circle at 90% 90%, rgba(60, 160, 220, 0.35), transparent 55%)",
          color: "#eef0f5",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc as unknown as string} alt="KillaAssistant logo" width={88} height={88} style={{ borderRadius: 20 }} />
          <div style={{ fontSize: 44, fontWeight: 700 }}>KillaAssistant</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.1, display: "flex", flexWrap: "wrap" }}>
            <span>Your assistant,&nbsp;</span>
            <span style={{ color: "#b49cff" }}>one message away.</span>
          </div>
          <div style={{ fontSize: 32, color: "#a9adb8", maxWidth: 900 }}>
            Calendar, Drive and voice notes from Telegram — powered by your own encrypted API keys.
          </div>
        </div>
      </div>
    ),
    size
  );
}
