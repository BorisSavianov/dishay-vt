// Colour tokens for the app. They mirror web/src/app/globals.css: the :root block is the light default and
// :root[data-theme='dark'] overrides it. tokens-parity.test.ts fails if the two drift.
// Pure module: no React Native imports, so node:test can read it.

export type Mode = 'light' | 'dark';
export type PointType = 'pharmacy' | 'hospital' | 'clinic' | 'doctors' | 'bus_stop';

export type Palette = {
  bg: string;
  card: string;
  card2: string;
  fg: string;
  muted: string;
  line: string;
  grid: string;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  onAccent: string;
  neg: string;
  negSoft: string;
  pos: string;
  posSoft: string;
  warn: string;
  points: Record<PointType, string>;
};

export type ColorToken = Exclude<keyof Palette, 'points'>;

export const palettes: Record<Mode, Palette> = {
  light: {
    bg: '#f1f2fa',
    card: '#ffffff',
    card2: '#f6f6fd',
    fg: '#12163a',
    muted: '#565c82',
    line: '#e2e4f3',
    grid: '#e8eaf6',
    accent: '#4f46e5',
    accentStrong: '#4338ca',
    accentSoft: '#e9e8fd',
    onAccent: '#ffffff',
    neg: '#b4232a',
    negSoft: '#fde8e8',
    pos: '#0b7a4d',
    posSoft: '#dcf4e8',
    warn: '#8a4b00',
    points: {
      pharmacy: '#0d8a7d',
      hospital: '#e11d48',
      clinic: '#2563eb',
      doctors: '#7c3aed',
      bus_stop: '#64748b',
    },
  },
  dark: {
    bg: '#0b0c20',
    card: '#15163a',
    card2: '#1b1d47',
    fg: '#eef0ff',
    muted: '#aeb4dc',
    line: '#2b2e63',
    grid: '#25285a',
    accent: '#8b87ff',
    accentStrong: '#a9a6ff',
    accentSoft: '#26286c',
    onAccent: '#0b0c20',
    neg: '#ff9aa2',
    negSoft: '#3d1c2e',
    pos: '#6ee7b7',
    posSoft: '#123a31',
    warn: '#fcd34d',
    points: {
      pharmacy: '#2dd4bf',
      hospital: '#fb7185',
      clinic: '#60a5fa',
      doctors: '#a78bfa',
      bus_stop: '#94a3b8',
    },
  },
};
