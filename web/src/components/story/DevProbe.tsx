'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

// Development only: exposes the renderer so render cost can be timed without relying on rAF (which a hidden pane throttles).
export function DevProbe() {
  const { gl, scene, camera, advance } = useThree();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    (window as unknown as { __story?: unknown }).__story = { gl, scene, camera, advance };
  }, [gl, scene, camera, advance]);
  return null;
}
