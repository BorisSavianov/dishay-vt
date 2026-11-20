# Story landing page: „Дишай ВТ“ (design)

Date: 20.11.2026. Owner: Boris. Status: draft for approval.

## Intent

The jury opens the live URL during the 5-minute pitch. The first thing they see should be a cinematic, scroll-driven 3D story that makes the invisible problem (winter smog in Veliko Tarnovo) visible, then proves we solved it: a forecast that warned the evening before and beats the official European one. The page wins the "wow" and then hands off to the working product.

## Goals

- **A real 3D scene, not decoration.** The Yantra valley around Veliko Tarnovo is built from real elevation data. Smog is a particle volume whose density follows real measurements.
- **One narrative arc in 8 chapters**, driven by scroll. There are 1–2 big moments (the smog rolling in, the fog clearing) instead of effects everywhere.
- **Every number** comes from `docs/slides/numbers.md` or the live `/api/aq` payload. No invented figures.
- **It ends in the product:** the live forecast (dashboard), the Telegram bot QR and the app.
- **BG and EN** via `?lang=en`, as on the rest of the site.

## Non-goals

- No new data or model work: `ml/` and the forecast loop stay untouched.
- No satellite imagery, and no new map provider.
- No changes to the dashboard's content (Velko's PR #37 owns that). The dashboard only moves to a new URL.

## Anti-goals (failure even if it "works")

- **A black or frozen canvas on the projector.** A static fallback is the floor, not a compromise.
- **Fetching anything critical from a third party at demo time** (terrain tiles, fonts). Venue Wi-Fi is a risk.
- **A number on the page that disagrees with the slides.**
- **Scroll-jacking that fights the presenter:** the story must also advance cleanly with a clicker or keyboard (Space, PageDown, arrows).

## Constraints

- Next.js 15.5, React 19.3, App Router, pnpm, exact pinned versions.
- `pnpm check` (typecheck, vitest, build) stays green.
- **Routing (decided):** the story is `/`. The dashboard moves to `/now`. Every internal link to `/` that means "dashboard" changes to `/now`: the nav item and the brand link in `web/src/components/shell/AppShell.tsx`.
- **Conflict with PR #37:** it rewrites `web/src/app/page.tsx` and `globals.css`. The move (`page.tsx` → `now/page.tsx`) lands after #37 is merged, so his changes come along. The story uses its own CSS module and does not edit `globals.css`. Until #37 is merged, the builder develops the story at `/story` on the branch, and swaps it to `/` (moving the dashboard to `/now`) as the last step. Nothing else links to `/`: the Telegram bot doesn't link to the site, and the mobile app uses only `/api/*`.
- Work happens on a branch (`boris/story-landing`). Nothing is committed to `main` or pushed without Boris's go.

## Approaches considered

1. **Native and light:** a canvas 2D particle field, CSS scroll-driven animations, no dependencies. Safest and fast, but the least "wow".
2. **GSAP and Lenis, pinned chapters, no WebGL:** an agency feel at moderate weight.
3. **three.js WebGL scene, plus GSAP ScrollTrigger and Lenis (picked).** A real 3D valley with volumetric smog and a camera that flies through the story. It has the most impact, with the most weight and risk, which the fallback and the performance budget below handle. Boris picked this with "no compromises, do not worry about time".

## Stack (builder's call, stated)

- `three` with `@react-three/fiber` v9 (React 19) and `@react-three/drei` for helpers (`useTexture`, `Points`, `PerformanceMonitor`, `AdaptiveDpr`).
- `@react-three/postprocessing` for bloom on the sensor lights and a light vignette.
- `gsap` with ScrollTrigger: all plugins are free, under GSAP's standard no-charge licence. One master timeline maps scroll progress (0–1) to the scene state.
- `lenis` for smooth scroll, synced to ScrollTrigger.
- All versions pinned exactly, using the latest stable versions at install time.
- The canvas is loaded with `next/dynamic` and `ssr: false`. The text of every chapter is server-rendered HTML, so the story reads even without JavaScript.

## Data

