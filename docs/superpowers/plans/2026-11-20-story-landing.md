# Story landing page implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A full-bleed, scroll-driven 3D story at `/` that takes the jury from the smog of 18.12.2025 in Veliko Tarnovo to our proof and the live product. The dashboard moves to `/now`.

**Architecture:**
- The server page renders all 8 chapters as HTML and passes a small `StoryData` object, built from the forecast and the episode, to one client island.
- The island mounts a single pinned R3F canvas: the terrain, the smog particles and the sensor lights.
- A pure scene timeline in `lib/story/` maps scroll progress (0–1) to the camera and uniform keyframes. GSAP ScrollTrigger, smoothed by Lenis, feeds progress into it.
- Without WebGL, or with reduced motion, the canvas is replaced by per-chapter poster images.

**Tech stack:** Next.js 15.5, React 19.3, `three`, `@react-three/fiber` v9, `@react-three/drei`, `@react-three/postprocessing`, `gsap` (ScrollTrigger and SplitText), `lenis`, vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-story-landing-design.md`

## Global constraints

- Work on the branch `boris/story-landing`, cut from `main`. Make local commits on that branch per task, once Boris has given one go-ahead for that. Don't push and don't merge to `main` without his separate go.
- Install dependencies with `pnpm add -E` (exact versions), as `package.json` already does.
- Don't edit `web/src/app/globals.css` or `web/src/lib/aq/strings.ts`: PR #37 owns them. Story copy lives in `web/src/lib/story/strings.ts`, and story CSS in `web/src/components/story/story.module.css`. This deviates from the spec's "strings.ts" line. It's a minor call, made to avoid conflicts.
- Every number shown comes from `docs/slides/numbers.md` or from the payload. Use **23** for bad days. Never use "15 of 179".
- Numbers use Bulgarian formatting in BG (`3,2`, `5,28 млн.`) and English formatting in EN (`3.2`, `5.28M`).
- Nothing critical is fetched from a third party at runtime. The terrain, QR, video and posters are all in `web/public/story/`.
- `pnpm check` is green at the end of every task.
- Budgets:
  - particles: 60,000 on desktop, 15,000 on narrow or low-tier devices;
  - story client JS: under 400 KB gzip;
  - `terrain.png`: under 1 MB;
  - app clip: under 1.5 MB.
- Keyboard: Space, PageDown and ArrowDown go to the next chapter; Shift+Space, PageUp and ArrowUp go to the previous one; Home and End go to the first and last.
- All copy in BG and EN, selected with `?lang=en` through `langOf`.

## Review focus

1. **A phone or projector without WebGL2, or with `prefers-reduced-motion: reduce`:** the posters and text read in order; there's no blank canvas and no console error. (Task 7: `detectMode` tests.)
2. **The live forecast is unavailable (`source: 'bundled'` or `'demo'`):** chapter 7 still renders, with a visible "last saved forecast" note, never an invented "today". (Task 1: `buildStoryData` test for bundled and demo.)
3. **The VT featured stations have no `latest` value:** the "today" card shows the forecast level for the current hour from `hourly`, or "няма данни" if there's none. It never shows `NaN` or `0`. (Task 1 test.)
4. **A keyboard or clicker at the last or first chapter:** pressing next on chapter 8 (or previous on chapter 1) does nothing and doesn't throw. (Task 3: `chapterTarget` tests.)
5. **A narrow viewport (390 px) and resizing:** no horizontal scroll, and the canvas DPR and particle count drop. (Task 7: `particleBudget` tests, plus the 390 px pass in Task 9.)

---

### Task 1: Branch, dependencies, `/story` route with the chapter HTML, facts and strings

**Files:**
- Create: `web/src/lib/story/facts.ts`, `web/src/lib/story/facts.test.ts`, `web/src/lib/story/strings.ts`, `web/src/lib/story/strings.test.ts`, `web/src/app/story/page.tsx`, `web/src/components/story/Chapters.tsx`, `web/src/components/story/story.module.css`
- Modify: `web/package.json` (dependencies)

**Interfaces:**
- Produces:
  - `type StoryLang = Lang` (re-export of `@/lib/types`).
  - `STORY_FACTS` constant:
    ```ts
    {
      sensors: 555,
      readings: 5_277_731,
      sourcesCount: 6,
      stationsLive: 560,
      episode: { date: '2025-12-18', pm10Daily: 68.9, euLimit: 50 },
      warned: { hits: 18, bad: 23, falseAlarms: 11, camsHits: 20, camsFalse: 23 },
      maeVt: { model: 3.2, cams: 6.1, persistence: 4.8, betterPct: 48 },
      season: { model: 2.6, cams: 5.2, betterPct: 50 },
      sources: { heating: 0.45, regional: 0.25, other: 0.27, traffic: 0.03 },
      whatIf: { switchPct: 20, badDays: 15, badDaysBase: 23 },
    }
    ```
  - `type StoryToday = { level: Level | null; pm25: number | null; pm10: number | null; updatedIso: string; stale: boolean; source: AqSource }`, where `AqSource` comes from `@/lib/aq/load` (`'database' | 'bundled' | 'demo'`), not from `types.ts`.
  - `type StoryData = { lang: Lang; facts: typeof STORY_FACTS; today: StoryToday; episodeHourly: { t: string; pm10: number; pm25: number }[]; episodeForecast: { t: string; pm10: number }[]; camsHourly: { t: string; pm10: number }[]; sensors: { lat: number; lon: number; level: Level; vt: boolean }[] }`.
  - `buildStoryData(load: AqLoad, episode: AqEpisode | null, lang: Lang, now: Date): StoryData`.
  - `story(lang: Lang, key: StoryKey, vars?: Record<string, string | number>): string`.
  - `fmtNum(lang: Lang, n: number, digits?: number): string`.
  - `<Chapters data={StoryData} />`: renders `<section id="ch-1">`…`<section id="ch-8">`, each with `data-chapter={n}`.

- [ ] **Step 1: Branch and install**

  Run in `web/`:

  ```bash
  git switch -c boris/story-landing
  pnpm add -E three @react-three/fiber @react-three/drei @react-three/postprocessing gsap lenis
  pnpm add -E -D @types/three
  ```

  Expected: `package.json` lists the packages without `^`. `@react-three/fiber` is 9.x.

- [ ] **Step 2: Write the failing tests in `facts.test.ts`**
  - `STORY_FACTS matches docs/slides/numbers.md`:
    - read `new URL('../../../../docs/slides/numbers.md', import.meta.url)` as text;
    - assert it contains `VT: model 3.2, persistence 4.8, CAMS 6.1 → 48% better than CAMS`, `model caught 18, 11 false alarms; CAMS caught 20, 23 false alarms`, `555 BG sensors`, `5,277,731`, and `VT model 2.6 vs CAMS 5.2 → 50% better`.
  - `STORY_FACTS agrees with the bundled payload`:
    - load `src/data/aq_forecast.json` and `aq_episode.json`;
    - `model.mae_vt` equals `{model:3.2,cams:6.1,persistence:4.8}`;
    - `episode.observed_daily.pm10_mean === 68.9`;
    - `episode.score.model_alert.hits === 18`;
    - `episode.score.bad_days === 23`;
    - `model.sources_what_if.last_winter.shares`, read as `unknown`, has `heating` ≈ 0.45 (±0.01).
  - `buildStoryData uses the featured VT stations for today`:
    - from a fixture `AqLoad` with 2 featured stations whose `latest` is `{pm25: 3, pm10: 6}` and `{pm25: 5, pm10: 10}`;
    - expect `today.pm25 === 4`, `today.pm10 === 8`, `today.level === 1` and `source === 'database'`.
  - `buildStoryData falls back to the current forecast hour when latest is null`:
    - `latest: null`, with an `hourly` entry at `now` of `pm25: 20`;
    - expect `today.pm25 === 20` and `today.level === 3`.
  - `buildStoryData returns nulls, not NaN, with no data`: `today.level === null` and `today.pm25 === null`.
  - `buildStoryData marks stale and bundled`: with `source: 'bundled'` and `generated_at` 3 h before `now`, expect `today.stale === true` and `today.source === 'bundled'`.
  - `buildStoryData maps sensors with levels`: 560 stations in, the same count out; `vt` is true exactly for `featured`.

- [ ] **Step 3: Run `pnpm vitest run src/lib/story` and confirm the tests fail** because the module doesn't exist.

- [ ] **Step 4: Implement `facts.ts`.**
  - `today` uses the mean over featured stations of `latest`, or else `currentHour(hourly, now)` from `@/lib/aq/levels`.
  - The level comes from `levelOf`.
  - `stale` is true when `now - generated_at > 2 h`.
  - The episode arrays come from `episode.observed`, `dayBefore(episode).hourly` and `episode.cams`.

- [ ] **Step 5: Write `strings.ts` and the failing test in `strings.test.ts`.**
  - The test `every BG key has an EN key and no empty strings` iterates both tables.
  - The test `fmtNum formats per language`: `fmtNum('bg', 3.2, 1) === '3,2'` and `fmtNum('en', 3.2, 1) === '3.2'`.
  - Keys, using the BG copy; the EN copy is a faithful translation:

  | Key | BG |
  |---|---|
  | `ch1.kicker` | „Велико Търново. Зима.“ |
  | `ch1.title` | „Дишай ВТ“ |
  | `ch1.lead` | „Знаем кога въздухът ще е мръсен. Ден по-рано.“ |
  | `ch1.cue` | „Превърти надолу“ |
  | `ch2.kicker` | „18 декември 2025“ |
  | `ch2.title` | „Градът изчезва в смог“ |
  | `ch2.stat` | „PM10 средно за деня: {value} µg/m³“ |
  | `ch2.limit` | „Нормата на ЕС е {limit}“ |
  | `ch2.clock` | „{hour}:00“ |
| `ch2.hourly` | „PM10 в този час: {value} µg/m³“ |
  | `ch3.title` | „{sensors} граждански сензора“ |
  | `ch3.readings` | „{readings} почасови измервания“ |
  | `ch3.sources` | „{n} източника на данни“ |
  | `ch4.title` | „Предупредихме вечерта преди това“ |
  | `ch4.alert` | „Утре въздухът във ВТ ще е умерен. Ако имаш астма, ограничи навън.“ |
  | `ch4.stat` | „{hits} от {bad} лоши дни“ |
  | `ch4.sub` | „CAMS: {camsHits} от {bad}, но с {camsFalse} фалшиви тревоги (ние: {falseAlarms})“ |
  | `ch5.title` | „По-точно от официалната прогноза“ |
  | `ch5.ours` | „Нашият модел“ |
  | `ch5.cams` | „CAMS (ЕС)“ |
  | `ch5.pct` | „{pct}% по-точно“ |
  | `ch5.season` | „Този сезон: {model} срещу {cams} → {pct}%“ |
  | `ch5.unit` | „средна грешка, PM2.5, µg/m³, 24 ч напред, ВТ, зима 2025/26“ |
  | `ch6.title` | „Кой замърсява?“ |
  | `ch6.heating` | „отопление“ |
  | `ch6.regional` | „пренос“ |
  | `ch6.other` | „друго“ |
  | `ch6.traffic` | „трафик“ |
  | `ch6.estimate` | „оценка, миналата зима“ |
  | `ch6.whatif` | „Ако {pct}% от домовете на дърва сменят отоплението: {days} вместо {base} лоши дни.“ |
  | `ch7.title` | „Днес“ |
  | `ch7.level` | „Въздухът във ВТ: {level}“ |
  | `ch7.updated` | „Обновено днес, {time}“ |
  | `ch7.bundled` | „Последната записана прогноза“ |
  | `ch7.none` | „Няма данни за този час“ |
  | `ch8.title` | „Дишай спокойно“ |
  | `ch8.forecast` | „Отвори прогнозата“ |
  | `ch8.telegram` | „Предупреждения в Телеграм“ |
  | `ch8.app` | „iOS приложение (демо)“ |
  | `bar.live` | „Прогнозата на живо →“ |
  | `meta.title` | „Дишай ВТ – прогноза за въздуха във Велико Търново“ |
  | `meta.description` | `ch1.lead` |
  | `foot.sources` | „Данни: sensor.community, Open-Meteo, CAMS/Copernicus, OpenStreetMap, AWS Terrain Tiles (Mapzen; SRTM, EU-DEM)“ |
  | `rail.label` | „Глави“ |

- [ ] **Step 6: Implement `strings.ts`** in the same shape as `lib/aq/strings.ts`: `bg` as const, `en: Record<StoryKey, string>`, and `story()` with `{var}` replacement. Run the tests; expected PASS.

- [ ] **Step 7: Create `app/story/page.tsx`** as a server component, with `dynamic = 'force-dynamic'` and `generateMetadata` from `meta.*`.
  - Data: `loadForecast()`, `readEpisode()` and `buildStoryData(...)`.
  - Render: `<main className={css.story}>` with `<Chapters data={data} />` (HTML only in this task).

  `Chapters` lays out each section at a minimum of 100svh, with the text card positioned per chapter:
  - chapter 1: centred;
  - chapters 2 and 4: left;
  - chapters 3 and 5: right;
  - chapters 6–8: centred.

  CSS in `story.module.css`:
  - local tokens on `.story`: `--night: #0a0b24`, `--dusk: #1b2a5c`, `--sodium: #ffb15c`, `--smog: #9a907e`, `--clear: #4f46e5`, plus the level colours from `LEVEL_COLORS` as inline custom properties;
  - display type `clamp(3rem, 9vw, 9rem)` with `letter-spacing: -0.04em`;
  - counters with `font-variant-numeric: tabular-nums`.

