# Auth + Multi-Tenancy Plan

Branch: `feat/auth-multitenancy` (NOT merged to main — the live app keeps
working until we deliberately switch over).

## Why this exists

Today every table has `USING (true)` for the `anon` key that's embedded in the
public JS bundle. There is **no separation between users** — anyone who loads
the site can read/write every project, supplier price, margin, and document.
Before letting real users (or customs brokers) in, we need login + per-user
isolation. This is the unblocker for free users AND for a meaningful load test.

## Phase A — login + ownership (in this branch, SAFE)

Non-destructive. The app still works whether or not someone is logged in; we
only add a login wall in the UI and start tagging projects with an owner.

Code:
- `src/components/LoginPage.js` — email + password (Supabase Auth), Hebrew RTL.
- `src/components/AuthGate.js` — gates `<App/>`; shows login when no session;
  floating "התנתק" (sign-out) button. `/share/<token>` stays public.
- `src/index.js` — wraps `<App/>` in `<AuthGate>` (share route untouched).

DB:
- `supabase/migrations/20260605_auth_owner.sql` — adds `projects.owner_id` +
  a trigger that stamps `owner_id = auth.uid()` on insert. **Safe to apply now.**

### Supabase dashboard steps (Nir)
1. Authentication → Providers → **Email**: ensure enabled (on by default).
2. Authentication → **Email confirmation**: for easy early testing you can turn
   it OFF (instant login on sign-up). Turn it back ON before public launch.
3. (Optional, later) add **Google** provider for one-click sign-in.
4. Apply `20260605_auth_owner.sql` in the SQL editor.

After this, deploy the branch to a **preview** URL (not production) and sign up
once. New projects you create will be owned by you. Existing ones stay
owner-less until Phase B backfills them.

## Phase B — flip on isolation (GATED, destructive — `20260606_rls_isolation.sql`)

⚠️ Do NOT run until all of these are done, in order:
1. `20260605` applied and the login build is live (preview or prod).
2. You've signed in once. Get your id: `select id, email from auth.users;`
3. Edit `backfill_owner` in `20260606_rls_isolation.sql` to that uuid.
4. **Switch the share portal to the RPC** (`src/lib/shares.js`): replace the
   direct table reads in `verifyShareAccess` + `loadShareData` with a single
   call to `supabase.rpc('get_share_bundle', { p_token, p_code })`. The RPC
   returns `{ role, project, products, shipments, files, settings }` with the
   money-secret columns already stripped server-side. (Not done yet — this is
   the one code change Phase B still needs.)
5. Run `20260606_rls_isolation.sql`.
6. Test: your data shows; a 2nd test account sees none of it; an existing
   `/share` link still opens with the code.

Rollback = re-create the old `USING (true)` policies per table.

## Known follow-ups (after isolation works)
- **Per-user global settings.** The `settings` global row (`project_id IS NULL`)
  is still shared. Give `settings` its own `owner_id` so defaults (VAT, customs,
  margin, usd_rate) are per-user. (Phase B.1)
- **Reference tables** (`container_pricing`, `container_types`, `market_rates`,
  `freight_history`) are shared read; lock writes to an admin role.
- **AI cost guardrail.** Every extraction calls Opus via the proxy. Before free
  sign-ups, add a per-user/day rate limit (e.g. in the `anthropic-proxy` edge
  function, keyed by `auth.uid()`), or the API bill is unbounded.

## Then: the load test (meaningful only after isolation)
Once each user owns their own ~10 projects, drive load with k6 or Artillery:
- Create N test users via the Supabase admin API.
- Each obtains a JWT (sign-in), then runs the real read/write mix (load
  projects, insert products, fetch settings) against the isolated schema.
- Watch: Supabase connection pool saturation, RLS subquery cost on
  `owns_project`, and edge-function concurrency for extraction.
A 100-user test against the CURRENT shared schema would only measure raw DB
throughput, not real product behavior — which is why isolation comes first.
