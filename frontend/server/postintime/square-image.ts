import type { JobDetail } from "@/lib/api/contract";
import type { RenderedImage } from "@/server/postintime/postintime-publisher";

/**
 * Draws the 1:1 version of a job's link preview image as a PNG: the same design and the same
 * `buildPreviewMeta` text as the `/jobs/{slug}/opengraph-image` route, in 1080 x 1080.
 *
 * The image code is imported on first use, so loading the service container does not load Satori.
 */
export async function renderJobSquareImage(job: JobDetail): Promise<RenderedImage> {
  const [{ jobSquareImage }, { buildPreviewMeta }] = await Promise.all([import("@/lib/og"), import("@/lib/preview")]);
  const response = await jobSquareImage(buildPreviewMeta(job));
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: "image/png" };
}
