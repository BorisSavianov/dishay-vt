import type { ReactNode } from 'react';
import { LEVEL_COLORS } from '@/lib/aq/levels';
import { fmtNum, story, type StoryKey } from '@/lib/story/strings';
import type { StoryData } from '@/lib/story/facts';
import css from './story.module.css';

// Optional client widgets the island injects per chapter (HUDs, phone, today card, CTA).
export type ChapterSlots = Partial<Record<'ch2' | 'ch3' | 'ch4' | 'ch7' | 'ch8', ReactNode>>;

type Align = 'center' | 'left' | 'right';

function Chapter({ n, align, children, wide }: { n: number; align: Align; children: ReactNode; wide?: boolean }) {
  const day = n >= 7;
  return (
    <section id={`ch-${n}`} data-chapter={n} className={`${css.chapter} ${css[align]}`} aria-labelledby={`ch-${n}-title`}>
      <div className={`${css.card} ${wide ? css.wide : ''} ${day ? css.day : ''}`} data-reveal>
        {children}
      </div>
    </section>
  );
}

export function Chapters({ data, slots = {} }: { data: StoryData; slots?: ChapterSlots }) {
  const { lang, facts: f } = data;
  const s = (key: StoryKey, vars?: Record<string, string | number>) => story(lang, key, vars);
  const n1 = (x: number) => fmtNum(lang, x, 1);
  const pct = (x: number) => fmtNum(lang, Math.round(x * 100));

  return (
    <>
      <section id="ch-1" data-chapter={1} className={`${css.chapter} ${css.hero}`} aria-labelledby="ch-1-title">
        <p className={css.kicker} data-reveal>
          {s('ch1.kicker')}
        </p>
        <h1 id="ch-1-title" className={css.display} data-split>
          {s('ch1.title')}
        </h1>
        <p className={css.lead} data-reveal>
          {s('ch1.lead')}
        </p>
        <a className={css.cue} href="#ch-2">
          <span>{s('ch1.cue')}</span>
          <span className={css.cueLine} aria-hidden="true" />
        </a>
      </section>

      <Chapter n={2} align="left">
        <p className={css.kicker}>{s('ch2.kicker')}</p>
        <h2 id="ch-2-title" className={css.title} data-split>
          {s('ch2.title')}
        </h2>
        {slots.ch2}
        <p className={css.big}>
          {s('ch2.stat', { value: n1(f.episode.pm10Daily) })}
        </p>
        <p className={css.note}>{s('ch2.limit', { limit: f.episode.euLimit })}</p>
      </Chapter>

      <Chapter n={3} align="right">
        <p className={css.kicker}>{s('ch3.kicker')}</p>
        <h2 id="ch-3-title" className={css.title} data-split>
          {s('ch3.title', { sensors: fmtNum(lang, f.sensors) })}
        </h2>
        {slots.ch3 ?? (
          <ul className={css.facts}>
            <li>{s('ch3.readings', { readings: fmtNum(lang, f.readings, 2, 'millions') })}</li>
            <li>{s('ch3.sources', { n: f.sourcesCount })}</li>
          </ul>
        )}
      </Chapter>

      <Chapter n={4} align="left" wide>
        <p className={css.kicker}>{s('ch4.kicker')}</p>
        <h2 id="ch-4-title" className={css.title} data-split>
          {s('ch4.title')}
        </h2>
        {slots.ch4}
        <p className={css.note}>{s('ch4.statLead')}</p>
        <p className={css.big}>{s('ch4.stat', { hits: f.warned.hits, bad: f.warned.bad })}</p>
        <p className={css.note}>
          {s('ch4.sub', { camsHits: f.warned.camsHits, bad: f.warned.bad, camsFalse: f.warned.camsFalse, falseAlarms: f.warned.falseAlarms })}
        </p>
      </Chapter>

      <Chapter n={5} align="right">
        <p className={css.kicker}>{s('ch5.kicker')}</p>
        <h2 id="ch-5-title" className={css.title} data-split>
          {s('ch5.title')}
        </h2>
        <dl className={css.bars}>
          <div>
            <dt>{s('ch5.ours')}</dt>
            <dd>
              <span className={css.barOurs} style={{ inlineSize: `${(f.maeVt.model / f.maeVt.cams) * 100}%` }} data-bar />
              <b>{n1(f.maeVt.model)}</b>
            </dd>
          </div>
          <div>
            <dt>{s('ch5.cams')}</dt>
            <dd>
              <span className={css.barCams} style={{ inlineSize: '100%' }} data-bar />
              <b>{n1(f.maeVt.cams)}</b>
            </dd>
          </div>
        </dl>
        <p className={css.big}>{s('ch5.pct', { pct: f.maeVt.betterPct })}</p>
        <p className={css.note}>{s('ch5.unit')}</p>
        <p className={css.note}>
          {s('ch5.season', { model: n1(f.season.model), cams: n1(f.season.cams), pct: f.season.betterPct })}
        </p>
      </Chapter>

      <Chapter n={6} align="center">
        <p className={css.kicker}>{s('ch6.kicker')}</p>
        <h2 id="ch-6-title" className={css.title} data-split>
          {s('ch6.title')}
        </h2>
        <ul className={css.sources}>
          {(
            [
              ['heating', 5],
              ['regional', 3],
              ['other', 2],
              ['traffic', 4],
            ] as const
          ).map(([key, level]) => (
            <li key={key} style={{ ['--c' as string]: LEVEL_COLORS[level] }}>
              <b>{pct(f.sources[key])}%</b>
              <span>{s(`ch6.${key}`)}</span>
            </li>
          ))}
        </ul>
        <p className={css.note}>{s('ch6.estimate')}</p>
        <p className={css.lead}>
          {s('ch6.whatif', { pct: f.whatIf.switchPct, days: f.whatIf.badDays, base: f.whatIf.badDaysBase })}
        </p>
      </Chapter>

      <Chapter n={7} align="center">
        <p className={css.kicker}>{s('ch7.kicker')}</p>
        <h2 id="ch-7-title" className={css.title} data-split>
          {s('ch7.title')}
        </h2>
        {slots.ch7}
      </Chapter>

      <Chapter n={8} align="center" wide>
        <h2 id="ch-8-title" className={css.title} data-split>
          {s('ch8.title')}
        </h2>
        <p className={css.lead}>{s('ch8.lead')}</p>
        {slots.ch8}
      </Chapter>
    </>
  );
}
