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
