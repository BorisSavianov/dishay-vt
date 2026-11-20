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

-- Air-quality forecast. ml/aq_forecast.py upserts one row per station every hour; the web reads them.
create table if not exists aq_forecast (
  station_id text primary key,
  generated_at timestamptz not null,
  payload jsonb not null
);

-- The model that made the forecast: name, rows, holdout scores. Always one row.
create table if not exists aq_model (
  id integer primary key default 1 check (id = 1),
  generated_at timestamptz not null,
  payload jsonb not null
);