- [ ] **Step 8: Verify.** Run `pnpm check`; expected green. Then `preview_start` (`web` dev) and open `/story` and `/story?lang=en`: all 8 chapters' text in order, with the real numbers.

- [ ] **Step 9: Commit.** `git add -A web && git commit -m "feat(story): /story route with chapter copy and facts"`

---

### Task 2: Terrain bake and geo projection

**Files:**
- Create: `web/scripts/bake-terrain.ts`, `web/public/story/terrain.png`, `web/public/story/terrain.json`, `web/src/lib/story/geo.ts`, `web/src/lib/story/geo.test.ts`
- Modify: `docs/sources.md` (attribution), `web/package.json` (script `story:terrain`)

**Interfaces:**
- Produces:
  - `TERRAIN: { west: number; east: number; south: number; north: number; minM: number; maxM: number; size: number }`: the JSON shape, imported by the scene.
  - `toScene(lat: number, lon: number, t: typeof TERRAIN, worldSize?: number): [x: number, z: number]`: the local VT frame, a `worldSize` (default 20) square centred on 0.
  - `toBg(lat: number, lon: number): [x: number, z: number]`: the Bulgaria frame for chapter 3, an equirectangular projection with cos(42.7°) scaling, over the bounds 22.3–28.7 E and 41.2–44.3 N, mapped to x ∈ [−20, 20].
  - `decodeTerrarium(r: number, g: number, b: number): number`: metres, `r*256 + g + b/256 - 32768`.

