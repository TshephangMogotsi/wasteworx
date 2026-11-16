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

The Worker needs `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` for authenticated routes. For local development put them in `cloudflare/api/.dev.vars` (git-ignored), and apply the local D1 migrations as described in [the Cloudflare migration notes](cloudflare/README.md).

## Website routes

- `/` — resident home, activity, rewards and sorting guidance
- `/sign-in`, `/sign-up`, `/forgot-password`, `/update-password` — account access
- `/admin` — staff operations dashboard
- `/admin/households` and `/admin/register-household` — household operations
- `/admin/businesses` and `/admin/businesses/new` — business onboarding
- `/business-account` — business client account area

## Environment

Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key using `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Checks and deployment

```bash
npm run web:typecheck
npm run web:build
npx wrangler deploy --config cloudflare/api/wrangler.jsonc
```

The development website and API are served together by the Cloudflare Worker. See [the Cloudflare migration notes](cloudflare/README.md) for D1, Queue and data-import details.
