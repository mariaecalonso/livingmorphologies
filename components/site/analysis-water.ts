import {
  DataTexture,
  DoubleSide,
  RGBAFormat,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  UniformsLib,
  UniformsUtils,
  Vector2,
} from "three";

/** World feet per texture tile. Large enough that the wave bands remain visible from the full-site view. The pair matches the source image aspect. */
const REPEAT = new Vector2(1 / 720, 1 / 405);

const placeholder = new DataTexture(new Uint8Array([9, 14, 16, 255]), 1, 1, RGBAFormat);
placeholder.colorSpace = SRGBColorSpace;
placeholder.needsUpdate = true;

/**
 * Site Analysis bay. The supplied dark photograph colors the existing slab.
 * World XZ repeats it. The mesh stays put, and the vertical edge stays flat.
 */
export const ANALYSIS_WATER = new ShaderMaterial({
  lights: true,
  side: DoubleSide,
  toneMapped: false,
  uniforms: UniformsUtils.merge([
    UniformsLib.lights,
    { uMap: { value: placeholder }, uRepeat: { value: REPEAT } },
  ]),
  vertexShader: `
    #include <common>
    #include <shadowmap_pars_vertex>
    varying vec3 vWorld;
    varying float vTop;
    void main() {
      vTop = step(0.49, position.y);
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      #include <worldpos_vertex>
      #include <shadowmap_vertex>
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    }
  `,
  fragmentShader: `
    #include <common>
    #include <packing>
    #include <lights_pars_begin>
    #include <shadowmap_pars_fragment>
    #include <shadowmask_pars_fragment>
    uniform sampler2D uMap;
    uniform vec2 uRepeat;
    varying vec3 vWorld;
    varying float vTop;
    void main() {
      vec3 color = vec3(0.035, 0.046, 0.052);
      if (vTop > 0.5) {
        vec2 uv = vec2(-vWorld.z, vWorld.x) * uRepeat;
        vec3 photographed = texture2D(uMap, uv).rgb;
        vec3 shifted = texture2D(uMap, uv + vec2(0.5, 0.37)).rgb;
        float cover = smoothstep(0.0, 0.2, fract(uv.x)) * smoothstep(0.0, 0.2, fract(-uv.x));
        cover *= smoothstep(0.0, 0.2, fract(uv.y)) * smoothstep(0.0, 0.2, fract(-uv.y));
        vec3 waves = mix(shifted, photographed, cover);
        color = pow(max(waves, vec3(0.0)), vec3(0.55)) * 0.72;
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fresnel = pow(1.0 - clamp(dot(vec3(0.0, 1.0, 0.0), viewDir), 0.0, 1.0), 5.0);
        color += vec3(0.015, 0.02, 0.024) * fresnel;
      }
      color = mix(color * 0.82, color, getShadowMask());
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

export const ANALYSIS_WATER_URL = "/lab/site/water-surface.jpg";

export function applyAnalysisWaterTexture(texture: Texture) {
  const current = ANALYSIS_WATER.uniforms.uMap.value as Texture | null;
  ANALYSIS_WATER.uniforms.uMap.value = texture;
  ANALYSIS_WATER.needsUpdate = true;
  if (current && current !== texture && current !== placeholder) current.dispose();
}

export function markAnalysisWaterShadows() {
  ANALYSIS_WATER.needsUpdate = true;
}
