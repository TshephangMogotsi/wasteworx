# WasteWorx

WasteWorx is a web-only recycling operations portal. It serves household and business recycling workflows from a React website, with Supabase retained temporarily as the production authentication/data bridge while the Cloudflare Worker and D1 migration is completed.

## Run locally

Requires Node.js 20.19+ or 22.12+ (Vite 8 does not start on older versions).

```bash
npm install
npm run web:build   # once: the Worker config expects dist-web/ to exist
npm run api:dev     # terminal 1: Cloudflare Worker API on http://127.0.0.1:8787
npm start           # terminal 2: website on http://127.0.0.1:5173
```

Open `http://127.0.0.1:5173`. Vite proxies `/v1/*` to the Worker; set `API_PROXY_TARGET` in `.env.local` to point at a different API.

### Signed-in pages locally

Signed-in pages need the Supabase project values in two places, plus a local database:

1. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (used by the website).
2. Copy `cloudflare/api/.dev.vars.example` to `cloudflare/api/.dev.vars` and set the same two values (used by the Worker). Both files are git-ignored.
3. Run `npm run api:migrate:local` to create the local D1 tables.
4. Restart both dev servers, sign in, and open **Businesses** once so the Worker creates your local user.
5. Give that user a staff role in the local database:

```bash
npx wrangler d1 execute wasteworx-development --local --config cloudflare/api/wrangler.jsonc \
  --command "insert into user_roles (user_id, role, granted_at) select id, 'super_admin', datetime('now') from app_users where email = 'you@example.com'"
```

The local database starts empty; it does not contain data from Supabase or the deployed D1 databases.

## Website routes

- `/` — resident home, activity, rewards and sorting guidance
- `/sign-in`, `/sign-up`, `/forgot-password`, `/update-password` — account access
- `/admin` — staff operations dashboard
- `/admin/households` and `/admin/register-household` — household operations
- `/admin/businesses` and `/admin/businesses/new` — business onboarding
- `/admin/businesses/:id/edit` — finish a saved draft (any staff member; locked once submitted)
- `/business-account` — business client account area

## Environment

Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key using `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

### Email confirmation must stay on

`/sign-up` is public, and the Worker links a new account to pending household and business invitations by email address. This is only safe while the Supabase project requires email confirmation (Authentication → Sign In / Providers → Email → **Confirm email**). The Worker also refuses accounts whose email is unconfirmed, but with confirmation switched off Supabase marks every new address as confirmed, so that check alone is not enough.

## Checks and deployment

```bash
npm test            # typecheck, build, API tests and the browser test
npx wrangler deploy --config cloudflare/api/wrangler.jsonc
```

`npm test` starts its own copy of the app on spare ports: the Worker on a throwaway local database, a stand-in for Supabase Auth, and the website. It does not touch Supabase, your local development database or anything deployed, and it can run while `npm start` and `npm run api:dev` are running.

- `npm run test:api` — Worker API tests only ([tests/api.test.mjs](tests/api.test.mjs)).
- `npm run test:web` — the business draft flow in headless Chrome ([tests/web.test.mjs](tests/web.test.mjs)). It is skipped if Chrome is not installed; set `CHROME_PATH` to point at another Chromium-based browser.
- `npm run typecheck` — website and Worker types only.

Both test scripts need `dist-web/` to exist, so run `npm run web:build` once before using them on their own.

The development website and API are served together by the Cloudflare Worker. See [the Cloudflare migration notes](cloudflare/README.md) for D1, Queue and data-import details.
