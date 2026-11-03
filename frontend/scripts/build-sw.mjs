// Bundles sw/sw.ts into public/sw.js and injects the precache list.
// Runs after `next build` because it lists the hashed files in .next/static.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (!e.name.endsWith(".map")) out.push(p);
  }
  return out;
}

const buildId = (await readFile(join(root, ".next/BUILD_ID"), "utf8")).trim();
const staticFiles = await walk(join(root, ".next/static"));
const iconFiles = await walk(join(root, "public/icons"));

const manifest = [
  { url: "/offline", revision: buildId },
  // content hashed, so no revision needed
  ...staticFiles.map((f) => ({ url: "/_next/static/" + relative(join(root, ".next/static"), f).split("\\").join("/"), revision: null })),
  ...iconFiles.map((f) => ({ url: "/icons/" + relative(join(root, "public/icons"), f).split("\\").join("/"), revision: buildId })),
];

await build({
  entryPoints: [join(root, "sw/sw.ts")],
  outfile: join(root, "public/sw.js"),
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  define: { "self.__SW_MANIFEST": JSON.stringify(manifest), "process.env.NODE_ENV": '"production"' },
});
console.log(`service worker built with ${manifest.length} precache entries`);
