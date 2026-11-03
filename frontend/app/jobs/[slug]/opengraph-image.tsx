import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { fetchJob } from "@/lib/api/client";
import { buildPreviewMeta } from "@/lib/preview";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = SITE_NAME;

const font = (name: string) => readFile(join(process.cwd(), "assets/fonts", name));

const BG = "#0a0a0a";
const FG = "#fafafa";
const MUTED = "#a3a3a3";

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width="44" height="44" viewBox="0 0 512 512">
        <rect width="512" height="512" rx="112" fill={FG} />
        <path fill={BG} d="M168 128h184v64H232v40h88v56h-88v96h-64z" />
      </svg>
      <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: MUTED }}>{SITE_NAME}</div>
    </div>
  );
}

function Pill({ children, muted = false }: { children: string; muted?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 24px",
        borderRadius: 999,
        fontSize: 34,
        fontWeight: 600,
        color: muted ? MUTED : BG,
        background: muted ? "transparent" : FG,
        border: muted ? `2px solid #404040` : `2px solid ${FG}`,
      }}
    >
      {children}
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [regular, semi, bold] = await Promise.all([
    font("inter-latin-400-normal.woff"),
    font("inter-latin-600-normal.woff"),
    font("inter-latin-700-normal.woff"),
  ]);
  const fonts = [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: semi, weight: 600 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ];

  const job = await fetchJob(slug).catch(() => null);
  const root = {
    display: "flex",
    flexDirection: "column" as const,
    justifyContent: "space-between",
    width: "100%",
    height: "100%",
    background: BG,
    color: FG,
    padding: "56px 64px",
    fontFamily: "Inter",
  };

  if (!job) {
    return new ImageResponse(
      (
        <div style={root}>
          <Brand />
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700 }}>Software jobs, curated</div>
          <div style={{ display: "flex", fontSize: 28, color: MUTED }}>jobs.fastorial.dev</div>
        </div>
      ),
      { ...size, fonts },
    );
  }

  const m = buildPreviewMeta(job);
  const where = [m.imageCompany, m.imageLocation].filter(Boolean).join("  ·  ");

  return new ImageResponse(
    (
      <div style={root}>
        <Brand />
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 940 }}>
          <div
            style={{
              display: "flex",
              fontSize: 62,
              lineHeight: 1.12,
              fontWeight: 700,
              letterSpacing: -1,
              lineClamp: 2,
              textOverflow: "ellipsis",
            }}
          >
            {m.imageTitle}
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#d4d4d4", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {where}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <Pill>{m.experience}</Pill>
            {m.agePill ? <Pill muted={m.closed}>{m.agePill}</Pill> : null}
          </div>
          {m.imageTags.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {m.imageTags.map((t) => (
                <div
                  key={t}
                  style={{ display: "flex", padding: "6px 18px", borderRadius: 999, background: "#262626", fontSize: 28, color: "#e5e5e5" }}
                >
                  {t}
                </div>
              ))}
              {m.moreTags > 0 ? (
                <div style={{ display: "flex", padding: "6px 18px", borderRadius: 999, border: "2px solid #404040", fontSize: 28, color: MUTED }}>
                  {`+${m.moreTags}`}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#737373" }}>jobs.fastorial.dev</div>
      </div>
    ),
    { ...size, fonts },
  );
}
