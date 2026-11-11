# WasteWorx Cloudflare migration

This directory is the parallel replacement for the Supabase backend. It is intentionally isolated from the live Expo app while the migration is built and verified.

## Development resources created

- D1 database: `wasteworx-development` (`f69ef03e-ceba-4fea-add3-9a970710513f`, WEUR)
- Queue: `wasteworx-jobs-development`

No production Cloudflare resources, production traffic, or Supabase data have been changed by this scaffold.

The first Docker-free inventory found one pilot household, address, membership, role, and invitation attempt, plus six audit records. No business records exist yet.

## Architecture

- Customer authentication: Clerk. The Worker verifies Clerk session tokens; WasteWorx roles and tenant access remain in D1.
- Staff access: Cloudflare Access, applied to the eventual admin Worker route/domain.
- API: a Cloudflare Worker in `api/`.
- Relational data: D1 / SQLite, with application-layer authorization replacing Supabase RLS and RPC functions.
- Evidence files and certificates: R2. The current OAuth token does not include R2 write permission, so the bucket is deliberately not created yet.
- Invitations and report generation: Cloudflare Queues.

Until a replacement customer-auth provider is selected, the development Worker uses a temporary Supabase Auth bridge for authenticated migration endpoints. It sends the caller's existing bearer token to Supabase Auth for validation and does not parse or trust the token itself. The required URL and publishable key are Worker secrets, not source-controlled configuration.

## Local development

```bash
npx wrangler d1 migrations apply wasteworx-development --local --config cloudflare/api/wrangler.jsonc
npx wrangler dev --config cloudflare/api/wrangler.jsonc
```

## Docker-free pilot-data import

The importer reads the linked Supabase project through its Management API and writes only to the isolated Cloudflare development D1 database. It never writes to Supabase. It deliberately requires `--replace` because it clears the development target before importing.

```bash
node cloudflare/scripts/import-supabase-to-d1.mjs --replace
```

## Before a deployment

1. Create the Clerk application and configure Expo redirect URLs.
2. Add the Clerk verification key as a Worker secret; never commit it.
3. Re-authenticate Wrangler with R2 write permission, then create the private `wasteworx-evidence-development` bucket.
4. Apply the D1 migration remotely and deploy the health-only Worker.
5. Port authenticated API routes and the Expo client one vertical slice at a time.
