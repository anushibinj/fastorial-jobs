import { describe, expect, it } from "vitest";
import { jobOgImage, jobSquareImage, OG_SIZE, SQUARE_SIZE } from "./og";
import { buildPreviewMeta } from "./preview";
import type { JobLike } from "./types";

const tag = (name: string) => ({ name, slug: name.toLowerCase(), category: "TOOL" as const });
const NOW = new Date("2026-03-15T10:00:00+05:30");

const job: JobLike = {
  slug: "senior-java-engineer-acme-hyderabad-1",
  title: "Senior Java Engineer",
  companyName: "Acme Corp",
  locationCity: "Hyderabad",
  workMode: "HYBRID",
  experienceMinYears: 7,
  experienceMaxYears: null,
  status: "PUBLISHED",
  postedAt: "2026-03-12T09:00:00+05:30",
  tags: [tag("Java"), tag("Spring Boot"), tag("Kafka")],
};

/** Width and height from the IHDR chunk of a PNG. */
function pngSize(bytes: Uint8Array): { width: number; height: number; signature: string } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { signature: Buffer.from(bytes.slice(1, 4)).toString(), width: v.getUint32(16), height: v.getUint32(20) };
}

describe("job images", () => {
  it("renders the link preview at 1200 x 630", async () => {
    const res = await jobOgImage(buildPreviewMeta(job, NOW));
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toEqual({ signature: "PNG", ...OG_SIZE });
  });

  it("renders the same image at a 1:1 ratio", async () => {
    const res = await jobSquareImage(buildPreviewMeta(job, NOW));
    expect(res.headers.get("content-type")).toBe("image/png");
    const size = pngSize(new Uint8Array(await res.arrayBuffer()));
    expect(size).toEqual({ signature: "PNG", ...SQUARE_SIZE });
    expect(size.width).toBe(size.height);
  });

  it("renders the worst case (long text, many tags, closed) as a square", async () => {
    const worst: JobLike = {
      ...job,
      title: "Principal Staff Senior Distinguished Software Engineer, Platform Reliability and Developer Experience",
      companyName: "A Very Long Company Name Incorporated International",
      locationCity: "Thiruvananthapuram",
      status: "CLOSED",
      tags: Array.from({ length: 12 }, (_, i) => tag(`Technology${i}`)),
    };
    const res = await jobSquareImage(buildPreviewMeta(worst, NOW));
    expect(pngSize(new Uint8Array(await res.arrayBuffer()))).toMatchObject(SQUARE_SIZE);
  });
});
