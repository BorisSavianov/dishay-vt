'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei';
import type { StoryData } from '@/lib/story/facts';
import { particleBudget } from '@/lib/story/mode';
import { CameraRig } from './CameraRig';
import { DevProbe } from './DevProbe';
import { sceneStore } from './sceneStore';
import { Sky } from './Sky';
import { Sensors } from './Sensors';
import { Smog } from './Smog';
import { Terrain } from './Terrain';

export type SceneMode = 'webgl-high' | 'webgl-low';

type Props = {
  data: StoryData;
  mode: SceneMode;
  /** Development poster capture: keeps the drawing buffer so canvas.toDataURL() returns the frame. */
  capture?: boolean;
  /** Called when the browser drops the WebGL context; the story falls back to posters. */
  onLost: () => void;
  /** Called once the terrain has loaded and the first real frame can draw. */
  onReady: () => void;
};

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(onReady));
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}

// The single WebGL canvas behind the chapters. Loaded with next/dynamic (ssr: false).
export default function StoryScene({ data, mode, capture = false, onLost, onReady }: Props) {
  const high = mode === 'webgl-high';
  const maxDpr = high ? 1.5 : 1.25;
  const [dpr, setDpr] = useState(maxDpr);
  const declines = useRef(0);
  const width = typeof window === 'undefined' ? 1440 : window.innerWidth;

  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: capture }}
      camera={{ fov: 38, near: 0.1, far: 200, position: [6, 3.4, 9] }}
      aria-hidden="true"
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onLost();
        });
      }}
    >
      {!capture && (
        <PerformanceMonitor
          onDecline={({ fps }) => {
            declines.current += 1;
            // First drop: render at DPR 1. Still under 40 fps after that: draw half the haze.
            if (declines.current === 1) setDpr(1);
            else if (fps < 40) sceneStore.drawScale = 0.5;
          }}
        />
      )}
      <AdaptiveDpr pixelated={false} />
      <Sky />
      <Suspense fallback={null}>
        <Terrain segments={high ? 560 : 300} />
        <Smog count={particleBudget(mode, width)} dpr={dpr} />
        <Sensors sensors={data.sensors} dpr={dpr} />
        <Ready onReady={onReady} />
      </Suspense>
      <CameraRig />
      <DevProbe />
    </Canvas>
  );
}
