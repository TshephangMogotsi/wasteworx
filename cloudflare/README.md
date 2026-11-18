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

## Signup confirmation

Deploy the web build with the `/confirm-email` page before testing new confirmation emails.

In the hosted Supabase project's **Authentication → URL Configuration**, set **Site URL** to the intended public WasteWorx origin rather than localhost. Add these development Worker redirect URLs for regular signup, household invitations, and business invitations:

- `https://wasteworx-api-development.zinjie7.workers.dev/confirm-email`
- `https://wasteworx-api-development.zinjie7.workers.dev/confirm-email?invitation=household`
- `https://wasteworx-api-development.zinjie7.workers.dev/confirm-email?invitation=business`

Add the same paths for each other environment that uses the project, including local development if needed. Keep the other existing redirect entries for password resets and earlier invitation links.

Under **Authentication → Email Templates → Confirm signup**, set the subject to **Confirm your WasteWorx email** and paste the [confirmation template](../supabase/templates/confirm-signup.html). The template uses Supabase's generated confirmation URL. A branded sender address requires custom SMTP in Supabase.

Test with a fresh email after saving the settings. If an earlier link has expired or points to localhost, open `/confirm-email` on the deployed site and request a fresh link.

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