- [ ] **Step 1: Write the failing tests in `geo.test.ts`.**
  - `decodeTerrarium(128, 0, 0) === 0`.
  - `decodeTerrarium(128, 200, 0) === 200`.
  - `toScene` maps the bounds' centre to `[0, 0]`, and the north-west corner to `[-10, -10]` with the default size.
  - `toBg(42.7, 25.5)` is within 1 unit of `[0, 0]`.
  - Sofia `(42.70, 23.32)` has x < 0 and Varna `(43.21, 27.91)` has x > 0.

- [ ] **Step 2: Run them; expect a FAIL. Implement `geo.ts`; expect a PASS.**

- [ ] **Step 3: Write `scripts/bake-terrain.ts`** (run with `tsx`, Node `fetch`, PNG decode via `pngjs`; install it as a dev dependency with `-E`).
  - Tiles: z13, from `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Compute the tile range in the script from the centre (43.08 N, 25.63 E) and a 15 km square; don't hardcode x/y.
  - Stitch them, crop to the 15 km square (about 1024 px), resample to 1024×1024, and decode with `decodeTerrarium`.
  - Write the height as 8-bit grayscale (normalised minM..maxM → 0..255, about 1.6 m steps) to `public/story/terrain.png`, and write `terrain.json` with the bounds and min and max metres.
  - Add the script `"story:terrain": "tsx scripts/bake-terrain.ts"`.

- [ ] **Step 4: Run `pnpm story:terrain`.** Expected: both files are written, `terrain.png` is under 1 MB, `minM` is about 100–200 and `maxM` is about 400–600.

- [ ] **Step 5: Add the attribution line** to `docs/sources.md` under a new "Terrain" row (AWS Terrain Tiles, Mapzen; SRTM, EU-DEM and others; public domain or attribution).

- [ ] **Step 6: `pnpm check`, then commit:** `feat(story): baked VT terrain and projections`

---

### Task 3: Scene timeline and scroll engine

**Files:**
- Create: `web/src/lib/story/timeline.ts`, `web/src/lib/story/timeline.test.ts`, `web/src/components/story/useStoryScroll.ts`, `web/src/components/story/ProgressRail.tsx`

**Interfaces:**
- Produces:
  - `CHAPTERS = 8`.
  - `type SceneState = { cam: [number, number, number]; target: [number, number, number]; fov: number; smog: number; dusk: number; sensorsBg: number; morph: 'none' | 'bars' | 'streams'; morphT: number; clear: number; episodeHour: number }`.
  - `KEYFRAMES: { p: number; s: SceneState }[]`, with one keyframe at each chapter's start (`p = (n-1)/8`), plus the end at 1.
  - `sceneAt(p: number): SceneState`: smoothstep interpolation between neighbouring keyframes. `morph` takes the value of the earlier keyframe.
  - `chapterOf(p: number): number`: 1..8.
  - `chapterTarget(current: number, key: string, shift: boolean): number | null`: returns `null` when there's no move.

  Keyframe values; the builder may tune the camera numbers in Task 4's visual pass, but not the order:

  | Ch | `smog` | `dusk` | `sensorsBg` | `morph` | `clear` | `episodeHour` |
  |---|---|---|---|---|---|---|
  | 1 | 0 | 1 | 0 | none | 0 | 0 |
  | 2 | 1 | 0.8 | 0 | none | 0 | 0→23 across the chapter |
  | 3 | 0.3 | 1 | 1 | none | 0 | 23 |
  | 4 | 0.8 | 0.7 | 0 | none | 0 | 23 |
  | 5 | 0.6 | 0.6 | 0 | bars | 0 | 23 |
  | 6 | 0.6 | 0.6 | 0 | streams | 0 | 23 |
  | 7 | 0 | 0 | 0 | none | 1 | 23 |
  | 8 | 0 | 0 | 0 | none | 1 | 23 |

- [ ] **Step 1: Write the failing tests in `timeline.test.ts`.**
  - `sceneAt(0)` deep-equals `KEYFRAMES[0].s`.
  - `sceneAt(1).clear === 1`.
  - `sceneAt` is continuous: for 200 steps, |Δcam| < 2 between neighbours.
  - `chapterOf(0) === 1`, `chapterOf(0.999) === 8` and `chapterOf(1) === 8`.
  - The episode hour rises monotonically through chapter 2: `sceneAt(1/8 + 0.5/8).episodeHour` is between 10 and 13.
  - `chapterTarget(8, 'ArrowDown', false) === null`.
  - `chapterTarget(1, 'ArrowUp', false) === null`.
  - `chapterTarget(1, ' ', true) === null`.
  - `chapterTarget(3, ' ', false) === 4`.
  - `chapterTarget(3, 'PageUp', false) === 2`.
  - `chapterTarget(5, 'Home', false) === 1`.
  - `chapterTarget(5, 'End', false) === 8`.
  - `chapterTarget(5, 'a', false) === null`.

- [ ] **Step 2: Run them; expect a FAIL. Implement `timeline.ts`; expect a PASS.**

- [ ] **Step 3: Implement `useStoryScroll(onProgress: (p: number) => void): { chapter: number; goTo: (n: number) => void }`**, a client hook.
  - Create `Lenis` with `{ lerp: 0.09 }` and drive it from `gsap.ticker`. Call `ScrollTrigger.update` on Lenis scroll.
  - Use one `ScrollTrigger` on `main` with `start: 'top top'`, `end: 'bottom bottom'` and `onUpdate: (st) => onProgress(st.progress)`.
  - On `keydown`, use `chapterTarget`, then `lenis.scrollTo('#ch-'+n, { duration: 1.4 })` and `preventDefault`.
  - Skip the key handling when focus is in an input or link, or when a modifier other than Shift is held.
  - With reduced motion, don't create Lenis; use native scroll with `scroll-behavior: smooth`.
  - Clean everything up on unmount.

- [ ] **Step 4: Build `ProgressRail`** with 8 buttons and `aria-label` from `rail.label`, which call `goTo(n)`. The current chapter gets `aria-current="step"`.

- [ ] **Step 5: Wire up and check.** Mount the rail in `story/page.tsx` through a client wrapper `StoryClient.tsx` (created here; it receives `data: StoryData`). Verify in the preview that Space, PageDown and the rail move one chapter, and that nothing happens past the ends.

- [ ] **Step 6: `pnpm check`, then commit:** `feat(story): scene timeline and scroll engine`

---

### Task 4: Canvas, terrain and camera rig

**Files:**
- Create: `web/src/components/story/StoryScene.tsx`, `web/src/components/story/Terrain.tsx`, `web/src/components/story/CameraRig.tsx`, `web/src/components/story/sceneStore.ts`
- Modify: `web/src/components/story/StoryClient.tsx`

**Interfaces:**
- Consumes: `sceneAt`, `TERRAIN`, `toScene`, `useStoryScroll`.
- Produces:
  - `sceneStore`: a module-level mutable `{ p: number; state: SceneState }`, written by the scroll hook and read in `useFrame`. There's no React re-render per frame.
  - `<StoryScene data={StoryData} tier={'high'|'low'} />`.

- [ ] **Step 1: Add the canvas to `StoryClient`.** It mounts `StoryScene` through `next/dynamic(() => import('./StoryScene'), { ssr: false })` inside a `position: fixed; inset: 0; z-index: 0` layer, with the chapters above it (`z-index: 1`, `pointer-events` only on the cards).
  - Canvas: `dpr={[1, tier === 'high' ? 2 : 1.25]}`, `gl={{ antialias: true, powerPreference: 'high-performance' }}`, `camera={{ fov: 40, near: 0.1, far: 200 }}`.

- [ ] **Step 2: Build `Terrain`.**
  - A plane of 512×512 segments (256 on `low`) of `worldSize` 20.
  - Displace it **on the CPU** at load: decode `terrain.png` through a canvas and `getImageData`, set the vertex y positions (height normalised, scaled to 2.2 units), then call `computeVertexNormals()`. No height sampling in the shader, because filtering and colour-space handling would distort it.
  - Pass the metres to the shader as a vertex attribute `aHeightM`.
  - Fragment shader:
    - a colour ramp by height: valley `#0f1838` → slopes `#24366e` → ridges `#5a6fb0`;
    - contour lines every 25 m (`fract(heightM/25)` with `fwidth` anti-aliasing) at 25% opacity;
    - a rim light from a low warm sun;
    - mixes driven by uniforms: `uDusk` (towards a cold navy), `uClear` (towards a daylight ramp `#cfd8ff` → `#7f8fe0`, with contours in `--clear`) and `uSmog` (desaturate and lift towards `#9a907e`, by height-weighted fog);
    - town lights: a sodium glow (`#ffb15c`) masked to low-altitude valley cells near the VT centre (`toScene(43.0757, 25.6172)`), dimmed by `uSmog`.

