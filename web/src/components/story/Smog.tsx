'use client';

import { useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, ImageLoader, NormalBlending, ShaderMaterial } from 'three';
import { LEVEL_COLORS } from '@/lib/aq/levels';
import { STORY_FACTS } from '@/lib/story/numbers';
import { barTargets, mulberry32, streamTargets } from '@/lib/story/smog';
import { heightField, makeSampler, RELIEF, WORLD } from './Terrain';
import { sceneStore } from './sceneStore';
import { TOWN } from './town';

const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3)).join(', ');
};

const vertex = /* glsl */ `
  attribute vec3 aBar;
  attribute vec3 aStream;
  attribute float aBarGroup;
  attribute float aStreamGroup;
  attribute float aRand;
  uniform float uTime;
  uniform float uSmog;
  uniform float uBars;
  uniform float uStreams;
  uniform float uPixel;
  uniform vec2 uTown;
  varying float vAlpha;
  varying float vBars;
  varying float vStreams;
  varying float vBarGroup;
  varying float vStreamGroup;
  varying float vTown;
  varying float vRand;

  float ease(float t) { return t * t * (3.0 - 2.0 * t); }

  void main() {
    float t = uTime;
    // Haze: slow layered drift, a little rise and fall, like air over a valley.
    vec3 home = position;
    home.x += sin(t * 0.11 + aRand * 31.0 + position.z * 0.6) * 0.35;
    home.z += cos(t * 0.09 + aRand * 17.0 + position.x * 0.5) * 0.35;
    home.y += sin(t * 0.21 + aRand * 11.0) * 0.08;

    // Each particle starts its trip at a slightly different moment: the shape assembles, not snaps.
    float bars = ease(clamp(uBars * 1.4 - aRand * 0.4, 0.0, 1.0));
    float streams = ease(clamp(uStreams * 1.4 - aRand * 0.4, 0.0, 1.0));

    vec3 bar = aBar + vec3(sin(t * 1.3 + aRand * 40.0), cos(t * 1.1 + aRand * 23.0), 0.0) * 0.02;
    // Streams rise and wrap: the column keeps flowing.
    vec3 stream = aStream;
    float rise = fract((aStream.y - 1.4) / 3.6 + t * 0.045 + aRand * 0.02);
    stream.y = 1.4 + rise * 3.6;

    vec3 p = mix(home, bar, bars);
    p = mix(p, stream, streams);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float shaped = max(bars, streams);
    float size = mix(0.09 + aRand * 0.09, 0.05 + aRand * 0.03, shaped);
    gl_PointSize = min(36.0, size * uPixel / max(0.5, -mv.z));

    float fadeTop = 1.0 - smoothstep(0.0, 1.0, (home.y - 1.2) / 2.2);
    float hazeA = uSmog * (0.3 + 0.22 * aRand) * fadeTop;
    float shapeA = mix(0.0, 0.9, shaped);
    vAlpha = max(hazeA * (1.0 - shaped), shapeA);
    if (streams > 0.0) vAlpha *= mix(1.0, smoothstep(0.0, 0.12, rise) * (1.0 - smoothstep(0.82, 1.0, rise)), streams);

    vBars = bars;
    vStreams = streams;
    vBarGroup = aBarGroup;
    vStreamGroup = aStreamGroup;
    vTown = 1.0 - smoothstep(0.5, 3.5, length(p.xz - uTown));
    vRand = aRand;
  }
`;

const fragment = /* glsl */ `
  uniform float uClear;
  varying float vAlpha;
  varying float vBars;
  varying float vStreams;
  varying float vBarGroup;
  varying float vStreamGroup;
  varying float vTown;
  varying float vRand;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r2 = dot(c, c) * 4.0;
    if (r2 > 1.0) discard;
    float shaped = max(vBars, vStreams);
    float soft = mix(exp(-r2 * 2.6), 1.0 - smoothstep(0.55, 1.0, r2), shaped);

    vec3 haze = mix(vec3(0.6, 0.565, 0.494), vec3(1.0, 0.69, 0.36), vTown * 0.45);
    vec3 barCol = vBarGroup < 0.5 ? vec3(0.62, 0.6, 1.0) : vec3(0.55, 0.56, 0.66);
    vec3 s0 = vec3(${hex(LEVEL_COLORS[5])});
    vec3 s1 = vec3(${hex(LEVEL_COLORS[3])});
    vec3 s2 = vec3(${hex(LEVEL_COLORS[2])});
    vec3 s3 = vec3(${hex(LEVEL_COLORS[4])});
    vec3 streamCol = vStreamGroup < 0.5 ? s0 : vStreamGroup < 1.5 ? s1 : vStreamGroup < 2.5 ? s2 : s3;

    vec3 col = mix(haze, barCol, vBars);
    col = mix(col, streamCol, vStreams);
    float a = vAlpha * soft * (1.0 - uClear);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export function Smog({ count, dpr }: { count: number; dpr: number }) {
  const img = useLoader(ImageLoader, '/story/terrain.png');

  const geometry = useMemo(() => {
    const height = makeSampler(heightField(img));
    const rand = mulberry32(5);
    const home = new Float32Array(count * 3);
    const r = new Float32Array(count);
    const half = WORLD / 2;
    for (let i = 0; i < count; i++) {
      // Denser near town, thinning out to the hills.
      const ang = rand() * Math.PI * 2;
      const rad = Math.pow(rand(), 0.7) * 8.5;
      const x = TOWN[0] + Math.cos(ang) * rad;
      const z = TOWN[1] + Math.sin(ang) * rad * 0.85;
      const ground = height((x + half) / WORLD, (z + half) / WORLD) * RELIEF;
      home[i * 3] = x;
      home[i * 3 + 1] = ground + 0.05 + Math.pow(rand(), 1.8) * 1.5;
      home[i * 3 + 2] = z;
      r[i] = rand();
    }
    const bars = barTargets(count, STORY_FACTS.maeVt);
    const streams = streamTargets(count, STORY_FACTS.sources);
    // Shuffle which particle goes where, so every shape draws from the whole haze.
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(home, 3));
    g.setAttribute('aBar', new BufferAttribute(bars.positions, 3));
    g.setAttribute('aStream', new BufferAttribute(streams.positions, 3));
    g.setAttribute('aBarGroup', new BufferAttribute(Float32Array.from(bars.group), 1));
    g.setAttribute('aStreamGroup', new BufferAttribute(Float32Array.from(streams.group), 1));
    g.setAttribute('aRand', new BufferAttribute(r, 1));
    return g;
  }, [img, count]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uSmog: { value: 0 },
          uBars: { value: 0 },
          uStreams: { value: 0 },
          uClear: { value: 0 },
          uPixel: { value: 600 },
          uTown: { value: TOWN },
        },
      }),
    [],
  );
  void AdditiveBlending;

  useFrame(({ clock, size }) => {
    const s = sceneStore.state;
    const u = material.uniforms;
    u.uTime!.value = clock.elapsedTime;
    u.uSmog!.value = sceneStore.smog;
    u.uBars!.value = s.bars;
    u.uStreams!.value = s.streams;
    u.uClear!.value = s.clear;
    u.uPixel!.value = size.height * dpr * 0.9;
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
