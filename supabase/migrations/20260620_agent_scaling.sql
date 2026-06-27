-- Scaling infrastructure for the seasonal agent: result caching + atomic
-- rate limiting. Designed for high concurrency (≈10k simultaneous users) where
-- the dominant cost/latency is the Anthropic web-search call and the Hunter.io
-- lookup. Caching collapses duplicate queries; rate limiting caps abuse/cost.
--
-- All tables are written/read ONLY by edge functions using the service-role
-- key (which bypasses RLS). RLS is enabled with no public policies so the anon
-- key cannot read or write them.

-- ── Seasonal result cache ────────────────────────────────────────────────────
create table if not exists seasonal_cache (
  cache_key  text primary key,
  market     text,
  category   text,
  audience   text,
  count      int,
  result     jsonb not null,
  hits       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists seasonal_cache_created_idx on seasonal_cache (created_at);
alter table seasonal_cache enable row level security;

-- ── Contact-enrichment cache (keyed by domain) ───────────────────────────────
create table if not exists contact_cache (
  domain     text primary key,
  result     jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_cache_created_idx on contact_cache (created_at);
alter table contact_cache enable row level security;

-- ── Fixed-window rate limiter ────────────────────────────────────────────────
create table if not exists rate_limit (
  bucket       text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);
alter table rate_limit enable row level security;

-- Atomic check-and-increment. Returns TRUE if the request is allowed.
-- One row per (bucket) = e.g. "seasonal:1.2.3.4". Window resets when expired.
create or replace function check_rate_limit(p_bucket text, p_limit int, p_window int)
returns boolean
language plpgsql
as $$
declare
  v_count int;
begin
  insert into rate_limit (bucket, count, window_start)
    values (p_bucket, 1, now())
  on conflict (bucket) do update
    set count = case
          when rate_limit.window_start < now() - make_interval(secs => p_window)
          then 1 else rate_limit.count + 1 end,
        window_start = case
          when rate_limit.window_start < now() - make_interval(secs => p_window)
          then now() else rate_limit.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

-- Optional housekeeping: prune old cache/limit rows. Schedule with pg_cron if
-- available, or call periodically.
create or replace function prune_agent_tables()
returns void
language sql
as $$
  delete from seasonal_cache where created_at < now() - interval '14 days';
  delete from contact_cache  where created_at < now() - interval '30 days';
  delete from rate_limit     where window_start < now() - interval '1 day';
$$;
