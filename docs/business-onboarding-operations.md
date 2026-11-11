# Business Onboarding Setup and Verification

## Implementation scope

Phase 1 adds a business directory, resumable drafts, multi-site capture, verification evidence references, review decisions, service activation, administrator invitations, access revocation and a basic business account landing page. Registration staff and super admins can both approve businesses and sites, as confirmed by the owner.

The landing page exists to complete onboarding and display authorised registration/site status. Scheduling, collection capture, weights and reports belong to later milestones. Evidence is captured as restricted references and notes; document uploads are not included in this initial workflow.

## Deployment status

Local code and database integration tests are available. Live deployment has not been completed. On 8 November 2026, the linked Supabase migration dry run failed with HTTP 403: the connected account lacked access to the database login-role endpoint. No migration was applied by that attempt, and invitation email delivery has not been verified live.

Use a Supabase account with appropriate permissions for the linked project. Do not share account tokens or database passwords in chat. Confirm the linked project matches the application's public Supabase URL before deploying.

## Deploy

From the repository root, after authenticating the CLI with an authorised account:

```sh
supabase db push --linked --dry-run --skip-vault
```

Review the pending migration list. The new migration is `20261108090000_add_business_onboarding.sql`. Earlier household migrations must already be present or be reviewed before applying them. Then apply the reviewed migrations:

```sh
supabase db push --linked --skip-vault
supabase functions deploy invite-business
```

Configure `INVITE_REDIRECT_URL` in the Edge Function environment to the application's password-update URL. For local web testing use `http://localhost:8081/update-password`; for production use the deployed web URL or supported native deep link. The default is `wasteworx://update-password`. Add the chosen URL to Supabase Auth's allowed redirects. Confirm the Email provider and outbound email delivery are configured. Do not put service credentials in client environment variables.

Deploy the database before releasing the updated application. Existing household accounts continue using their existing tables and roles.

## Staff workflow

1. Sign in as registration staff or a super admin. Open **Admin → Manage businesses → Register a business**.
2. Follow the staged registration: Business, Contact, Sites, Evidence and Review. Sites are edited one at a time. Back and completed-step navigation retain entered values; the review screen links directly to each section. Save an incomplete draft from any stage if necessary.
3. Submission requires name, industry, primary contact name/email/phone, registration number or exception explanation, evidence reference, and each site's name/address/city. Country codes use two uppercase letters.
4. Open the registration and enter a reason or evidence summary before recording any review decision.
5. Start review. Verify the business identity and review collection sites independently. Alternatively request corrections or reject the business with a reason.
6. If corrections are requested, edit and resubmit. Site verification is reset on save so changed information cannot retain a stale approval. Existing site identities and review history are retained.
7. Verify at least one site, activate that site, and activate the business. Other sites may remain pending and inactive.
8. Invite or link the primary administrator. New accounts receive an invitation; existing confirmed accounts are linked and keep their password. The UI explicitly distinguishes these outcomes; linking an existing account does not send an invitation email.
9. New invitees open the email, choose a password and continue to their business account. Confirmed memberships also activate safely on the next sign-in.
10. If access must end, enter a reason and use **Revoke business access**. Suspension disables business service status but preserves account visibility and history; staff must revoke access separately when required.

Approved or rejected registrations can be reopened for corrections with a reason. Reopening pauses business and site service; after editing, resubmit and repeat verification and activation. Existing memberships and history remain intact.

Failed invitations do not erase registrations. Retry after 60 seconds; the system allows at most ten attempts per membership in 24 hours. The invitation attempt history remains available to staff through the database. An email may have been sent even if membership completion fails; reload and inspect before retrying.

Registration number plus country and registered name plus country are unique when supplied. Site names and street-address/city combinations are unique within a business when nonblank. These conservative duplicate rules can require staff to resolve an existing record rather than create another. No cross-business email uniqueness is imposed.

## Automated checks

```sh
npm run test:businesses
npm run lint
npx tsc --noEmit
npx expo export --platform web
```

`test:businesses` applies every migration to an isolated in-memory PostgreSQL runtime using PGlite. It supplies a minimal Auth schema and tests real SQL functions, grants and row-level policies with registration staff, super admin, client, site contact and outsider identities. It does not contact the live project or send email.

Coverage includes create retries, duplicate rollback, correction review, independent site approval, activation gates, stale versions, invitation rate limits, service-only identity linking, private evidence, cross-business and site isolation, email confirmation and access revocation. This does not replace testing Supabase Auth, the deployed Edge Function and real invitation redirects together.

## Live acceptance walkthrough

Use designated test businesses and email addresses you control. Do not send test invitations to real clients.

- Register two businesses; add two sites to the first. Save and reload a draft before submission.
- Confirm missing submission fields are rejected and an existing registration cannot be duplicated.
- Request a correction, resubmit, verify the business and approve/activate only one site. Confirm the second remains pending.
- Confirm business activation is blocked until a verified site is active.
- Invite a new controlled email account and complete its email/password setup. Confirm access to the business account.
- Link an existing confirmed controlled account; verify its existing password still works.
- Sign in as a second business and attempt to access the first business/site IDs. Confirm data is denied, including evidence and review records.
- Revoke a membership and confirm database access ends. Refresh or sign in again to refresh client navigation.
- Confirm existing household sign-in, registration and invitation behaviour remains intact.

Release acceptance remains pending until the migration, function deployment and this live walkthrough are complete.
