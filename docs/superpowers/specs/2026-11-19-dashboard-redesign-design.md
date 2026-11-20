# Dashboard redesign: web and mobile

Status: approved by the owner's answers on 2026-11-19. Branch `feat/dashboard`, cut from `wip/liquid-glass`. Demo: Fri 2026-11-20 16:15.

## Intent

The owner supplied a mock (`FMI Open Data / Population`): a clean SaaS dashboard. The whole product, web then mobile, takes this look. It replaces the Liquid Glass look and the unfinished Transmission redesign (`feat/transmission` and its stash stay parked, untouched).

## Decisions made by the owner

1. Transmission is replaced. The dashboard is the only direction.
2. Build order: web first, then the Expo mobile app.
3. Data: real data only. No invented figures, no placeholders.
4. Themes: light (default) and dark.

## Calls made by the builder

- Bulgarian (default) and English stay, with key parity.
- Sidebar lists only pages with real content: Dashboard, Geographic Explorer, Health, AI Insights, Datasets and Sources, Methodology and About. No Data Explorer, Visualizations or Comparisons.
- Narrow screens swap the sidebar for a bottom bar, as in the mobile mock.
- Charts are hand-written SVG. No chart library. `three` and `@react-three/fiber` are removed with the 3D scenes.
- `?lang=` stays the language switch. The shell is rendered by each page with `lang` as a prop; every link carries `?lang=`.
- Theme: `data-theme` on `<html>`, set before first paint from `localStorage`; light when nothing is saved.

## Panels and the data behind them

| Mock panel | Built as | Data |
|---|---|---|
| Population (2025) with -16.0% | KPI card | Eurostat series, first and last year |
| Population density | dropped | no area data |
| Median age | dropped | no data |
| Annual change (avg) | KPI card, compound annual rate | computed in `lib/metrics.ts`, method named on the About page |
| (new) Physicians per 1,000 | KPI card, labelled Bulgaria, national | World Bank |
| (new) Health facilities | KPI card, 56, with 247 bus stops in the subtitle | OSM |
| Population trend, Line/Area/Bar | working switch, hover tooltip, data table for screen readers | Eurostat |
| Key insight | sentence built from the series, not AI. "Explore with AI" links to AI Insights | Eurostat |
| Age-group donut | donut of the 56 health facilities by type | OSM |
| Geographic distribution | facility dot map (no boundaries exist) | OSM |
| Last updated | newest `generated_at` of the three datasets | meta |
| Export | CSV download per dataset via `/api/export/<name>` | all |
| Location picker | static "Veliko Tarnovo" label | none |

## Goals and anti-goals

Goals: matches the mock in layout, colour and type; works at 375 to 1440 px; both languages; light and dark; every figure traceable to a source and date.

Anti-goals: a number not in the data; dead controls; horizontal overflow at 375 px; Bulgarian text in a fallback serif; losing the AI grounding check.

## Out of scope

New datasets, accounts, free-text AI questions, municipality boundaries.

## Mobile (after web)

Same tokens and panels in Expo: Overview, Data and Map tabs with a bottom bar. `palette.ts` and `tokens-parity.test.ts` follow the web tokens (light default).
