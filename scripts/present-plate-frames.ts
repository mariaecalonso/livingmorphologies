/**
 * Paints presentation frames with the filament shader that drew the stored Vertical Void plate:
 * white hairs, copper body, teal where the colony organizes. The Lab's current ink is left alone.
 */
import { readFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { FIELD_SIZE } from "../lib/skill1/maps";
import type { FieldAttractor } from "../lib/skill1/types";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const FRAG = readFileSync("scripts/present-plate-shader.glsl", "utf8");

const PAGE = `<!doctype html><meta charset="utf-8"><canvas id="c"></canvas><script>
const VERT = \`#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}\`;
const FRAG = ${JSON.stringify(FRAG)};
function draw(payload) {
  const canvas = document.getElementById("c");
  canvas.width = payload.size;
  canvas.height = payload.size;
  const gl = canvas.getContext("webgl2", { antialias: true, premultipliedAlpha: false, alpha: true });
  if (!gl) return "no webgl2";
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return gl.getShaderInfoLog(shader);
    return shader;
  };
  const vert = compile(gl.VERTEX_SHADER, VERT);
  const frag = compile(gl.FRAGMENT_SHADER, FRAG);
  if (typeof vert === "string" || typeof frag === "string") return String(vert) + "\\n" + String(frag);
  const program = gl.createProgram();
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return gl.getProgramInfoLog(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.viewport(0, 0, payload.size, payload.size);
  gl.useProgram(program);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, payload.trailSize, payload.trailSize, 0, gl.RED, gl.FLOAT, new Float32Array(payload.trails));
  const loc = (name) => gl.getUniformLocation(program, name);
  gl.uniform1i(loc("uField"), 0);
  gl.uniform1f(loc("uTexels"), payload.trailSize);
  gl.uniform1f(loc("uCutoff"), 0);
  gl.uniform1f(loc("uHairThin"), 1);
  gl.uniform1f(loc("uInk"), 1.45);
  gl.uniform1f(loc("uTone"), 2);
  gl.uniform1i(loc("uCount"), payload.count);
  gl.uniform4fv(loc("uAttr"), payload.packed);
  gl.uniform1fv(loc("uKind"), payload.kinds);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const raw = new Uint8Array(payload.size * payload.size * 4);
  gl.readPixels(0, 0, payload.size, payload.size, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const flipped = new Uint8Array(raw.length);
  const row = payload.size * 4;
  for (let y = 0; y < payload.size; y++) flipped.set(raw.subarray((payload.size - 1 - y) * row, (payload.size - y) * row), y * row);
  return Array.from(flipped);
}
window.draw = draw;
</script>`;

export async function renderPlateFrames(
  frames: { trails: number[]; trailSize: number }[],
  attractors: FieldAttractor[],
  size: number,
) {
  const packed = new Array<number>(64).fill(0);
  const kinds = new Array<number>(16).fill(0);
  const count = Math.min(16, attractors.length);
  attractors.slice(0, count).forEach((item, index) => {
    const x = item.x / FIELD_SIZE;
    const y = item.y / FIELD_SIZE;
    if (item.kind === "line" || item.kind === "curve") {
      packed.splice(index * 4, 4, x, y, (item.x2 ?? item.x) / FIELD_SIZE, (item.y2 ?? item.y) / FIELD_SIZE);
      kinds[index] = 2;
    } else if (item.kind === "ring") {
      packed.splice(index * 4, 4, x, y, (item.radius ?? 4) / FIELD_SIZE, 0);
      kinds[index] = 1;
    } else {
      packed.splice(index * 4, 4, x, y, 0, 0);
    }
  });
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(PAGE, { waitUntil: "load" });
    const painted: Uint8Array[] = [];
    for (const frame of frames) {
      const rgba = await page.evaluate(
        (payload) => (window as unknown as { draw: (value: typeof payload) => number[] | string | null }).draw(payload),
        { trails: frame.trails, trailSize: frame.trailSize, size, count, packed, kinds },
      );
      if (!rgba || typeof rgba === "string") throw new Error(rgba ?? "WebGL2 unavailable");
      painted.push(Uint8Array.from(rgba));
    }
    return painted;
  } finally {
    await browser.close();
  }
}
