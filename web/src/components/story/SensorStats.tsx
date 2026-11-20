'use client';

import { fmtNum, story } from '@/lib/story/strings';
import type { Lang } from '@/lib/types';
import { CountUp } from './CountUp';
import css from './story.module.css';

// Chapter 3 counters: readings and sources count up as the map of Bulgaria lights.
export function SensorStats({ lang, readings, sources }: { lang: Lang; readings: number; sources: number }) {
  const [readingsBefore, readingsAfter] = story(lang, 'ch3.readings', { readings: '§' }).split('§');
  const [sourcesBefore, sourcesAfter] = story(lang, 'ch3.sources', { n: '§' }).split('§');
  return (
    <ul className={css.facts}>
      <li>
        {readingsBefore}
        <CountUp className={css.num} to={readings} format={(n) => fmtNum(lang, n, 2, 'millions')} />
        {readingsAfter}
      </li>
      <li>
        {sourcesBefore}
        <CountUp className={css.num} to={sources} format={(n) => fmtNum(lang, Math.round(n))} />
        {sourcesAfter}
      </li>
    </ul>
  );
}
