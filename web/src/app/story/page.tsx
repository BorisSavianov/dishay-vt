import type { Metadata } from 'next';
import { Chapters } from '@/components/story/Chapters';
import css from '@/components/story/story.module.css';
import { readEpisode } from '@/lib/aq/episode';
import { loadForecast } from '@/lib/aq/load';
import { langOf } from '@/lib/page';
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
  const data = buildStoryData(await loadForecast(), readEpisode(), lang, new Date());
  return (
    <main className={css.story} lang={lang}>
      <div className={css.content}>
        <Chapters data={data} />
      </div>
    </main>
  );
}
