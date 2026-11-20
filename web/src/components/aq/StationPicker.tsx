import { PROFILES, type Profile } from '@/lib/aq/levels';
import { air, profileName } from '@/lib/aq/strings';
import type { AqStation } from '@/lib/aq/types';
import type { Lang } from '@/lib/types';

// Station and group as a plain GET form (?station=, ?profile=), so it works without JavaScript.
// Stations are grouped by city, the featured city first, so the list reads like a list of places.
export function StationPicker({
  stations,
  station,
  profile,
  lang,
  action,
}: {
  stations: AqStation[];
  station: string;
  profile: Profile;
  lang: Lang;
  action: string;
}) {
  const featuredCity = (stations.find((s) => s.featured) ?? stations[0])?.city;
  const cities = new Map<string, AqStation[]>();
  for (const s of [...stations].sort((a, b) => a.name.localeCompare(b.name, 'bg'))) {
    cities.set(s.city, [...(cities.get(s.city) ?? []), s]);
  }
  const groups = [...cities.entries()].sort(
    ([a], [b]) => Number(b === featuredCity) - Number(a === featuredCity) || a.localeCompare(b, 'bg'),
  );

  return (
    <form className="air-picker" method="get" action={action}>
      <input type="hidden" name="lang" value={lang} />
      <label className="field">
        <span>{air(lang, 'air.station')}</span>
        <select name="station" defaultValue={station}>
          {groups.map(([city, list]) => (
            <optgroup key={city} label={city}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{air(lang, 'web.profile')}</span>
        <select name="profile" defaultValue={profile}>
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {profileName(lang, p)}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary" type="submit">
        {air(lang, 'web.station.go')}
      </button>
    </form>
  );
}
