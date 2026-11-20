# Platform in the story's look: „Дишай ВТ“ (design)

Date: 20.11.2026. Owner: Boris. Status: draft for approval.

## Intent

The story at `/` ends with "see the live forecast" and drops the jury into the platform (`/now`, `/geographic`, `/why`, `/insights`, `/sources`, `/about`). Today that hand-off is a cut: from a dusk 3D film to a light, flat admin dashboard. The platform should feel like the next scene of the same film, while staying a calm tool that residents can read at a glance.

Boris's call: combine both, lean towards the film. Approach B was picked.

## Goals

- **Continuity.** The platform uses the story's palette (dusk indigo, haze, warm daylight accent), its headline type and its motion language. Nobody should feel they left the site.
- **One live moment.** On `/now`, a slice of the story's 3D valley sits behind the top cards. Its haze is the real current air level in Veliko Tarnovo: clean air is a clear dusk, a bad day is thick smog.
- **Atmosphere everywhere else** without 3D: a soft gradient plus a blurred story poster behind each page.
- **Motion that explains, once.** Cards rise in as they scroll into view; the headline numbers count up. Nothing loops or moves while you read.
- **Dusk-dark is the default theme.** Light stays, called "day" in the toggle.

## Non-goals

- No change to what any page says or shows: content, charts, data, routes and i18n keys stay. Velko's and Teo's page code is touched only where a class name or a wrapper is needed.
- No new data, no `ml/` changes.
- No 3D on `/geographic` (MapLibre already holds a WebGL context; two fight for the GPU) and no 3D on any page other than `/now`.

## Anti-goals (failure even if it "works")

- **A chart, number or label that is harder to read than today** in either theme. Contrast must meet WCAG AA for body text on the glass cards.
- **A slower dashboard.** `/now` must show its numbers in the first paint, server-rendered as today. The 3D loads after, behind them, and never blocks them.
- **A black box** where the 3D failed. The poster is the floor, as in the story.
- **Motion people can't turn off.** Reduced motion gets no reveals, no count-ups, no 3D.
- **A number that disagrees with `docs/slides/numbers.md`.**

## Constraints

- Next.js 15.5, React 19, pnpm, pinned versions. No new dependencies: three, @react-three/fiber, drei, gsap and lenis are already installed for the story.
- `pnpm check` (typecheck, vitest, build) stays green.
- Work on a branch (`boris/platform-film`); nothing to `main` or pushed without Boris's go. No attribution lines in commits or PR text.
- `globals.css` is shared with teammates. Changes stay in the token blocks and the shell/card classes; per-page rules are left alone unless they hardcode a colour that breaks on the new default.
- The theme lives on `<html data-theme>`, set by `THEME_SCRIPT` in `app/layout.tsx` before first paint, read by `useTheme` and by `LiveMap`/`StationMap` (MapLibre styles per theme).

## Approaches considered

- **A. Skin only.** New tokens, glass cards, story type, glow sidebar, gradient backdrop, reveals. Cheap and safe, but nothing alive: it looks like the story, it doesn't feel like it.
- **B. Skin + one live scene (picked).** A, plus the 3D valley behind `/now`'s hero, whose haze is the real current level, and blurred posters as backdrops on the other pages. One memorable moment where the jury lands, no GPU cost elsewhere.
- **C. 3D everywhere.** A persistent canvas behind every page. The most "film", but it competes with MapLibre on `/geographic`, costs battery on every page, and makes charts harder to read over moving haze.

## Design

### 1. Theme: dusk by default, "day" on request

- `THEME_SCRIPT` sets `data-theme="dark"` unless `localStorage.theme === 'light'`. The server renders `<html data-theme="dark">` so the first paint is dusk with no flash.
- `useTheme`'s server snapshot becomes `'dark'`, so MapLibre starts with the dark style (no restyle on hydration).
- `viewport.themeColor` becomes the dusk background.
- Stored values stay `'light' | 'dark'` (no migration). The toggle's label/tooltip for light says „Ден“ / "Day"; dark says „Здрач“ / "Dusk".
- People who explicitly chose light before keep it.

### 2. Tokens

Retune the existing `:root[data-theme='dark']` block towards the story's sky (the deep indigo-to-violet of chapter 1), keeping the same token names so every page follows:

- `--bg` the story's night base; `--surface` becomes translucent (glass, see 3); `--line` a faint light hairline; `--accent` stays indigo-violet; a new `--glow` (accent at low alpha) for focus and active states; a new `--warm` (the story's daylight orange `#e8892b`) used sparingly for "today/now" highlights.
- The light (day) block gets a matching retune: warm off-white sky, white glass, same accent. It is the story's chapters 7–8 (clear daylight).
- Level colours (`LEVEL_COLORS`) do not change: they are the air-quality scale and must stay the same everywhere.

### 3. Surfaces

