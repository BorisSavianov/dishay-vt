create table if not exists datasets (
  name text primary key,
  payload jsonb not null,
  as_of date,
  updated_at timestamptz not null default now()
);

create table if not exists ai_cache (
  key text primary key,
  text text not null,
  provider text not null,
  created_at timestamptz not null default now()
);

create table if not exists rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (key, window_start)
);

-- Air-quality forecast (contract/CONTRACT.md "Neon table"). ml/aq_forecast.py replaces all rows every hour in one
-- transaction: the row '_model' holds { generated_at, model }, every other row is one station.
create table if not exists aq_forecast (
  id text primary key,
  generated_at timestamptz not null,
  payload jsonb not null
);