- [ ] **Step 3: Build `CameraRig`.** In `useFrame`, lerp the camera position and target towards `sceneStore.state` (factor `1 - exp(-6*dt)`), and set the fov.
  - In chapter 1, add an idle drift (±0.15 units, sin of time) while the reader isn't scrolling.

- [ ] **Step 4: Tune and check visually.** In the preview, scroll through the chapters and tune the `KEYFRAMES` camera values so that:
  - ch1 is a low, oblique view down the Yantra meanders towards Tsarevets;
  - ch2 is slightly lower, inside the valley;
  - ch3 rises high (the BG frame comes in Task 6);
  - ch4–6 are a three-quarter view with the town in the left third;
  - ch7 and ch8 are a wide, bright daylight view.

  Keep the `timeline` tests green.

- [ ] **Step 5: Check the frame rate.** Confirm with `tabs_context` that the pane is visible first; a hidden pane throttles rAF. With `pnpm check` green, run the preview with `read_console_messages` (no errors) and `requestAnimationFrame` sampling through `javascript_tool`: the average is at least 55 fps on the Mac while scrolling ch1–2.

- [ ] **Step 6: Commit:** `feat(story): 3D terrain and camera rig`

---

### Task 5: Smog particles, the bars morph and the source streams

**Files:**
- Create: `web/src/lib/story/smog.ts`, `web/src/lib/story/smog.test.ts`, `web/src/components/story/Smog.tsx`

