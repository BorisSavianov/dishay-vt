'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { particleBudget, type StoryMode } from '@/lib/story/mode';
import { sceneAt } from '@/lib/story/timeline';
import { CameraRig } from '@/components/story/CameraRig';
import { sceneStore } from '@/components/story/sceneStore';
import { Sky } from '@/components/story/Sky';
import { Smog } from '@/components/story/Smog';
import { Terrain } from '@/components/story/Terrain';

type Props = {
  mode: Exclude<StoryMode, 'poster'>;
  /** 0..1, from the current air level in Veliko Tarnovo. */
  smog: number;
  dusk: boolean;
  /** False while the valley is scrolled away or the tab is hidden: the loop stops. */
  running: boolean;
  onLost: () => void;
  onReady: () => void;
};

function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(onReady));
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}

// The story's opening valley, held still behind the dashboard. The story and /now never mount together,
// so this writes the shared scene store directly; the story resets it from its own scroll position on mount.
export default function NowSkyScene({ mode, smog, dusk, running, onLost, onReady }: Props) {
  const high = mode === 'webgl-high';
  const maxDpr = high ? 1.5 : 1.25;
  const [dpr, setDpr] = useState(maxDpr);
  const declines = useRef(0);
  const width = typeof window === 'undefined' ? 1440 : window.innerWidth;

  useEffect(() => {
    // Chapter 1's camera and idle drift (CameraRig sways only in chapter 1); the light follows the site theme.
    sceneStore.state = { ...sceneAt(0), dusk: dusk ? 1 : 0, clear: dusk ? 0 : 1, smog };
    sceneStore.smog = smog;
    sceneStore.chapter = 1;
    sceneStore.drawScale = 1;
  }, [smog, dusk]);

  return (
    <Canvas
      dpr={dpr}
      frameloop={running ? 'always' : 'never'}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 38, near: 0.1, far: 200, position: [7.5, 5.2, 10.5] }}
      aria-hidden="true"
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          onLost();
        });
      }}
    >
      <PerformanceMonitor
        onDecline={({ fps }) => {
          declines.current += 1;
          if (declines.current === 1) setDpr(1);
          else if (fps < 40) sceneStore.drawScale = 0.5;
        }}
        onIncline={() => {
          declines.current = 0;
          sceneStore.drawScale = 1;
          setDpr(maxDpr);
        }}
      />
      <Sky />
      <Suspense fallback={null}>
        <Terrain segments={high ? 560 : 300} />
        <Smog count={particleBudget(mode, width)} dpr={dpr} />
        <Ready onReady={onReady} />
      </Suspense>
      <CameraRig />
    </Canvas>
  );
}
