'use client';

import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import type { StoryData } from '@/lib/story/facts';
import { CameraRig } from './CameraRig';
import { Sky } from './Sky';
import { Terrain } from './Terrain';

export type Tier = 'high' | 'low';

// The single WebGL canvas behind the chapters. Loaded with next/dynamic (ssr: false).
export default function StoryScene({ data: _data, tier }: { data: StoryData; tier: Tier }) {
  return (
    <Canvas
      dpr={[1, tier === 'high' ? 2 : 1.25]}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 200, position: [6, 3.4, 9] }}
      aria-hidden="true"
    >
      <Sky />
      <Suspense fallback={null}>
        <Terrain segments={tier === 'high' ? 720 : 360} />
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