**Interfaces:**
- Consumes: `StoryData.episodeHourly`, `sceneStore`, `STORY_FACTS.maeVt`, `STORY_FACTS.sources`.
- Produces:
  - `smogDensity(hourly: {pm10: number}[], hour: number): number`: 0..1, `pm10 / 180` clamped, linearly interpolated between whole hours.
  - `barTargets(count: number, values: { model: number; cams: number }, seed?: number): Float32Array`: xyz per particle, splitting the particles between two vertical bars whose heights are proportional to the values. With 3.2 and 6.1, the CAMS bar is 1.906× taller.
  - `streamTargets(count: number, shares: { heating: number; regional: number; other: number; traffic: number }, seed?: number): { positions: Float32Array; group: Uint8Array }`: the particle count per group is proportional to its share, ±1.

- [ ] **Step 1: Write the failing tests in `smog.test.ts`.**
  - `smogDensity` at the hour of the max PM10 (180.4) is 1.
  - Hour 0 of the real episode equals `observed[0].pm10/180` (±1e-6).
  - Hour 10.5 is the midpoint of hours 10 and 11.
  - Values are clamped to [0, 1].
  - `barTargets(10000, {model:3.2,cams:6.1})`: the max y of the CAMS particles divided by the max y of the model particles is 1.906 (±0.02).
  - `streamTargets(10000, STORY_FACTS.sources)`: the heating count is 4500 (±1) and the traffic count is 300 (±1).

