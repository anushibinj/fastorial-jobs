import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { WORK_MODE_LABEL } from "@/lib/format";
import type { PreviewMeta } from "@/lib/preview";
import type { WorkMode } from "@/lib/types";
import { SITE_NAME } from "@/lib/site";

export const OG_SIZE = { width: 1200, height: 630 };
/** 1:1 version of the job image. */
export const SQUARE_SIZE = { width: 1080, height: 1080 };

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

const ICON_PROPS = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** Lucide "building-2" and "map-pin", inlined because Satori cannot load icon fonts. */
function BuildingIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} {...ICON_PROPS} stroke={color}>
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  );
}

function MapPinIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} {...ICON_PROPS} stroke={color}>
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/** Lucide "wifi" (remote), "wifi-lock" (hybrid) and "briefcase-business" (onsite). */
function WorkModeIcon({ mode, size, color }: { mode: WorkMode; size: number; color: string }) {
  return (
    <svg width={size} height={size} {...ICON_PROPS} stroke={color}>
      {mode === "REMOTE" ? (
        <>
          <path d="M12 20h.01" />
          <path d="M2 8.82a15 15 0 0 1 20 0" />
          <path d="M5 12.859a10 10 0 0 1 14 0" />
          <path d="M8.5 16.429a5 5 0 0 1 7 0" />
        </>
      ) : mode === "HYBRID" ? (
        <>
          <path d="M2 8.82a15 15 0 0 1 20 0" />
          <path d="M20 16v-2a2 2 0 0 0-4 0v2" />
          <path d="M5 12.859a10 10 0 0 1 8.436-2.756" />
          <path d="M8.5 16.429a5 5 0 0 1 1.794-1.13" />
          <rect x="14" y="16" width="8" height="5" rx="1" />
        </>
      ) : (
        <>
          <path d="M12 12h.01" />
          <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          <path d="M22 13a18.15 18.15 0 0 1-20 0" />
          <rect width="20" height="14" x="2" y="6" rx="2" />
        </>
      )}
    </svg>
  );
}

function Pill({ children, muted = false, size = 34 }: { children: string; muted?: boolean; size?: number }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 24px",
        borderRadius: 999,
        fontSize: size,
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

/** Sizes of the job image's parts. Landscape is the link preview; square (1:1) is for posting to feeds. */
const LAYOUTS = {
  landscape: { size: OG_SIZE, padding: "56px 64px", maxWidth: 1040 as number | undefined, title: 54, titleLines: 2, where: 34, pill: 34, tag: 28, footer: 28, gap: 24 },
  square: { size: SQUARE_SIZE, padding: "72px", maxWidth: 936 as number | undefined, title: 80, titleLines: 3, where: 36, pill: 40, tag: 34, footer: 32, gap: 36 },
};

function jobImageTree(m: PreviewMeta, l: (typeof LAYOUTS)[keyof typeof LAYOUTS]) {
  const iconSize = Math.round(l.where * 0.95);
  const WHERE_COLOR = "#d4d4d4";
  return (
    <div style={{ ...root, padding: l.padding }}>
      <Brand />
      {/* title and facts stay inside the margin, in the left part of the image */}
      <div style={{ display: "flex", flexDirection: "column", gap: l.gap, ...(l.maxWidth ? { maxWidth: l.maxWidth } : {}) }}>
        <div
          style={{
            display: "flex",
            fontSize: l.title,
            lineHeight: 1.15,
            // the clamped lines fit; maxHeight is the backup if lineClamp is ignored
            maxHeight: Math.ceil(l.title * 1.15 * l.titleLines) + 4,
            overflow: "hidden",
            fontWeight: 700,
            letterSpacing: -1,
            lineClamp: l.titleLines,
            textOverflow: "ellipsis",
          }}
        >
          {m.imageTitle}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: l.where, color: WHERE_COLOR, overflow: "hidden", whiteSpace: "nowrap" }}>
          {m.imageCompany ? <BuildingIcon size={iconSize} color={WHERE_COLOR} /> : null}
          {m.imageCompany ? <div style={{ display: "flex" }}>{m.imageCompany}</div> : null}
          {m.imageCompany && m.imageLocation ? <div style={{ display: "flex", color: MUTED, padding: "0 4px" }}>•</div> : null}
          {m.imageLocation ? <MapPinIcon size={iconSize} color={WHERE_COLOR} /> : null}
          {m.imageLocation ? <div style={{ display: "flex" }}>{m.imageLocation}</div> : null}
          {m.imageWorkMode && (m.imageCompany || m.imageLocation) ? <div style={{ display: "flex", color: MUTED, padding: "0 4px" }}>•</div> : null}
          {m.imageWorkMode ? <WorkModeIcon mode={m.imageWorkMode} size={iconSize} color={WHERE_COLOR} /> : null}
          {m.imageWorkMode ? <div style={{ display: "flex" }}>{WORK_MODE_LABEL[m.imageWorkMode]}</div> : null}
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Pill size={l.pill}>{`Experience: ${m.experience}`}</Pill>
          {m.agePill ? (
            <Pill size={l.pill} muted={m.closed}>
              {m.agePill}
            </Pill>
          ) : null}
        </div>
        {m.imageTags.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {m.imageTags.map((t) => (
              <div key={t} style={{ display: "flex", padding: "6px 18px", borderRadius: 999, background: "#262626", fontSize: l.tag, color: "#e5e5e5" }}>
                {t}
              </div>
            ))}
            {m.moreTags > 0 ? (
              <div style={{ display: "flex", padding: "6px 18px", borderRadius: 999, border: "2px solid #404040", fontSize: l.tag, color: MUTED }}>
                {`+${m.moreTags}`}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div style={{ display: "flex", fontSize: l.footer, color: "#737373" }}>jobs.fastorial.dev</div>
    </div>
  );
}

/** Title, company and location, key fact pills, tag chips. All text comes pre-truncated from buildPreviewMeta. */
export async function jobOgImage(m: PreviewMeta) {
  return new ImageResponse(jobImageTree(m, LAYOUTS.landscape), { ...LAYOUTS.landscape.size, fonts: await loadOgFonts() });
}

/** The same image as `jobOgImage`, in a 1:1 ratio (1080 x 1080) for feeds that crop wide images. */
export async function jobSquareImage(m: PreviewMeta) {
  return new ImageResponse(jobImageTree(m, LAYOUTS.square), { ...LAYOUTS.square.size, fonts: await loadOgFonts() });
}
