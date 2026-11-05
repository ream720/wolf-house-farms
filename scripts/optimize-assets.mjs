import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public/images", { recursive: true });
for (const name of [
  "desert-hero",
  "agave",
  "hawk",
  "la-sandia",
  "cherry-zushi",
  "albany-chocolate",
  "spanish-blue",
]) {
  const info = await sharp(`assets/artwork/${name}-source.png`)
    .resize({
      width: name === "desert-hero" ? 1536 : 960,
      withoutEnlargement: true,
    })
    .webp({ quality: 86 })
    .toFile(`public/images/${name}.webp`);
  console.log(`${name}: ${Math.round(info.size / 1024)} KB`);
}
