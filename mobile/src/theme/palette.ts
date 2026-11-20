// Colour tokens for the app, in the story's palette (docs/superpowers/specs/2026-11-20-platform-film-design.md).
// They mirror web/src/app/globals.css: the :root block is "day" (light) and :root[data-theme='dark'] is "dusk",
// the default. tokens-parity.test.ts fails if the two drift.
// Pure module: no React Native imports, so node:test can read it.

export type Mode = 'light' | 'dark';
export type PointType = 'pharmacy' | 'hospital' | 'clinic' | 'doctors' | 'bus_stop';

/** Dusk is the default, as on the web. "Day" (light) only when the user picks it. */
export const DEFAULT_MODE: Mode = 'dark';

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
  // The story's daylight orange, used sparingly for "now" highlights.
  warm: string;
  // The sky behind every page: a dark (or pale) zenith and a glow low on the horizon.
  skyTop: string;
  skyHorizon: string;
  // Translucent card surface, the light hairline its top edge catches, and the accent glow.
  glass: string;
  glassEdge: string;
  glow: string;
  // The page title's vertical gradient (web --title-grad), top colour and where it starts, then the bottom.
  titleTop: string;
  titleBottom: string;
  titleStop: number;
  points: Record<PointType, string>;
};

export type ColorToken = Exclude<keyof Palette, 'points' | 'titleStop'>;

export const palettes: Record<Mode, Palette> = {
  light: {
    bg: '#eef0fc',
    card: '#ffffff',
    card2: '#f6f6fd',
    fg: '#12163a',
    muted: '#4a5078',
    line: '#e0e3f4',
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
    warm: '#c2620f',
    skyTop: '#dfe4ff',
    skyHorizon: '#fbe8d8',
    glass: 'rgba(255, 255, 255, 0.72)',
    glassEdge: 'rgba(255, 255, 255, 0.9)',
    glow: 'rgba(79, 70, 229, 0.28)',
    titleTop: '#161a4d',
    titleBottom: '#5146d8',
    titleStop: 0.25,
    points: {
      pharmacy: '#0d8a7d',
      hospital: '#e11d48',
      clinic: '#2563eb',
      doctors: '#7c3aed',
      bus_stop: '#64748b',
    },
  },
  dark: {
    bg: '#0a0b1e',
    card: '#14152e',
    card2: '#1b1c45',
    fg: '#f4f5ff',
    muted: '#b9bde6',
    line: '#2a2c5e',
    grid: '#23265a',
    accent: '#a5a1ff',
    accentStrong: '#c4c1ff',
    accentSoft: '#272766',
    onAccent: '#0b0c20',
    neg: '#ff9aa2',
    negSoft: '#3d1c2e',
    pos: '#6ee7b7',
    posSoft: '#123a31',
    warn: '#fcd34d',
    warm: '#ffb15c',
    skyTop: '#080924',
    skyHorizon: '#3a2443',
    glass: 'rgba(20, 21, 52, 0.62)',
    glassEdge: 'rgba(255, 255, 255, 0.12)',
    glow: 'rgba(109, 102, 255, 0.45)',
    titleTop: '#ffffff',
    titleBottom: '#c9cdf5',
    titleStop: 0.3,
    points: {
      pharmacy: '#2dd4bf',
      hospital: '#fb7185',
      clinic: '#60a5fa',
      doctors: '#a78bfa',
      bus_stop: '#94a3b8',
    },
  },
};
