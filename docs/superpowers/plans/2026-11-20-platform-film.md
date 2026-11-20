# Platform in the story's look: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The platform pages take the story's look: dusk default theme, glass cards, story type, a poster backdrop per page, and a live 3D valley behind `/now` whose haze is Veliko Tarnovo's current air level.

**Architecture:** Pure decisions (theme bootstrap, level → haze, page → poster, which tier renders the valley, count-up parsing) live in small tested `lib/` modules. The look itself is CSS in the token and shell blocks of `globals.css`. Two client islands are added: `NowSky` (reuses the story's `Sky`, `Terrain`, `Smog` and `sceneStore`) on `/now`, and `PageMotion` (GSAP reveals and count-ups) in `AppShell`.

**Tech Stack:** Next.js 15.5 App Router, React 19, three 0.187 + @react-three/fiber 9.8 + drei 10.7, gsap 3.15 (ScrollTrigger), vitest (node environment, `src/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-11-20-platform-film-design.md`

## Global Constraints

- No new dependencies. Versions stay pinned.
- `pnpm check` (typecheck, vitest, build) green at the end of every task. Run from `web/`.
- Branch `boris/platform-film`. Nothing pushed or merged without Boris's go. No attribution lines in commits or PR text.
- `LEVEL_COLORS` and every number on the pages unchanged; numbers must match `docs/slides/numbers.md`.
- No 3D on any page other than `/now`. `/geographic` gets the gradient only.
- Page content, routes and i18n keys unchanged (only the values of `theme.dark` / `theme.light`).
- Reduced motion: no reveals, no count-ups, no 3D.
- Body text contrast ≥ 4.5:1 on cards in both themes.
- Stored theme values stay `'light' | 'dark'`.
- Safari: a `background-clip: text` gradient sits on the element whose text it clips, never on a transformed ancestor.
- After `pnpm build`, stop the preview and `rm -rf .next` from `web/` before `pnpm dev` again (stale chunks give 500s).

## Review Focus

1. **Hydration with the dark default:** server HTML says `data-theme="dark"`, a saved `light` flips it before paint. `useTheme`'s server snapshot must be `'dark'` so `LiveMap` starts with the dark style and React does not warn. Pinned by Task 1's script test; check the console on `/geographic` with `localStorage.theme='light'`.
2. **`/now` with no current level** (station has no recent `latest` and no current hour): haze 0, no crash. Pinned in Task 2 (`smogForLevel(null)`).
3. **`/now` on a phone or with reduced motion:** poster only, the three.js chunk never downloads. Pinned in Task 2 (`nowSkyMode`), checked in Task 5's network check.
4. **Leaving `/now` for the story at `/` in the same tab:** `NowSky` wrote a fixed state into `sceneStore`; the story must start from chapter 1. The story calls `setProgress` on mount (`StoryClient` effect), which overwrites `state`; Task 5 verifies by client navigation `/now` → `/`.
5. **Glass without `backdrop-filter`** (older Firefox): cards fall back to an opaque surface, text still readable. Pinned by `@supports` in Task 3; contrast test computes the opaque fallback too.

---

### Task 1: Dusk is the default theme

**Files:**
- Create: `web/src/lib/theme.ts`
- Test: `web/src/lib/theme.test.ts`
- Modify: `web/src/app/layout.tsx` (import `THEME_SCRIPT`, `<html data-theme="dark">`, `themeColor`)
- Modify: `web/src/components/shell/useTheme.ts:22` (server snapshot `'dark'`)
- Modify: `web/src/lib/i18n.ts:14-15,200-201`

**Interfaces:**
- Produces: `export const THEME_SCRIPT: string`; `export const DUSK_BG: string` (the dusk `--bg` hex, used by `themeColor` and Task 3's token).

- [ ] **Step 1: Write the failing test** — run the script with a fake `document` and `localStorage`:

```ts
import { describe, expect, it } from 'vitest';
import { THEME_SCRIPT } from './theme';

function run(stored: string | null, throws = false) {
  const html = { dataset: { theme: 'dark' } as Record<string, string> };
  const localStorage = { getItem: () => { if (throws) throw new Error('blocked'); return stored; } };
  new Function('document', 'localStorage', THEME_SCRIPT)({ documentElement: html }, localStorage);
  return html.dataset.theme;
}

describe('THEME_SCRIPT', () => {
  it('keeps dusk when nothing is saved', () => expect(run(null)).toBe('dark'));
  it('switches to day when light was saved', () => expect(run('light')).toBe('light'));
  it('keeps dusk when dark was saved', () => expect(run('dark')).toBe('dark'));
  it('ignores junk', () => expect(run('purple')).toBe('dark'));
  it('survives blocked storage', () => expect(run(null, true)).toBe('dark'));
});
```

- [ ] **Step 2:** `pnpm vitest run src/lib/theme.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `theme.ts`: `THEME_SCRIPT` sets `document.documentElement.dataset.theme='light'` only when storage says `'light'`, in try/catch. `DUSK_BG` = the value chosen in Task 3 (start with `#0a0b1e`; Task 3 may retune and must keep them equal).
- [ ] **Step 4:** Test → PASS.
- [ ] **Step 5:** `layout.tsx`: use `THEME_SCRIPT`, `<html lang="bg" data-theme="dark" suppressHydrationWarning>`, `themeColor: DUSK_BG`. `useTheme`: server snapshot `'dark'`; `read()` returns `'light'` only when `dataset.theme === 'light'`. i18n: `theme.dark` → „Здрач“ / "Dusk", `theme.light` → „Ден“ / "Day".
- [ ] **Step 6:** `pnpm check` → green. In the preview: fresh profile shows dusk; toggle to day, reload, still day; console clean on `/geographic`.
- [ ] **Step 7:** Commit `feat(web): dusk is the default theme, light becomes day`.

### Task 2: The look's pure decisions

**Files:**
- Create: `web/src/lib/look.ts`
- Test: `web/src/lib/look.test.ts`
- Modify: `web/src/components/shell/AppShell.tsx:14` (import `NavId` from `@/lib/look`)

**Interfaces:**
- Consumes: `Level` from `@/lib/aq/levels`; `StoryEnv`, `detectMode` from `@/lib/story/mode`; nothing from components: `NavId` moves from `AppShell.tsx:14` into `look.ts` (exported), and `AppShell` imports it from there, so the node test never loads a component.
- Produces:
  - `export type NavId` (moved here)
  - `smogForLevel(level: Level | null): number`
  - `backdropPoster(active: NavId, theme: 'light' | 'dark'): string | null` — a `/story/chN.webp` path, or null for no poster.
  - `nowSkyMode(env: StoryEnv): 'webgl-high' | 'webgl-low' | 'poster'`
  - `parseCount(text: string): { value: number; decimals: number; decimalSep: '.' | ','; prefix: string; suffix: string } | null` and `formatCount(spec, v: number): string`

- [ ] **Step 1: Write the failing tests:**

```ts
describe('smogForLevel', () => {
  it('maps the six levels', () =>
    expect([1, 2, 3, 4, 5, 6].map((l) => smogForLevel(l as Level))).toEqual([0, 0.15, 0.35, 0.6, 0.8, 1]));
  it('is clear with no level', () => expect(smogForLevel(null)).toBe(0));
});
describe('backdropPoster', () => {
  it('maps pages to chapters at dusk', () => {
    expect(backdropPoster('why', 'dark')).toBe('/story/ch6.webp');
    expect(backdropPoster('ai', 'dark')).toBe('/story/ch5.webp');
    expect(backdropPoster('sources', 'dark')).toBe('/story/ch3.webp');
    expect(backdropPoster('about', 'dark')).toBe('/story/ch1.webp');
    expect(backdropPoster('health', 'dark')).toBe('/story/ch1.webp');
    expect(backdropPoster('predict', 'dark')).toBe('/story/ch4.webp');
  });
  it('uses daylight in day', () => expect(backdropPoster('why', 'light')).toBe('/story/ch7.webp'));
  it('has no poster on the map and the dashboard', () => {
    expect(backdropPoster('geo', 'dark')).toBeNull();
    expect(backdropPoster('dashboard', 'dark')).toBeNull();
  });
});
describe('nowSkyMode', () => {
  const desk = { webgl2: true, reducedMotion: false, width: 1440, cores: 10, memoryGb: 16 };
  it('runs high on a desktop', () => expect(nowSkyMode(desk)).toBe('webgl-high'));
  it('runs low on 4 cores', () => expect(nowSkyMode({ ...desk, cores: 4 })).toBe('webgl-low'));
  it('shows the poster on a phone', () => expect(nowSkyMode({ ...desk, width: 390 })).toBe('poster'));
  it('shows the poster with reduced motion', () => expect(nowSkyMode({ ...desk, reducedMotion: true })).toBe('poster'));
});
describe('parseCount', () => {
  it('reads a BG decimal', () => expect(parseCount('6,4')).toMatchObject({ value: 6.4, decimals: 1, decimalSep: ',' }));
  it('keeps prefix and suffix', () => expect(parseCount('±12 µg/m³')).toMatchObject({ value: 12, prefix: '±', suffix: ' µg/m³' }));
  it('round-trips', () => { const s = parseCount('6,4')!; expect(formatCount(s, 6.4)).toBe('6,4'); expect(formatCount(s, 0)).toBe('0,0'); });
  it('refuses text with two numbers', () => expect(parseCount('6 и 7')).toBeNull());
  it('refuses text with no number', () => expect(parseCount('—')).toBeNull());
});
```

- [ ] **Step 2:** `pnpm vitest run src/lib/look.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `nowSkyMode`: `width < 768` → `'poster'`, else `detectMode(env)`.
- [ ] **Step 4:** Test → PASS; `pnpm check` → green.
- [ ] **Step 5:** Commit `feat(web): look decisions (haze per level, poster per page, sky tier, count parsing)`.

### Task 3: Tokens, glass, type, sidebar

**Files:**
- Modify: `web/src/app/globals.css` (token blocks lines 1–64; `.sidebar`, `.brand`, `.side-nav`, `.page-title`, `.eyebrow`, `.card`, `.pill`, `.notice`, `.tabbar`, `.mobile-bar`, `.icon-btn` focus)
- Test: `web/src/app/tokens.test.ts`

**Interfaces:**
- Consumes: `DUSK_BG` (Task 1) must equal the dark `--bg`.
- Produces: tokens `--glass` (translucent card surface), `--glass-solid` (opaque fallback), `--glow`, `--warm` (`#e8892b`), `--title-grad`, in both theme blocks.

- [ ] **Step 1: Write the failing test** — parse both token blocks from `globals.css` with a regex, composite `--glass` over `--bg`, and assert WCAG contrast:

```ts
it.each(['light', 'dark'])('%s: body text on glass and on the opaque fallback is AA', (theme) => {
  const t = tokens(theme);              // helper in the test: reads :root / :root[data-theme='dark']
  for (const surface of [over(t['--glass'], t['--bg']), t['--glass-solid']]) {
    expect(contrast(t['--fg'], surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t['--muted'], surface)).toBeGreaterThanOrEqual(4.5);
  }
});
it('the dusk background matches the theme-color', () => expect(tokens('dark')['--bg']).toBe(DUSK_BG));
```

(`tokens`, `over`, `contrast` are small helpers inside the test file; `hex`/`rgba()` only.)

- [ ] **Step 2:** Run → FAIL (`--glass` missing).
- [ ] **Step 3:** Retune tokens per spec §2 (dark towards the story's ch1 indigo-violet night; light towards ch7–8 daylight), add the new tokens. Apply §3–§4: `.card` uses `--glass` + `backdrop-filter: blur(18px) saturate(140%)` inside `@supports (backdrop-filter: blur(1px))`, otherwise `--glass-solid`; top hairline; sidebar glass with right-edge glow; active nav pill with `--glow`; `.page-title` gradient via `--title-grad` with `background-clip: text` and a solid `color` fallback under `@supports not (background-clip: text)`; `.eyebrow` uppercase tracking.
- [ ] **Step 4:** Test → PASS; `pnpm check` → green.
- [ ] **Step 5:** Sweep `globals.css` for hardcoded colours that now break on dusk (`grep -n "#[0-9a-fA-F]\{3,6\}\|rgba(" app/globals.css` outside the token blocks); fix each by using a token. Screenshot `/why`, `/insights`, `/sources` in both themes and check nothing is unreadable.
- [ ] **Step 6:** Commit `feat(web): story palette, glass cards, story titles, glowing sidebar`.

### Task 4: Backdrop behind every page

**Files:**
- Create: `web/src/components/shell/Backdrop.tsx` (client, small)
- Modify: `web/src/components/shell/AppShell.tsx` (render `<Backdrop active={active} />` first inside `.app`)
- Modify: `web/src/app/globals.css` (`.backdrop`, `.backdrop img`)

**Interfaces:**
- Consumes: `backdropPoster` (Task 2), `useTheme`.
- Produces: `<Backdrop active: NavId />` — a fixed, `aria-hidden` layer: the gradient always, plus the poster `img` when `backdropPoster` returns a path.

- [ ] **Step 1:** Implement. Gradient from tokens (horizon glow low, darker zenith). Poster: `object-fit: cover`, `filter: blur(28px) saturate(.6)`, opacity ~0.35 dusk / ~0.25 day, mask fading to transparent at the bottom; `decoding="async"`, `fetchPriority="low"`. The layer sits under `.app` content (`z-index`/`isolation`), `pointer-events: none`.
- [ ] **Step 2:** `pnpm check` → green.
- [ ] **Step 3:** Preview: each page shows its chapter (see Task 2 map), `/geographic` gradient only, day theme swaps to ch7, no layout shift (CLS) from the image. Screenshot two pages.
- [ ] **Step 4:** Commit `feat(web): story backdrop behind the platform pages`.

### Task 5: The live valley on `/now`

**Files:**
- Create: `web/src/components/aq/NowSky.tsx` (client island: probe, poster or canvas)
- Create: `web/src/components/aq/NowSkyScene.tsx` (the `Canvas`; default export, loaded with `next/dynamic`, `ssr: false`)
- Modify: `web/src/app/now/page.tsx` (compute VT level; wrap `.air-top` in `.now-hero` with `<NowSky level={vtLevel} />` behind)
- Modify: `web/src/app/globals.css` (`.now-hero`, `.now-sky`)

**Interfaces:**
- Consumes: `smogForLevel`, `nowSkyMode` (Task 2); `probeEnv` (`lib/story/mode`); `Sky`, `Terrain({segments})`, `Smog({count, dpr})`, `sceneStore`, `particleBudget` (story); `sceneAt` from `lib/story/timeline`; `levelNow`, `featuredStation`; `useTheme`.
- Produces: `<NowSky level: Level | null />`.

- [ ] **Step 1:** `now/page.tsx`: `const vtLevel = levelNow(featuredStation(forecast), now)?.level ?? null;`. Wrap the existing `.air-top` in `<div className="now-hero"><NowSky level={vtLevel} /> …air-top… </div>`. No other markup changes.
- [ ] **Step 2:** `NowSky`: first render shows the ch1 poster (dusk) / ch7 (day) in `.now-sky`; after mount `nowSkyMode(probeEnv())`; live modes load `NowSkyScene` and hide the poster on its `onReady`; `onLost` → poster. Listens to `prefers-reduced-motion` changes → poster.
- [ ] **Step 3:** `NowSkyScene`: on mount and when `level`/theme change, write `sceneStore.state = { ...sceneAt(0), smog: 0, bars: 0, streams: 0, sensorsBg: 0, dusk: theme==='dark'?1:0, clear: theme==='dark'?0:1 }`, `sceneStore.smog = smogForLevel(level)`, `sceneStore.chapter = 0` (so `CameraRig`-dependent code does not sway; `NowSkyScene` does not mount `CameraRig`). Camera near ch1's `cam [7.5,5.2,10.5]` → `target [1.4,0.5,-1.2]`, own `useFrame` drift (sin, ±0.35 x, ±0.12 y, period ~25 s). Same `PerformanceMonitor` ladder and DPR caps as `StoryScene`; `Terrain` 560/300 segments; `Smog count={particleBudget(mode, w)}`. `IntersectionObserver` on the wrapper + `visibilitychange` → `frameloop` `'never'` when out of view, `'always'` back in.
- [ ] **Step 4:** CSS: `.now-hero { position: relative; isolation: isolate }`, `.now-sky` absolute, full bleed of the main column, ~520 px tall desktop, `z-index: -1`, mask fading to transparent at the bottom; cards above stay glass.
- [ ] **Step 5:** `pnpm check` → green.
- [ ] **Step 6:** Preview checks:
  - desktop dusk: the valley renders behind the cards; with `?station=` set to a non-VT station the haze does not change;
  - change the haze by hand in devtools (`sceneStore.smog = 1`) to see a bad day reads well behind the glass;
  - day theme: clear daylight valley; tune haze colour if `clear:1` + smog looks wrong;
  - 390 px: poster only, and the network panel shows no three.js chunk;
  - client-navigate `/now` → `/` (sidebar „За проекта“): the story starts at chapter 1, clean;
  - scroll the valley out of view: the frame loop stops (log `gl.info.render.frame` twice).
- [ ] **Step 7:** Commit `feat(web): live valley behind the dashboard, hazy as VT's air`.

### Task 6: Reveals and count-ups

**Files:**
- Create: `web/src/components/shell/PageMotion.tsx` (client, renders null)
- Modify: `web/src/components/shell/AppShell.tsx` (mount `<PageMotion />`)
- Modify: `web/src/components/aq/ScoreboardSection.tsx:40` (`<span data-count>`)

**Interfaces:**
- Consumes: `parseCount`, `formatCount` (Task 2); gsap + ScrollTrigger.
- Produces: `[data-count]` opt-in for any element whose text is one number.

- [ ] **Step 1:** Implement `PageMotion` (skip entirely when `prefers-reduced-motion`): in a `gsap.context`, every `.page .card` whose top is below the viewport at mount gets a once-only `from({ y: 24, autoAlpha: 0, duration: 0.9, ease: 'power3.out' })` with `ScrollTrigger start 'top 90%'` (no reverse). Every `[data-count]` with a non-null `parseCount` counts 0 → value over 0.9 s on first view, writing `formatCount`. Every `.mae-bars .bar` grows from `scaleX: 0` (transform-origin left) on first view. Clean up on route change (`usePathname` dep) with `ctx.revert()`.
- [ ] **Step 2:** `pnpm check` → green.
- [ ] **Step 3:** Preview `/why`: cards rise once, MAE values count to the server numbers (compare with the page source and `docs/slides/numbers.md`), bars grow; with reduced motion (devtools emulation) everything is static and final. First-screen cards do not blink on load.
- [ ] **Step 4:** Commit `feat(web): story-style reveals and count-ups on the platform`.

### Task 7: Whole-site pass

- [ ] **Step 1:** Screenshots of `/now`, `/geographic`, `/why`, `/insights`, `/sources`, `/about` in dusk and day, desktop and 390 px, into `docs/slides/backup/platform/`.
- [ ] **Step 2:** Lighthouse-style sanity in the preview: `/now` numbers present in the server HTML (`curl -s localhost:3000/now | grep` the PM value), no console errors on any page, no horizontal scroll at 390 px.
- [ ] **Step 3:** `pnpm check` → green. Commit `docs: platform screenshots`.
