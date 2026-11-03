import { defaultOgImage, OG_SIZE } from "@/lib/og";
import { SITE_NAME } from "@/lib/site";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = SITE_NAME;

/** Default preview for the home page and filtered list pages. */
export default function Image() {
  return defaultOgImage();
}
