'use client';

import { useMemo, useRef } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Color, ImageLoader, PlaneGeometry, ShaderMaterial, Float32BufferAttribute } from 'three';
import terrain from '../../../public/story/terrain.json';
import { sceneStore } from './sceneStore';
import { atmosphere } from './atmosphere';
import { SKY_GLSL } from './skyGlsl';

export const WORLD = 20;
export const RELIEF = 2.2; // scene units for the full min..max elevation range
export const GROUND = 40; // the plane is wider than the data: outside it the relief flattens into a skirt

import { TOWN } from './town';
const [TOWN_X, TOWN_Z] = TOWN;

// Heights decoded on the CPU (no texture sampling in the shader: filtering and colour space would distort them).
export function heightField(img: HTMLImageElement): { w: number; h: number; data: Uint8ClampedArray } {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height).data };
}

// Bilinear height (0..1) at u, v ∈ [0, 1].
export function makeSampler(field: { w: number; h: number; data: Uint8ClampedArray }) {
  const { w, h, data } = field;
  const at = (x: number, y: number) => data[(y * w + x) * 4]! / 255;
  return (u: number, v: number) => {
    const fx = Math.min(w - 1.001, Math.max(0, u * (w - 1)));
    const fy = Math.min(h - 1.001, Math.max(0, v * (h - 1)));
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const ax = fx - ix;
    const ay = fy - iy;
    return (at(ix, iy) * (1 - ax) + at(ix + 1, iy) * ax) * (1 - ay) + (at(ix, iy + 1) * (1 - ax) + at(ix + 1, iy + 1) * ax) * ay;
  };
}

// Reflect a coordinate back into [0, 1] (triangle wave), so the relief continues mirrored past the data.
const mirror = (u: number) => {
  const m = ((u % 2) + 2) % 2;
  return m > 1 ? 2 - m : m;
};

// How far each vertex sits below its neighbourhood (separable box blur minus height), scaled to 0..1.
export function valleyField(h: Float32Array, side: number, radius: number): Float32Array {
  const tmp = new Float32Array(h.length);
  const blur = new Float32Array(h.length);
  const pass = (src: Float32Array, dst: Float32Array, horizontal: boolean) => {
    for (let a = 0; a < side; a++) {
      let sum = 0;
      let n = 0;
      const idx = (b: number) => (horizontal ? a * side + b : b * side + a);
      for (let b = -radius; b <= radius; b++) if (b >= 0 && b < side) (sum += src[idx(b)]!), n++;
      for (let b = 0; b < side; b++) {
        dst[idx(b)] = sum / n;
        const out = b - radius;
        const inn = b + radius + 1;
        if (out >= 0) (sum -= src[idx(out)]!), n--;
        if (inn < side) (sum += src[idx(inn)]!), n++;
      }
    }
  };
  pass(h, tmp, true);
  pass(tmp, blur, false);
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) out[i] = Math.min(1, Math.max(0, (blur[i]! - h[i]!) * 9));
  return out;
}

