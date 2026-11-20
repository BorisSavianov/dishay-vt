import type { Metadata } from 'next';
import { Chapters } from '@/components/story/Chapters';
import { CtaCards } from '@/components/story/CtaCards';
import { EpisodeClock } from '@/components/story/EpisodeClock';
import { PhoneAlert } from '@/components/story/PhoneAlert';
import { SensorStats } from '@/components/story/SensorStats';
import { TodayCard } from '@/components/story/TodayCard';
import { TopBar } from '@/components/story/TopBar';
import { FORECAST_HREF } from '@/lib/story/routes';
import { StoryClient } from '@/components/story/StoryClient';
import css from '@/components/story/story.module.css';
import { readEpisode } from '@/lib/aq/episode';
import { loadForecast } from '@/lib/aq/load';
import { langOf, withLang } from '@/lib/page';
import { buildStoryData } from '@/lib/story/facts';
import { story } from '@/lib/story/strings';

export const dynamic = 'force-dynamic';

type Params = Promise<{ lang?: string | string[] }>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const lang = langOf(await searchParams);
  return { title: story(lang, 'meta.title'), description: story(lang, 'meta.description') };
}

export default async function StoryPage({ searchParams }: { searchParams: Params }) {
  const lang = langOf(await searchParams);
  const episode = readEpisode();
  const data = buildStoryData(await loadForecast(), episode, lang, new Date());
  const slots = {
    ch2: <EpisodeClock lang={lang} hourly={data.episodeHourly} />,
    ch3: <SensorStats lang={lang} readings={data.facts.readings} sources={data.facts.sourcesCount} />,
    ch4: <PhoneAlert lang={lang} episode={episode} />,
    ch7: <TodayCard lang={lang} today={data.today} />,
    ch8: <CtaCards lang={lang} forecastHref={FORECAST_HREF} />,
  };
  return (
    <main className={css.story} lang={lang}>
      <StoryClient data={data}>
        <div className={css.content}>
          <Chapters data={data} slots={slots} />
          <footer className={css.footer}>
            <p>{story(lang, 'foot.sources')}</p>
            <a href={withLang('/about', lang)}>{story(lang, 'foot.method')}</a>
          </footer>
        </div>
        <TopBar lang={lang} forecastHref={FORECAST_HREF} />
      </StoryClient>
    </main>
  );
}