| Asset | Source | How |
|---|---|---|
| Heightmap of the VT area | AWS Terrain Tiles (Terrarium PNG, z12–13), public | A committed script `web/scripts/bake-terrain.ts` stitches a grid of tiles around VT (about 15 × 15 km, centred on 43.08 N, 25.63 E), decodes the elevation and writes `web/public/story/terrain.png` (16-bit-in-RGB or 8-bit normalised) plus `terrain.json` (bounds, min and max elevation). The output is committed, so there's no fetch at runtime. |
| Rivers and province outline | `web/src/data/region_veliko_tarnovo.json` (exists); the Yantra from OSM if it's cheap, otherwise it reads from the terrain itself | Draped onto the terrain as glowing lines |
| VT sensors (9) and all BG sensors (560) | `aq_forecast.json` stations: lat, lon and latest PM | Light points; colour by EAQI level |
| The smog episode | `web/src/data/aq_episode.json`: observed, CAMS and our forecasts for 18.12.2025 | Drives smog density over the 24 hours of chapter 2, and the chart in chapter 4 |
| Proof numbers | `forecast.model.mae_vt`, `model.scoreboard`, `episode.score`, `model.sources_what_if.last_winter.shares` | Chapters 4–6 |
| Today's air | `loadForecast()` on the server (same as the dashboard), bundled fallback | Chapter 7 |

The attribution goes in the footer and in `docs/sources.md`: "Terrain: AWS Terrain Tiles (Mapzen; SRTM, EU-DEM and others)". Also OSM, sensor.community and CAMS/Copernicus, as on the rest of the site.

## The story, chapter by chapter

Scroll progress drives one camera path and the scene uniforms. Each chapter is a full-height HTML section whose text fades or slides in over the pinned canvas.

1. **„Велико Търново. Зима.“ (hero).** Dusk over the 3D Yantra valley. The camera drifts slowly. Tsarevets and the meanders read through the light: height-based colour with contour lines and a soft rim light. Title „Дишай ВТ“ and the line „Знаем кога въздухът ще е мръсен. Ден по-рано.“, plus a scroll cue.
2. **„18 декември 2025“ (the smog rolls in).** First big moment. A 24-hour clock in the corner runs as you scroll. Smog particles rise out of the valley floor, their density driven by the real hourly PM10 for the day. The peak counter reads PM10 **68,9** µg/m³ against the EU limit of 50. The town lights dim through the haze.
3. **„555 сензора“.** The camera pulls up and out to Bulgaria. The 560 stations light up as points with bloom, a wave sweeping across the country. Counters: **555** sensors, **5,28 млн.** hourly readings, **6** sources.
4. **„Предупредихме вечерта преди това“.** Back to VT. A phone-shaped HTML card shows the alert we would have sent on 17.12. The episode chart draws itself: observed, our forecast and CAMS. Then **18 от 23** bad days warned the evening before, with the sub-line „CAMS: 20 от 23, но с 23 фалшиви тревоги (ние: 11)“.
5. **„По-точно от официалната прогноза“.** Bars race: our model **3,2** vs CAMS **6,1** → **48% по-точно**. This season: **2,6 vs 5,2 → 50%**. The particles condense into the bars, a moment that reuses the particle system.
6. **„Кой замърсява?“.** The particles split into 4 coloured streams: heating **45%**, regional transport 25%, other 27%, traffic 3%, labelled „оценка“. What-if: „20% смяна на отоплението → 15 вместо 23 лоши дни“.
7. **„Днес“ (the fog clears).** Second big moment. The smog dissolves and the valley returns to clear daylight. Today's live level for VT comes from the server, with „Обновено днес, HH:MM“. If the live data is unavailable, the bundled forecast is used and labelled as such.
8. **„Дишай спокойно“ (the call to action).** Three cards:
   - **Отвори прогнозата** (`/now`).
   - The **Telegram** QR: a copy of `docs/slides/telegram_qr.svg` in `web/public/story/`; it opens `t.me/dishay_vt_bot?start=jury`.
   - **The app:** a phone frame playing a muted loop of the real app alert. The source is `docs/slides/backup/app-alert.mp4`, re-encoded to a short web clip under 1.5 MB with a poster frame. There is no public store link, so the card says „iOS приложение (демо)“. A footer with sources, attributions and the team.

The copy is the builder's draft, in the voice of the existing `strings.ts`: short and concrete. Boris reviews it in the preview.