- `.card`: translucent surface + `backdrop-filter: blur(18px) saturate(140%)`, a 1px light hairline on top edge, softer larger shadow. Fallback without `backdrop-filter` support: an opaque surface (current look).
- The sidebar: deep indigo glass with a faint vertical glow down its right edge; the active nav item gets an accent pill with a soft glow.
- `.pill`, `.notice`, the tabbar and the mobile bar pick up the same glass.

### 4. Typography

- `.page-title` uses the story's display treatment: tight tracking, heavy weight, the vertical white-to-lavender gradient clip (on the element itself, never on a transformed child: the Safari bug from PR #41). Day theme: indigo-to-violet gradient.
- `.eyebrow` gets the story's small uppercase tracking.
- Body text, tables and chart labels are unchanged in size and weight.

### 5. Backdrop

A fixed layer behind `.app` (one element in `AppShell`, `aria-hidden`):

- A radial/linear gradient from the tokens (haze glow low on the horizon, darker zenith).
- On every page except `/now` and `/geographic`: one story poster (`/story/chN.webp`, already shipped, 26–72 KB) at low opacity, heavily blurred, desaturated, masked to fade into `--bg`. Mapping (my call, matches each page's subject): `/why` → ch6 (who pollutes), `/insights` → ch5 (the model bars), `/sources` → ch3 (sensors over Bulgaria), `/about` → ch1 (dusk valley). Day theme uses ch7.
- `/geographic`: gradient only.
- `/now`: the live scene (6), with the ch1 poster as its fallback.

### 6. `/now`: the live valley

- A client island `NowSky` renders behind the top row (`.air-top`), full width, about 520 px tall on desktop, masked to fade out at the bottom into the page.
- It reuses the story's `Terrain`, `Sky` and `Smog` (not `Sensors`, not `CameraRig`'s scroll path) with a fixed camera close to chapter 1's framing and a slow idle drift like chapter 1's (`CameraRig` sways only when `sceneStore.chapter === 1`; `NowSky` uses its own small rig instead).
- **The haze follows the air in Veliko Tarnovo:** the valley is VT, so the haze uses `levelNow(featuredStation(forecast))` (the VT station) whatever station the picker shows; the server passes that level to the island as a prop. `smog` = a mapping of that level (1 → 0, 2 → 0.15, 3 → 0.35, 4 → 0.6, 5 → 0.8, 6 → 1). Dusk grade follows the theme (dusk → `dusk: 1`, day → `clear: 1`). No current level → `smog: 0`.
- The scene writes its fixed state into `sceneStore` (the components read it every frame). The story and `/now` never mount together, so sharing the store is safe; `NowSky` restores nothing on unmount.
- Tiers reuse `detectMode`: `webgl-high` and `webgl-low` get the scene (low: 10 000 particles, DPR ≤ 1.25, terrain 300 segments), `poster` (no WebGL2, reduced motion, lost context) gets the ch1 poster. **Phones (width < 768) always get the poster**: on a phone the hero is the numbers, and battery matters. The same `PerformanceMonitor` → DPR 1 → half haze ladder as the story.
- Loaded with `next/dynamic` (`ssr: false`) after hydration; the cards render first and never wait for it. The canvas pauses (`frameloop="demand"` or stops its loop) when scrolled out of view or the tab is hidden.
- The cards above it are glass, so the valley shows through, blurred.

### 7. Motion

- A shared `usePageReveals()` (same GSAP + ScrollTrigger setup as `useReveals`, its own small hook in `components/shell/`): every `.card` below the first screen fades up 24 px once (no reverse). Cards in the first screen are not animated, so nothing visible blinks on load.
- Count-ups: headline numbers opt in with `data-count` (the `/now` PM values, the scoreboard MAE values, the „Кой замърсява“ shares). They count from 0 once, ~0.9 s. Server text is the final number, so without JS or with reduced motion the right value is simply there.
- Reduced motion: neither hook runs.
- No Lenis smooth scroll on the platform: it is a tool, native scrolling stays.

### 8. Accessibility and checks

- Contrast: body text on glass ≥ 4.5:1 in both themes, checked against the worst case (glass over the brightest poster area).
- Focus rings use `--glow` and stay visible on glass.
- Screenshots of all 6 pages in dusk and day, desktop and 390 px phone, go in the PR.

## What's left to the builder

- Exact colour values, blur radii and shadow stacks, within the direction above.
- The camera position and drift amplitude for `NowSky`.
- How haze looks in day mode (`clear: 1` with `smog > 0` is a combination the story never shows): tune by eye, e.g. a paler, warmer haze.
- How `NowSky` detects "out of view" (IntersectionObserver is the obvious choice).
- Whether `.page-title`'s gradient needs a fallback colour for browsers without `background-clip: text` (it should: same pattern as the story).
- Which per-page rules in `globals.css` hardcode colours that break on the dusk default, and the minimal fix for each.

## Calls I made (Boris to check)

- Default theme flips to dark for everyone who never chose; explicit "light" is kept.
- Phones get the poster on `/now`, never the live scene.
- The poster-per-page mapping in 5.
- The level → smog mapping in 6, and the haze always showing VT (the valley) even when another station is picked.
- No smooth scroll on the platform.
