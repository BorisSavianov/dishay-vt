'use client';

import { useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, ImageLoader, ShaderMaterial } from 'three';
import terrain from '../../../public/story/terrain.json';
import { LEVEL_COLORS, type Level } from '@/lib/aq/levels';
import type { StorySensor } from '@/lib/story/facts';
import { toBg, toScene } from '@/lib/story/geo';
import { heightField, makeSampler, RELIEF, WORLD } from './Terrain';
import { sceneStore } from './sceneStore';

const BG_Y = 3;

const rgb = (level: Level) => {
  const n = parseInt(LEVEL_COLORS[level].slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const;
};

const vertex = /* glsl */ `
  attribute vec3 aBg;
  attribute vec3 aColor;
  attribute float aLocal;
  attribute float aWave;
  uniform float uBg;
  uniform float uTime;
  uniform float uPixel;
  uniform float uLocalA;
  varying vec3 vColor;
  varying float vA;
  void main() {
    // The wave sweeps west to east as the camera rises: each light lifts off a little later.
    float t = clamp((uBg - aWave * 0.55) / 0.45, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 p = mix(position, aBg, t);
    p.y += sin(t * 3.14159) * 1.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float pulse = 0.85 + 0.15 * sin(uTime * 2.2 + aWave * 20.0);
    gl_PointSize = min(48.0, mix(0.22, 0.42, t) * uPixel * pulse / max(0.5, -mv.z));
    vColor = aColor;
    vA = mix(aLocal * uLocalA, 1.0, t);
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vA;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    if (r > 1.0 || vA < 0.01) discard;
    float core = 1.0 - smoothstep(0.0, 0.28, r);
    float halo = exp(-r * r * 5.0) * 0.55;
    vec3 col = mix(vColor, vec3(1.0), core * 0.6);
    gl_FragColor = vec4(col * (core + halo) * vA, 1.0);
  }
`;

// The 560 stations: on the VT terrain (only those inside it) and lifted into a glowing map of Bulgaria in chapter 3.
export function Sensors({ sensors, dpr }: { sensors: StorySensor[]; dpr: number }) {
  const img = useLoader(ImageLoader, '/story/terrain.png');

  const geometry = useMemo(() => {
    const height = makeSampler(heightField(img));
    const n = sensors.length;
    const local = new Float32Array(n * 3);
    const bg = new Float32Array(n * 3);
    const color = new Float32Array(n * 3);
    const inside = new Float32Array(n);
    const wave = new Float32Array(n);
    const half = WORLD / 2;
    sensors.forEach((s, i) => {
      const [x, z] = toScene(s.lat, s.lon, terrain);
      const ins = Math.abs(x) < half * 0.95 && Math.abs(z) < half * 0.95;
      const y = ins ? height((x + half) / WORLD, (z + half) / WORLD) * RELIEF + 0.12 : -5;
      local.set([ins ? x : 0, y, ins ? z : 0], i * 3);
      const [bx, bz] = toBg(s.lat, s.lon);
      bg.set([bx, BG_Y, bz], i * 3);
      color.set(rgb(s.level), i * 3);
      inside[i] = ins ? 1 : 0;
      wave[i] = Math.min(1, Math.max(0, (bx + 20) / 40));
    });
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(local, 3));
    g.setAttribute('aBg', new BufferAttribute(bg, 3));
    g.setAttribute('aColor', new BufferAttribute(color, 3));
    g.setAttribute('aLocal', new BufferAttribute(inside, 1));
    g.setAttribute('aWave', new BufferAttribute(wave, 1));
    return g;
  }, [img, sensors]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uBg: { value: 0 }, uTime: { value: 0 }, uPixel: { value: 600 }, uLocalA: { value: 1 } },
      }),
    [],
  );

  useFrame(({ clock, size }) => {
    const s = sceneStore.state;
    const u = material.uniforms;
    u.uBg!.value = s.sensorsBg;
    u.uTime!.value = clock.elapsedTime;
    u.uPixel!.value = size.height * dpr;
    // On the valley the VT sensors are small beacons; hidden in daylight and while the shapes form.
    u.uLocalA!.value = 0.9 * (1 - s.clear) * (1 - Math.max(s.bars, s.streams)) * (1 - sceneStore.smog * 0.4);
  });

  return <points geometry={geometry} material={material} frustumCulled={false} />;
}