## Visual direction

- **Palette:** a night navy close to the existing `--side-bg` (#131435), sliding through cold blue dusk to warm sodium-orange town lights in the smog. The smog is a desaturated ochre-grey. The final daylight is clean, with the existing accent indigo. EAQI colours are taken from the existing level colours in `web/src/lib/aq/levels.ts`, so the story matches the product.
- **Type:** Inter Variable (already bundled). Big, tight display headings, with counters in tabular numerals.
- **Motion:** easing with weight (`power3`/`expo`). Text enters with a staggered line reveal (GSAP SplitText, now free). No bounce.
- **Light and dark:** the 3D scene is the same in both; the HTML cards follow the theme tokens.

## Page chrome (builder's call, stated)

- The story is full-bleed, without the dashboard's sidebar (`AppShell`).
- A slim fixed top bar holds:
  - the brand;
  - the existing `LangSwitch` and `ThemeToggle`;
  - a „Прогнозата на живо →“ button to `/now`, always visible, so the presenter can jump out at any point.
- A chapter progress rail runs on the right edge: 8 dots, which can be clicked.
- Metadata: title and description from `story.*` strings. The OG image is the chapter 1 poster.

## Fallback and performance (the floor)

- **Detect** WebGL2 support, `prefers-reduced-motion` and a rough GPU tier (drei `PerformanceMonitor`; drop the DPR and particle count when FPS falls below 50).
- **If there's no WebGL, or reduced motion is set:** each chapter shows a pre-rendered poster image (`web/public/story/ch1.webp` … `ch8.webp`, captured from the real scene by the builder) with the same text and simple fades. Counters show their final values.
- **Budget:** particles at most 60k on a desktop GPU, 15k on mobile. The story JS is under 400 KB gzipped, loaded only on `/`. The first text is visible before the canvas loads (the title is server-rendered). The terrain texture is under 1 MB.
- **Phone, 390 px:** the same story with a simplified camera path and fewer particles. Text cards are full-width. No horizontal scroll.
- **Presenter control:** Space, PageDown and arrow keys jump chapter by chapter (snap to chapter anchors). The scroll position persists on reload, so a refresh mid-pitch doesn't restart.

## Files

- `web/src/app/page.tsx`: the story page (server: loads the forecast and episode, renders the chapter HTML, mounts the client scene).
- `web/src/app/now/page.tsx`: the current dashboard, moved after PR #37 merges.
- `web/src/components/story/`: `StoryScene.tsx` (canvas root), `Terrain.tsx`, `Smog.tsx` (particles and shader), `Sensors.tsx`, `CameraRig.tsx`, `useStoryTimeline.ts` (GSAP and Lenis), `Fallback.tsx`, `story.module.css`.
- `web/src/lib/story/`: pure helpers with vitest tests: lat/lon → scene coordinates, the episode hour → smog density, chapter progress mapping, number formatting from the payload.
- `web/src/lib/aq/strings.ts`: `story.*` keys in BG and EN.
- `web/scripts/bake-terrain.ts`, plus the outputs in `web/public/story/`.
- `web/src/components/shell/AppShell.tsx`: the dashboard nav item and the brand link point to `/now`; the nav gains a „История“ or „За проекта“ link to `/`.
- `docs/sources.md`: the terrain attribution.

## Done when

- `pnpm check` is green, including tests for the `lib/story` helpers.
- `preview_start`: `/` scrolls through all 8 chapters with no console errors, in Chrome and Safari, at a steady frame rate on the Mac (target 60 fps; never below 45). Keyboard and clicker navigation works.
- The fallback is forced (WebGL disabled, and reduced motion set) and reads correctly with the posters.
- At 390 px, light and dark: no overflow, text readable.
- Every number on the page matches `docs/slides/numbers.md`.
- `/now` is the dashboard, unchanged apart from the URL. All nav links work in BG and EN.
- Screenshots of each chapter are saved to `docs/slides/backup/story/` as demo backups.

## Left to the builder

- The exact camera path, shader details, particle look and copy wording, within the direction above.
- Whether the Yantra is a separate OSM line or only reads from the terrain.
- The terrain resolution and the extent of the bake, within the budget.
