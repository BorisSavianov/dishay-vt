import { describe, expect, it } from 'vitest';
import { detectMode, particleBudget } from './mode';

const desk = { webgl2: true, reducedMotion: false, width: 1440, cores: 10, memoryGb: 16 };

describe('detectMode', () => {
  it('falls back to posters without WebGL2', () => {
    expect(detectMode({ ...desk, webgl2: false })).toBe('poster');
  });
  it('falls back to posters with reduced motion', () => {
    expect(detectMode({ ...desk, reducedMotion: true })).toBe('poster');
  });
  it('uses the low tier on a phone-width viewport', () => {
    expect(detectMode({ ...desk, width: 390 })).toBe('webgl-low');
  });
  it('uses the low tier on 4 cores', () => {
    expect(detectMode({ ...desk, cores: 4 })).toBe('webgl-low');
  });
  it('uses the low tier on 2 GB of memory', () => {
    expect(detectMode({ ...desk, memoryGb: 2 })).toBe('webgl-low');
  });
  it('uses the high tier on a 10-core desktop at 1440 px', () => {
    expect(detectMode({ webgl2: true, reducedMotion: false, width: 1440, cores: 10 })).toBe('webgl-high');
  });
});

describe('particleBudget', () => {
  it('gives the measured budgets per tier', () => {
    expect(particleBudget('webgl-high', 1440)).toBe(32000);
    expect(particleBudget('webgl-low', 390)).toBe(10000);
    expect(particleBudget('poster', 1440)).toBe(0);
  });
});
