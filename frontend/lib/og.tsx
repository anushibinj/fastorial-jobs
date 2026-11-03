import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { PreviewMeta } from "@/lib/preview";
import { SITE_NAME } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 };

const BG = "#0a0a0a";
const FG = "#fafafa";
const MUTED = "#a3a3a3";

const font = (name: string) => readFile(join(process.cwd(), "assets/fonts", name));

/** Inter is bundled in the repo because Satori's default font is limited. */
export async function loadOgFonts() {
  const [regular, semi, bold] = await Promise.all([
    font("inter-latin-400-normal.woff"),
    font("inter-latin-600-normal.woff"),
    font("inter-latin-700-normal.woff"),
  ]);
  return [
    { name: "Inter", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Inter", data: semi, weight: 600 as const, style: "normal" as const },
    { name: "Inter", data: bold, weight: 700 as const, style: "normal" as const },
  ];
}

// Satori only supports flexbox, so every container here is display: flex.
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
        border: muted ? "2px solid #404040" : `2px solid ${FG}`,
      }}
    >
      {children}
    </div>
  );
}

/** Home page, filtered lists, and any job that cannot be loaded. */
export async function defaultOgImage(status = 200) {
  return new ImageResponse(
    (
      <div style={root}>
        <Brand />
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 940 }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>
            Software jobs, curated
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#d4d4d4" }}>Filter by location, experience and tech stack</div>
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#737373" }}>jobs.fastorial.dev</div>
      </div>
    ),
    { ...OG_SIZE, status, fonts: await loadOgFonts() },
  );
}

/** Title, company and location, key fact pills, tag chips. All text comes pre-truncated from buildPreviewMeta. */
export async function jobOgImage(m: PreviewMeta) {
  const where = [m.imageCompany, m.imageLocation].filter(Boolean).join("  ·  ");
  return new ImageResponse(
    (
      <div style={root}>
        <Brand />
        {/* title and facts stay inside the 64px margin, in the left part of the image */}
        <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1040 }}>
          <div
            style={{
              display: "flex",
              fontSize: 54,
              lineHeight: 1.15,
              // two lines at 54px fit about 60 characters; maxHeight is the backup if lineClamp is ignored
              maxHeight: 130,
              overflow: "hidden",
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
                <div key={t} style={{ display: "flex", padding: "6px 18px", borderRadius: 999, background: "#262626", fontSize: 28, color: "#e5e5e5" }}>
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
    { ...OG_SIZE, fonts: await loadOgFonts() },
  );
}