const vertex = /* glsl */ `
  attribute float aHeightM;
  attribute float aNorm;
  attribute float aValley;
  varying float vValley;
  varying float vHeightM;
  varying float vNorm;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDist;
  void main() {
    vHeightM = aHeightM;
    vNorm = aNorm;
    vValley = aValley;
    vNormal = normalize(normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  uniform float uDusk;
  uniform float uClear;
  uniform float uSmog;
  uniform float uTime;
  uniform float uFogDensity;
  uniform float uBg;
  uniform vec2 uTown;
  varying float vHeightM;
  varying float vNorm;
  varying float vValley;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDist;

  ${SKY_GLSL}
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 ramp(vec3 a, vec3 b, vec3 c, float t) {
    return t < 0.5 ? mix(a, b, t * 2.0) : mix(b, c, (t - 0.5) * 2.0);
  }

  void main() {
    vec3 n = normalize(vNormal);
    float t = clamp(vNorm, 0.0, 1.0);

    // Night and day palettes by height.
    vec3 night = ramp(vec3(0.06, 0.08, 0.2), vec3(0.17, 0.24, 0.5), vec3(0.45, 0.52, 0.84), t);
    vec3 day = ramp(vec3(0.62, 0.68, 0.9), vec3(0.8, 0.84, 0.97), vec3(0.97, 0.98, 1.0), t);

    // Light: a low warm sun at dusk, high and soft by day.
    vec3 sunDusk = normalize(vec3(-0.7, 0.32, -0.45));
    vec3 sunDay = normalize(vec3(-0.35, 0.85, 0.3));
    float lDusk = max(dot(n, sunDusk), 0.0);
    float lDay = max(dot(n, sunDay), 0.0);
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    vec3 duskLit = night * (0.5 + 1.0 * lDusk) + vec3(0.95, 0.52, 0.3) * pow(lDusk, 2.5) * 0.45 + vec3(0.35, 0.4, 0.85) * rim * 0.35;
    vec3 dayLit = day * (0.62 + 0.45 * lDay);
    vec3 col = mix(duskLit, dayLit, uClear);

    // Contour lines every 25 m, anti-aliased.
    float c = vHeightM / 25.0;
    float w = fwidth(c) * 1.2;
    float line = 1.0 - smoothstep(0.0, w, abs(fract(c - 0.5) - 0.5));
    vec3 lineDusk = vec3(0.55, 0.62, 1.0);
    vec3 lineDay = vec3(0.31, 0.27, 0.9);
    col = mix(col, mix(lineDusk, lineDay, uClear), line * mix(0.22, 0.35, uClear) * (1.0 - uSmog * 0.7));

    // River channels (local hollows) glow faintly at dusk: the Yantra and its meanders.
    float river = smoothstep(0.3, 0.8, vValley) * (1.0 - smoothstep(0.12, 0.38, t));
    col += vec3(0.3, 0.6, 1.0) * river * 0.55 * (1.0 - uClear) * (1.0 - uSmog * 0.6);
    col = mix(col, vec3(0.42, 0.52, 0.86), river * 0.35 * uClear);

    // Smog: desaturate and lift towards ochre-grey, thickest in the valley.
    float smogMask = uSmog * clamp(1.0 - t * 0.55 + river * 0.3, 0.0, 1.0);
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, mix(vec3(grey), vec3(0.6, 0.565, 0.494), 0.7), smogMask * 0.75);

    // Town lights: sodium points in the low ground around the centre, haloed by smog, off by day.
    float dTown = length(vWorld.xz - uTown);
    float townMask = (1.0 - smoothstep(0.8, 2.8, dTown)) * (1.0 - smoothstep(0.35, 0.7, t));
    vec2 cell = floor(vWorld.xz * 22.0);
    float bulb = step(0.86, hash(cell));
    vec2 f = fract(vWorld.xz * 22.0) - 0.5;
    float dot1 = bulb * (1.0 - smoothstep(0.05, 0.32, length(f)));
    float flicker = 0.85 + 0.15 * sin(uTime * 3.0 + hash(cell + 7.0) * 40.0);
    vec3 sodium = vec3(1.0, 0.69, 0.36);
    float night01 = (1.0 - uClear);
    col += sodium * townMask * night01 * (dot1 * flicker * (2.2 - uSmog * 1.4) + 0.22 * (0.5 + uSmog));

    // Edges dissolve into the sky.
    float edge = smoothstep(1.25, 1.85, length(vWorld.xz) / ${(WORLD / 2).toFixed(1)});
    // Exponential-squared fog.
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDist * vDist);
    vec3 sky = skyColor(normalize(vWorld - cameraPosition), uDusk, uSmog, uClear, uBg);
    col = mix(col, sky, clamp(max(fog, edge), 0.0, 1.0));
    // Chapter 3: the valley sinks into the night so the sensors over Bulgaria carry the frame.
    col = mix(col, sky, uBg);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Terrain({ segments }: { segments: number }) {
  const img = useLoader(ImageLoader, '/story/terrain.png');
  const fogColor = useRef(new Color());

  const geometry = useMemo(() => {
    const sample = makeSampler(heightField(img));
    const g = new PlaneGeometry(GROUND, GROUND, segments, segments);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position!;
    const meters = new Float32Array(pos.count);
    const norms = new Float32Array(pos.count);
    const half = WORLD / 2;
    const side = segments + 1;
    const raw = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // Outside the data: mirror the relief (no edge stripes) and flatten it towards the plain.
      const out = Math.max(Math.abs(x), Math.abs(z)) / half;
      const flatten = out <= 0.95 ? 1 : Math.max(0, 1 - (out - 0.95) / 0.8);
      raw[i] = sample(mirror((x + half) / WORLD), mirror((z + half) / WORLD)) * (0.3 + 0.7 * flatten);
    }
    const valley = valleyField(raw, side, Math.round(segments / 48));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const hn = raw[i]!;
      void x;
      void z;
      pos.setY(i, hn * RELIEF);
      meters[i] = terrain.minM + hn * (terrain.maxM - terrain.minM);
      norms[i] = hn;
    }
    g.setAttribute('aHeightM', new Float32BufferAttribute(meters, 1));
    g.setAttribute('aNorm', new Float32BufferAttribute(norms, 1));
    g.setAttribute('aValley', new Float32BufferAttribute(valley, 1));
    g.computeVertexNormals();
    return g;
  }, [img, segments]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: {
          uDusk: { value: 1 },
          uClear: { value: 0 },
          uSmog: { value: 0 },
          uTime: { value: 0 },
          uFogDensity: { value: 0.03 },
          uTown: { value: [TOWN_X, TOWN_Z] },
          uBg: { value: 0 },
        },
      }),
    [],
  );

  useFrame(({ clock }) => {
    const s = sceneStore.state;
    const u = material.uniforms;
    u.uDusk!.value = s.dusk;
    u.uClear!.value = s.clear;
    u.uSmog!.value = sceneStore.smog;
    u.uTime!.value = clock.elapsedTime;
    u.uBg!.value = s.sensorsBg;
    u.uFogDensity!.value = atmosphere(s, fogColor.current).fogDensity;
  });

  return <mesh geometry={geometry} material={material} />;
}
