import { EpisodeChart } from '@/components/aq/EpisodeChart';
import type { AqEpisode } from '@/lib/aq/episode';
import { dayBefore } from '@/lib/aq/episode';
import { PM25_BANDS } from '@/lib/aq/levels';
import { air } from '@/lib/aq/strings';
import { fmtNum, story } from '@/lib/story/strings';
import type { Lang } from '@/lib/types';
import css from './story.module.css';

// Chapter 4: the notification we would have sent on the evening of 17.12, next to what then happened.
export function PhoneAlert({ lang, episode }: { lang: Lang; episode: AqEpisode | null }) {
  const forecast = episode ? dayBefore(episode) : null;
  return (
    <div className={css.warned}>
      <div className={css.phone} data-phone aria-label={story(lang, 'ch4.alert')} role="img">
        <div className={css.notch} aria-hidden="true" />
        <div className={css.notice}>
          <div className={css.noticeHead}>
            <span className={css.appIcon} aria-hidden="true" />
            <b>{story(lang, 'ch1.title')}</b>
            <span>{story(lang, 'ch4.alertTime')}</span>
          </div>
          <p>{story(lang, 'ch4.alert')}</p>
        </div>
      </div>
      {episode && forecast && (
        <div className={css.chart} data-draw>
          <EpisodeChart
            observed={episode.observed}
            forecast={forecast.hourly}
            cams={episode.cams}
            threshold={PM25_BANDS[1]}
            alt={air(lang, 'ep.alt', { date: '18.12.2025' })}
            format={(n) => fmtNum(lang, n, 0)}
            labels={{
              observed: air(lang, 'ep.observed'),
              forecast: air(lang, 'ep.forecast'),
              band: air(lang, 'ep.band'),
              cams: air(lang, 'ep.cams'),
              threshold: air(lang, 'ep.threshold'),
            }}
          />
        </div>
      )}
    </div>
  );
}
