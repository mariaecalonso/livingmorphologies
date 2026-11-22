import sharp from "sharp";

async function main() {
const sim = "public/assets/skill0/void-growth-2.gif";
for (const page of [1, 2, 3, 4, 5]) {
  const { data, info } = await sharp(sim, { page }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  let ink = 0;
  for (let i = 0; i < out.length; i += 4) {
    const red = out[i];
    const green = out[i + 1];
    const blue = out[i + 2];
    const paper = red > 175 && green > 165 && blue > 145 && red - blue < 50;
    if (paper) ink += 1;
    out[i] = paper ? 255 : 0;
    out[i + 1] = paper ? 255 : 0;
    out[i + 2] = paper ? 255 : 0;
    out[i + 3] = paper ? 255 : 0;
  }
  const name = `public/assets/skill0/study-sim/${String(page - 1).padStart(2, "0")}.png`;
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(name);
  console.log(page, "ink", ink);
}

const bio = "app/lab/physarum-video/clips/front.gif";
const meta = await sharp(bio, { animated: true }).metadata();
console.log("front", meta.pages, meta.width, meta.pageHeight);
for (const page of [0, 8, 16, 24, 32, 40]) {
  await sharp(bio, { page }).png().toFile(`C:/Users/julie/AppData/Local/Temp/front-${page}.png`);
}
}

void main();
