'use client';

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, ShaderMaterial } from 'three';
import { sceneStore } from './sceneStore';
import { SKY_GLSL } from './skyGlsl';

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const fragment = /* glsl */ `
  uniform float uDusk;
  uniform float uClear;
  uniform float uSmog;
  uniform float uTime;
  uniform float uBg;
  varying vec3 vDir;
  ${SKY_GLSL}
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = skyColor(d, uDusk, uSmog, uClear, uBg);
    vec3 cell = floor(d * 180.0);
    float star = step(0.9965, hash(cell)) * smoothstep(0.12, 0.5, d.y);
    star *= 0.6 + 0.4 * sin(uTime * 2.0 + hash(cell + 3.0) * 30.0);
    col += vec3(star) * uDusk * (1.0 - uSmog) * (1.0 - uClear);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Sky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        side: BackSide,
        depthWrite: false,
        uniforms: { uDusk: { value: 1 }, uClear: { value: 0 }, uSmog: { value: 0 }, uTime: { value: 0 }, uBg: { value: 0 } },
      }),
    [],
  );
  useFrame(({ clock, camera }, _dt) => {
    const s = sceneStore.state;
    const u = material.uniforms;
    u.uDusk!.value = s.dusk;
    u.uClear!.value = s.clear;
    u.uSmog!.value = sceneStore.smog;
    u.uTime!.value = clock.elapsedTime;
    u.uBg!.value = s.sensorsBg;
    void camera;
  });
  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[90, 32, 16]} />
    </mesh>
  );
}
