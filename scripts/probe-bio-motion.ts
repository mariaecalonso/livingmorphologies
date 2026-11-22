import sharp from "sharp";

async function main() {
  const file = "app/lab/physarum-video/clips/front.gif";
  const meta = await sharp(file, { animated: true }).metadata();
  const pages = meta.pages ?? 1;
  const width = meta.width ?? 0;
  const height = meta.pageHeight ?? meta.height ?? 0;
  console.log("pages", pages, "frame", width, height, "delay", meta.delay);
  let previous: Buffer | null = null;
  let px = 0;
  let py = 0;
  for (let page = 0; page < pages; page += 1) {
    const { data } = await sharp(file, { page }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let count = 0;
    let sx = 0;
    let sy = 0;
    let diff = 0;
    let compared = 0;
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const index = (y * width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        if (red > 140 && green > 110 && blue < 100) {
          count += 1;
          sx += x;
          sy += y;
        }
        if (previous) {
          compared += 1;
          diff += Math.abs(red - previous[index]) + Math.abs(green - previous[index + 1]) + Math.abs(blue - previous[index + 2]);
        }
      }
    }
    const cx = count ? sx / count / width : 0;
    const cy = count ? sy / count / height : 0;
    const jump = page === 0 ? 0 : Math.hypot((cx - px) * width, (cy - py) * height);
    const mean = compared ? diff / compared : 0;
    if (page % 4 === 0 || jump > 8) console.log(page, "centroid", cx.toFixed(3), cy.toFixed(3), "shift", jump.toFixed(1), "delta", mean.toFixed(1), "yellow", count);
    px = cx;
    py = cy;
    previous = data;
  }
}

async function junction() {
  const file = "app/lab/physarum-video/clips/front.gif";
  const page = 36;
  const { data, info } = await sharp(file, { page }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const height = info.height;
  const yellow = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const index = (y * width + x) * 4;
    return data[index] > 120 && data[index + 1] > 90 && data[index + 2] < 110 ? 1 : 0;
  };
  let best = { x: 0, y: 0, score: 0 };
  for (let y = 8; y < height - 8; y += 3) {
    for (let x = 8; x < width - 8; x += 3) {
      if (!yellow(x, y)) continue;
      let arms = 0;
      for (let sector = 0; sector < 8; sector += 1) {
        const angle = (sector / 8) * Math.PI * 2;
        let hit = 0;
        for (let radius = 4; radius <= 14; radius += 2) {
          if (yellow(Math.round(x + Math.cos(angle) * radius), Math.round(y + Math.sin(angle) * radius))) hit += 1;
        }
        if (hit >= 2) arms += 1;
      }
      const score = arms * 10 - Math.abs(x / width - 0.62) * 8;
      if (score > best.score) best = { x: x / width, y: y / height, score };
    }
  }
  console.log("junction", best.x.toFixed(3), best.y.toFixed(3), "score", best.score.toFixed(1));
  await sharp(file, { page }).png().toFile("C:/Users/julie/AppData/Local/Temp/bio-junction.png");
}

void junction();
