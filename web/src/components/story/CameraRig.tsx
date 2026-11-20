'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Color, PerspectiveCamera, Vector3 } from 'three';
import { sceneStore } from './sceneStore';
import { atmosphere } from './atmosphere';

// Follows the scene state with critically damped easing, backs off on portrait screens, and tints the sky.
export function CameraRig() {
  const { camera, scene, size } = useThree();
  const look = useRef(new Vector3(0.8, 0.3, -0.5));
  const goal = useRef(new Vector3());
  const goalLook = useRef(new Vector3());
  const sky = useRef(new Color());
  const first = useRef(true);

  useFrame(({ clock }, dt) => {
    const s = sceneStore.state;
    const aspect = size.width / Math.max(1, size.height);
    const backOff = aspect < 1 ? 1 + (1 - aspect) * 0.9 : 1;

    goalLook.current.set(s.target[0], s.target[1], s.target[2]);
    goal.current.set(s.cam[0], s.cam[1], s.cam[2]).sub(goalLook.current).multiplyScalar(backOff).add(goalLook.current);

    // Idle drift in the hero, so the first frame is alive while nobody scrolls.
    if (sceneStore.chapter === 1) {
      const t = clock.elapsedTime * 0.25;
      goal.current.x += Math.sin(t) * 0.35;
      goal.current.y += Math.sin(t * 0.7) * 0.12;
    }

    const k = first.current ? 1 : 1 - Math.exp(-4.5 * Math.min(dt, 0.1));
    first.current = false;
    camera.position.lerp(goal.current, k);
    look.current.lerp(goalLook.current, k);
    camera.lookAt(look.current);

    const cam = camera as PerspectiveCamera;
    const fov = cam.fov + (s.fov * (aspect < 1 ? 1.15 : 1) - cam.fov) * k;
    if (Math.abs(fov - cam.fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }

    const a = atmosphere(s, sky.current);
    if (!(scene.background instanceof Color)) scene.background = new Color();
    (scene.background as Color).copy(a.sky);
  });

  return null;
}