- [ ] **Step 2: Run them; expect a FAIL. Implement; expect a PASS.**

- [ ] **Step 3: Build `Smog`.** One `THREE.Points` with `count` = 60,000 (`high`) or 15,000 (`low`) and a custom `ShaderMaterial`.
  - Attributes:
    - `aHome`: a volume over the valley, with y weighted to the valley floor using the height sampled from the terrain;
    - `aBar` (from `barTargets`);
    - `aStream` and `aGroup` (from `streamTargets`);
    - `aRand`.
  - Uniforms: `uTime`, `uSmog` (scene `smog` × `smogDensity(hour)` during ch2), `uMorph` (0 → bars, 1 → streams, via `morphT`), `uClear`.
  - Vertex shader: curl-noise drift on the home positions, then mix towards the targets with a per-particle stagger of `aRand * 0.3`. Point size is attenuated by distance.
  - Fragment shader:
    - soft round sprites with additive-free alpha blending;
    - colours: smog `#9a907e` with a sodium tint near town; bars in the accent indigo (ours) and grey `#8b8fa8` (CAMS); streams in the level colours `LEVEL_COLORS[5]` for heating, `[3]` for regional, `[2]` for other and `[4]` for traffic.
  - When `uSmog` is 0 and the morph is none, the particles fade to 0 alpha, so ch1, ch7 and ch8 are clear.

- [ ] **Step 4: Build the chapter 2 HUD in `Chapters`.**
  - The clock: `ch2.clock`, with the hour from `sceneStore` via a small client component that reads it with `requestAnimationFrame` (no React state per frame; write `textContent`).
  - A live counter for the PM10 at that hour, labelled with the new key `ch2.hourly` („PM10 в този час: {value}“ / „PM10 this hour: {value}“), so its peak of 180,4 never reads as the daily figure, plus the static daily stat `ch2.stat` (68,9) against `ch2.limit`.

- [ ] **Step 5: Build the HTML labels for chapters 5 and 6.**
  - Chapter 5: the bar values (`fmtNum`), `ch5.pct`, `ch5.season` and `ch5.unit`.
  - Chapter 6: the four labels with their percentages, `ch6.estimate` and `ch6.whatif`.
  - Text reveals: GSAP SplitText by lines, `y: 110%` → `0`, `stagger: 0.06` and `ease: 'expo.out'`, triggered per section at `top 70%`.

- [ ] **Step 6: `pnpm check`, then verify in the preview.** Scroll ch2: the smog thickens towards the evening peak and the clock runs. Ch5: the bars form at the right ratio. Ch6: the streams separate. Ch7: everything clears. Then commit: `feat(story): data-driven smog, bars and source streams`

---

### Task 6: Sensors, the alert phone, the episode chart, "Today" and the call to action

**Files:**
- Create: `web/src/components/story/Sensors.tsx`, `web/src/components/story/PhoneAlert.tsx`, `web/src/components/story/TodayCard.tsx`, `web/src/components/story/CtaCards.tsx`, `web/public/story/telegram_qr.svg` (copy), `web/public/story/app-alert.mp4`, `web/public/story/app-alert.jpg`
- Modify: `web/src/components/story/StoryScene.tsx`, `web/src/components/story/Chapters.tsx`

**Interfaces:**
- Consumes: `StoryData.sensors`, `StoryData.today`, `toBg`, `toScene`, `sceneStore.state.sensorsBg`.
- Produces: the components above, each taking slices of `StoryData`.

