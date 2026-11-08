#version 300 es
precision highp float;
uniform sampler2D uField;
uniform float uTexels;
uniform float uCutoff;
uniform float uHairThin;
uniform float uInk;
uniform float uTone;
uniform int uCount;
uniform vec4 uAttr[16];
uniform float uKind[16];
in vec2 vUv;
out vec4 oColor;

float tap(vec2 st) {
  return texture(uField, clamp(st, 0.0, 1.0)).r;
}

float bspline0(float t) { return (1.0 - t) * (1.0 - t) * (1.0 - t) / 6.0; }
float bspline1(float t) { return (3.0 * t * t * t - 6.0 * t * t + 4.0) / 6.0; }
float bspline2(float t) { return (-3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0) / 6.0; }
float bspline3(float t) { return t * t * t / 6.0; }

float bilinear(vec2 uv) {
  vec2 p = clamp(uv, 0.0, 1.0) * uTexels - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 d = vec2(1.0) / uTexels;
  float a = tap((i + 0.5) * d);
  float b = tap((i + vec2(1.5, 0.5)) * d);
  float c = tap((i + vec2(0.5, 1.5)) * d);
  float e = tap((i + vec2(1.5, 1.5)) * d);
  return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
}

float fieldAt(vec2 uv) {
  vec2 p = clamp(uv, 0.0, 1.0) * uTexels - 0.5;
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 d = vec2(1.0) / uTexels;
  float wx[4];
  wx[0] = bspline0(f.x);
  wx[1] = bspline1(f.x);
  wx[2] = bspline2(f.x);
  wx[3] = bspline3(f.x);
  float wy[4];
  wy[0] = bspline0(f.y);
  wy[1] = bspline1(f.y);
  wy[2] = bspline2(f.y);
  wy[3] = bspline3(f.y);
  float acc = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      acc += tap((i + vec2(float(x - 1), float(y - 1)) + 0.5) * d) * wx[x] * wy[y];
    }
  }
  return max(0.0, acc);
}

float distToSeg(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float den = dot(ab, ab);
  float t = den > 0.000001 ? clamp(dot(p - a, ab) / den, 0.0, 1.0) : 0.0;
  return length(p - (a + ab * t));
}

float attractorNear(vec2 uv) {
  if (uCount <= 0) return 0.0;
  float best = 1.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uCount) break;
    vec4 a = uAttr[i];
    float kind = uKind[i];
    float d = distance(uv, a.xy);
    if (kind > 1.5) d = distToSeg(uv, a.xy, a.zw);
    else if (kind > 0.5) d = abs(distance(uv, a.xy) - a.z);
    best = min(best, d);
  }
  return 1.0 - smoothstep(0.0, 0.16, best);
}

void main() {
  float t = 1.0 / uTexels;
  float vSmooth = fieldAt(vUv);
  float vSharp = bilinear(vUv);
  float v = uHairThin > 0.5 && vSmooth < 0.14 ? vSharp : vSmooth;
  float e = uHairThin > 0.5 ? bilinear(vUv + vec2(t, 0.0)) : fieldAt(vUv + vec2(t, 0.0));
  float w = uHairThin > 0.5 ? bilinear(vUv - vec2(t, 0.0)) : fieldAt(vUv - vec2(t, 0.0));
  float n = uHairThin > 0.5 ? bilinear(vUv + vec2(0.0, t)) : fieldAt(vUv + vec2(0.0, t));
  float s = uHairThin > 0.5 ? bilinear(vUv - vec2(0.0, t)) : fieldAt(vUv - vec2(0.0, t));
  float ne = uHairThin > 0.5 ? bilinear(vUv + vec2(t, t)) : fieldAt(vUv + vec2(t, t));
  float nw = uHairThin > 0.5 ? bilinear(vUv + vec2(-t, t)) : fieldAt(vUv + vec2(-t, t));
  float se = uHairThin > 0.5 ? bilinear(vUv + vec2(t, -t)) : fieldAt(vUv + vec2(t, -t));
  float sw = uHairThin > 0.5 ? bilinear(vUv + vec2(-t, -t)) : fieldAt(vUv + vec2(-t, -t));
  float around = 0.125 * (e + w + n + s + ne + nw + se + sw);
  float ridge = max(0.0, v - around * 0.62);
  vec2 g = vec2(e - w, n - s);
  float glen = length(g);
  vec2 along = glen > 1.0e-6 ? vec2(-g.y, g.x) / glen : vec2(1.0, 0.0);
  float tissue = v;
  bool link = uHairThin > 0.5 ? (v > 0.12 || ridge > 0.02) : (v > 0.04 || ridge > 0.005);
  if (link) {
    float linked = v;
    for (int i = 1; i <= 8; i++) {
      float step = float(i) * t * 1.6;
      linked = max(linked, fieldAt(vUv + along * step));
      linked = max(linked, fieldAt(vUv - along * step));
    }
    tissue = max(v, linked * 0.96);
  }

  float membrane = smoothstep(0.24, 0.48, tissue);
  float hair = smoothstep(0.012, 0.032, ridge) * (1.0 - smoothstep(0.055, 0.11, ridge)) * smoothstep(0.012, 0.04, v);
  float cover = max(membrane * 0.92, hair);
  if (cover < 0.05) {
    oColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 peach = mix(vec3(150.0, 112.0, 96.0), vec3(196.0, 154.0, 132.0), smoothstep(0.22, 0.7, tissue)) / 255.0;
  vec3 paper = vec3(235.0, 225.0, 220.0) / 255.0;
  vec3 stain = vec3(79.0, 112.0, 105.0) / 255.0;
  float teal = membrane * (1.0 - hair) * smoothstep(0.86, 0.98, tissue);
  vec3 ink = mix(peach, paper, clamp(hair, 0.0, 1.0));
  ink = mix(ink, stain, teal);
  oColor = vec4(ink * cover, 1.0);
}