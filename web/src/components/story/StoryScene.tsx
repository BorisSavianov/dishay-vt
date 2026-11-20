'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import type { StoryData } from '@/lib/story/facts';
import { CameraRig } from './CameraRig';
import { DevProbe } from './DevProbe';
import { Sky } from './Sky';
import { Sensors } from './Sensors';
import { Smog } from './Smog';
import { Terrain } from './Terrain';

export type Tier = 'high' | 'low';

// The single WebGL canvas behind the chapters. Loaded with next/dynamic (ssr: false).
export default function StoryScene({ data, tier }: { data: StoryData; tier: Tier }) {
  return (
    <Canvas
      dpr={[1, tier === 'high' ? 1.5 : 1.25]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 200, position: [6, 3.4, 9] }}
      aria-hidden="true"
    >
      <Sky />
      <Suspense fallback={null}>
        <Terrain segments={tier === 'high' ? 560 : 300} />
        <Smog count={tier === 'high' ? 32000 : 10000} dpr={tier === 'high' ? 1.5 : 1.25} />
        <Sensors sensors={data.sensors} dpr={tier === 'high' ? 1.5 : 1.25} />
      </Suspense>
      <CameraRig />
      <DevProbe />
    </Canvas>
  );
}