- [ ] **Step 1: Build `Sensors`.** Use an `InstancedMesh` of small spheres, or `Points`, for all 560 stations.
  - Position: mix between `toScene` (VT frame; stations outside the terrain hidden) and `toBg` lifted to y=3 (BG frame), driven by `sensorsBg`.
  - Colour: `LEVEL_COLORS[level]`.
  - A reveal wave: each point fades in by its x position, with a delay of `(x+20)/40 * 0.6` of chapter progress.
  - Add `<EffectComposer><Bloom intensity={1.1} luminanceThreshold={0.6} mipmapBlur /></EffectComposer>` in `StoryScene`, on `high` only. Add a vignette on both tiers.
  - The ch3 HUD counters count up once on enter (GSAP `textContent` tween with `snap`), formatted with `fmtNum`: `ch3.title`, `ch3.readings` (`5,28 млн.` / `5.28M`) and `ch3.sources`.

- [ ] **Step 2: Build `PhoneAlert` (ch4).**
  - A CSS phone frame (rounded rectangle, notch) holding a notification card: the brand, „17.12, 19:00“ (the evening-before time from `planAlerts` in `lib/aq/levels.ts`) and `ch4.alert`. It slides up with a slight 3D tilt (`rotateX(12deg)` → `0`, `perspective: 1200px`) on enter.
  - Next to it, reuse `EpisodeChart` from `@/components/aq/EpisodeChart` with its existing props, fed by `readEpisode()` in the server page. Draw it on enter by animating `stroke-dashoffset` on its paths from the CSS module, through `:global(path)` inside the wrapper.
  - The big stat `ch4.stat` and the sub-line `ch4.sub`.

- [ ] **Step 3: Build `TodayCard` (ch7).** The level chip uses `levelName` from `@/lib/aq/strings`, coloured by `LEVEL_COLORS`.
  - Show `ch7.updated` with `clockLabel(lang, updatedIso)`.
  - If `source !== 'database'` or `stale`, show `ch7.bundled`.
  - If `level === null`, show `ch7.none`.

- [ ] **Step 4: Build `CtaCards` (ch8).**
  - The first card links to `withLang('/now', lang)` and is the primary button. Until Task 8 swaps the routes, the link points to `/`.
  - The QR card: `<img src="/story/telegram_qr.svg">` plus the link `https://t.me/dishay_vt_bot?start=jury`.
  - The app card: `<video src="/story/app-alert.mp4" poster="/story/app-alert.jpg" muted loop playsInline autoPlay>` inside a phone frame. The video plays only while the card is in view (IntersectionObserver), and not at all with reduced motion.
  - Prepare the media:

    ```bash
    ffmpeg -i ../docs/slides/backup/app-alert.mp4 -vf "scale=360:-2,fps=24" -c:v libx264 -crf 30 -an -movflags +faststart public/story/app-alert.mp4
    ffmpeg -i public/story/app-alert.mp4 -frames:v 1 public/story/app-alert.jpg
    ```

    Expected: the mp4 is under 1.5 MB. If not, raise `-crf` to 33.
  - The footer: `foot.sources`, plus a link to `/about` (methodology).

- [ ] **Step 5: Build the top bar** in `StoryClient`: the brand (text „Дишай ВТ“), `LangSwitch`, `ThemeToggle`, and the button `bar.live` → `/now` (`/` until Task 8). Labels come from `t()` in `@/lib/i18n` (`lang.label`, `theme.toggle`, `theme.light`, `theme.dark`). The bar is fixed and translucent, with `backdrop-filter: blur(12px)`.

- [ ] **Step 6: Verify, then commit.** Run `pnpm check`. In the preview, ch3 shows a lit map of Bulgaria, ch4 the phone and the drawn chart, ch7 the live level, and ch8 the QR and the looping video. No console errors. Commit: `feat(story): sensors, alert, today and calls to action`

---

### Task 7: Fallback, tiers and posters

**Files:**
- Create: `web/src/lib/story/mode.ts`, `web/src/lib/story/mode.test.ts`, `web/src/components/story/Fallback.tsx`, `web/public/story/ch1.webp` … `ch8.webp`
- Modify: `web/src/components/story/StoryClient.tsx`, `web/src/components/story/StoryScene.tsx`

**Interfaces:**
- Produces:
  - `detectMode(env: { webgl2: boolean; reducedMotion: boolean; width: number; cores: number; memoryGb?: number }): 'webgl-high' | 'webgl-low' | 'poster'`.
  - `particleBudget(mode, width): number`.

- [ ] **Step 1: Write the failing tests in `mode.test.ts`.**
  - `detectMode`:
    - no WebGL2 → `'poster'`;
    - reduced motion → `'poster'`;
    - width 390 → `'webgl-low'`;
    - 4 cores → `'webgl-low'`;
    - 2 GB of memory → `'webgl-low'`;
    - width 1440 with 10 cores → `'webgl-high'`.
  - `particleBudget`: `('webgl-high', 1440) === 60000`, `('webgl-low', 390) === 15000` and `('poster', 1440) === 0`.

