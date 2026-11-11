# WasteWorx

WasteWorx is a web-only recycling operations portal. It serves household and business recycling workflows from a React website, with Supabase retained temporarily as the production authentication/data bridge while the Cloudflare Worker and D1 migration is completed.

## Run locally

```bash
npm install
npm start
```

Open `http://127.0.0.1:5173`.

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
