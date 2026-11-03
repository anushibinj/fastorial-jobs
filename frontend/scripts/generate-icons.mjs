// Exports PNG icons and the favicon from assets/logo.svg. Run with: pnpm gen:icons
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const logo = await readFile(join(root, "assets/logo.svg"));
const maskable = await readFile(join(root, "assets/logo-maskable.svg"));
await mkdir(join(root, "public/icons"), { recursive: true });

const png = (svg, size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer();

await writeFile(join(root, "public/icons/icon-192.png"), await png(logo, 192));
await writeFile(join(root, "public/icons/icon-512.png"), await png(logo, 512));
await writeFile(join(root, "public/icons/icon-maskable-512.png"), await png(maskable, 512));
// Next.js file conventions: <link rel="apple-touch-icon"> and <link rel="icon">
await writeFile(join(root, "app/apple-icon.png"), await png(maskable, 180));
await writeFile(join(root, "app/icon.svg"), logo);

// favicon.ico: a single 48x48 PNG wrapped in an ICO container
const ico = await png(logo, 48);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count
header.writeUInt8(48, 6); // width
header.writeUInt8(48, 7); // height
header.writeUInt16LE(1, 10); // planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(ico.length, 14); // image size
header.writeUInt32LE(22, 18); // image offset
await writeFile(join(root, "app/favicon.ico"), Buffer.concat([header, ico]));
console.log("icons written");