- [ ] **Step 2: Run them; expect a FAIL. Implement; expect a PASS.**

- [ ] **Step 3: Wire up the modes.** `StoryClient` probes the environment once on mount (`document.createElement('canvas').getContext('webgl2')`, `matchMedia('(prefers-reduced-motion: reduce)')`, `navigator.hardwareConcurrency`, `navigator.deviceMemory`). Until the probe finishes, the chapters render with posters, so the first paint is never a blank canvas.
  - In `StoryScene`, add drei `<PerformanceMonitor onDecline={() => setDpr(1)} />` and `<AdaptiveDpr pixelated={false} />`.
  - If the frame rate is still below 40 after a decline, halve the particle draw range (`geometry.setDrawRange`).
  - Handle `webglcontextlost` on the canvas by switching to `'poster'`.

- [ ] **Step 4: Build `Fallback`.** Each section gets its poster as a background (`ch{n}.webp`, `object-fit: cover`), with the text cards unchanged. Counters render their final values, and there are no GSAP timelines.

- [ ] **Step 5: Capture the posters.** Capture the **canvas pixels only**, never the page: the live text is drawn on top of the poster later. In the preview at 1440×900, with a development-only `?story=capture` flag that sets `preserveDrawingBuffer: true`, scroll to the middle of each chapter and run `canvas.toDataURL('image/png')` through `javascript_tool`. Save `public/story/ch{n}.webp` (`cwebp -q 78`) at 1600 px wide, each under 250 KB. Use `ch1.webp` as the OG image in `generateMetadata` (`openGraph.images`).

- [ ] **Step 6: Verify, then commit.** Run `pnpm check`. In the preview, force `poster` with `?story=poster` (a debug override, read only in development) and with `resize_window` plus a reduced-motion emulation: the posters and text read in order, with no errors. Commit: `feat(story): poster fallback and performance tiers`

---

### Task 8: Swap the routes (after PR #37 is merged)

**Files:**
- Move: `web/src/app/page.tsx` → `web/src/app/now/page.tsx`
- Move: `web/src/app/story/page.tsx` → `web/src/app/page.tsx`
- Modify: `web/src/components/shell/AppShell.tsx:21` (`href: '/now'`), `AppShell.tsx:70` (brand → `withLang('/now', lang)`), `CtaCards.tsx` and `StoryClient.tsx` (`/now`)
- Modify: the `README.md` layout section (one line: `/` is the story, `/now` the dashboard)

- [ ] **Step 1: Check that #37 is merged.** Run `gh pr view 37 --json state -q .state`; expected `MERGED`. If it isn't, stop and ask Boris. Then `git merge origin/main` into the branch.

- [ ] **Step 2: Move the pages** with `git mv`, add a nav entry `{ id: 'story', href: '/', label: 'nav.story', … }` in `AppShell`, and fix the imports. Add the key `nav.story` (BG „За проекта“, EN „The story“) to `web/src/lib/i18n.ts`.

- [ ] **Step 3: Search for stale root links.** `grep -rn "withLang('/'" web/src` should leave no dashboard links on `/`.

- [ ] **Step 4: Verify, then commit.** Run `pnpm check`. In the preview, `/` is the story, `/now` and `/now?lang=en` are the dashboard, and every sidebar link works. Commit: `feat(story): story at /, dashboard at /now`

---

### Task 9: Full verification and demo backups

**Files:**
- Create: `docs/slides/backup/story/ch1.png` … `ch8.png`, `docs/slides/backup/story/mobile-ch1.png`, `docs/slides/backup/story/poster-ch4.png`

- [ ] **Step 1:** Run `pnpm check`; expected green.
- [ ] **Step 2: Chrome (the preview pane).** Run through all 8 chapters by scroll and by keyboard. Check `read_console_messages` with `onlyErrors`: there should be none. Sample the frame rate with rAF: the average is at least 55 and no 1-second window drops below 45.
- [ ] **Step 3: Safari and a real iPhone (Boris).** Under computer use the agent can't drive browsers, so Boris opens `http://<mac-ip>:3000/` in Safari on the Mac and on his iPhone and steps through with the same checklist. The agent can take read-only screenshots of Safari meanwhile.
- [ ] **Step 4: 390 px, light and dark.** `document.documentElement.scrollWidth === 390` on every chapter, the text is readable, and the `webgl-low` tier is active.
- [ ] **Step 4b: JS budget.** Run `pnpm build`, then gzip-size the dynamically loaded scene chunk(s) in `.next/static/chunks` (`gzip -c <file> | wc -c`). The total for the story is under 400 KB. Next's "First Load JS" figure does not include it.
- [ ] **Step 5: Check the numbers.** `get_page_text` on `/` and `/?lang=en`; every figure is in `docs/slides/numbers.md` or the live payload.
- [ ] **Step 6: Screenshots.** Save the backup screenshots listed above.
- [ ] **Step 7: Commit:** `docs(story): demo backup screenshots`. Then report to Boris and wait for the go to push or open a PR.
