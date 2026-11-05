import { describe, expect, it } from "vitest";
import type { JobDetail } from "@/lib/api/contract";
import { renderJobSquareImage } from "@/server/postintime/square-image";
import { JAVA } from "@/server/testing/fakes.testkit";

const job: JobDetail = {
  id: 1, slug: "j-1", title: "Senior Java Engineer", companyName: "Acme", companyLogoUrl: null, description: "",
  applyUrl: "https://example.com/a", source: "LINKEDIN", locationCity: "Pune", locationState: null, locationCountry: null,
  workMode: "REMOTE", experienceMinYears: 3, experienceMaxYears: null, salaryMin: null, salaryMax: null, salaryCurrency: null,
  salaryPeriod: null, status: "PUBLISHED", postedAt: new Date().toISOString(), expiresAt: null, updatedAt: new Date().toISOString(), tags: [JAVA],
};

describe("renderJobSquareImage", () => {
  it("returns a 1080 x 1080 PNG", async () => {
    const image = await renderJobSquareImage(job);
    const v = new DataView(image.bytes.buffer, image.bytes.byteOffset, image.bytes.byteLength);
    expect(image.contentType).toBe("image/png");
    expect([v.getUint32(16), v.getUint32(20)]).toEqual([1080, 1080]);
  });
});
