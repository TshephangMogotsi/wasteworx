# WasteWorx Context and Requirements Review Brief

Date: 8 November 2026  
Purpose: Give Claude the project background and conversation context needed to review the proposed business-client phase before implementation.

Subsequent update on 8 November 2026: the owner authorised Phase 1 implementation and confirmed that registration staff may approve businesses and sites alongside super admins. Business onboarding is now implemented locally, with live deployment blocked by the connected Supabase account's project privileges. The implementation snapshot below describes the earlier review baseline; consult [Business Onboarding Setup and Verification](business-onboarding-operations.md) and current source for the latest state.

## Review request

Please review [Business Client Requirements](business-client-requirements.md) against the context below. Assess whether the requirements provide a practical, trustworthy foundation for business onboarding, verification, collections and reporting. Identify gaps, contradictions, excessive scope and decisions that must be resolved before development.

This is a review request, not an instruction to implement or rewrite the application. Distinguish confirmed owner decisions from recommendations introduced during planning. Do not treat every proposed field, role or workflow as approved policy.

If you have repository access, validate relevant claims against the current source. If you receive only this file, request the requirements document as well; this brief summarises its intent but does not reproduce its full acceptance criteria.

## 1 What WasteWorx is

WasteWorx supports a recycling collection operation. The original product focused on households within a gated-community collection project. Residents separate recyclable waste, WasteWorx collects it, material is measured and transferred to recycling partners, and residents can track their contribution.

The household concept includes upcoming pickups, material weights, collection history, sorting guidance and EcoBucks rewards. Rewards redemption, such as airtime or vouchers, is a longer-term concept rather than a complete implemented service.

The earlier household pilot plan discusses a possible Phakalane Home Owners Association partnership in Gaborone, Botswana. Its household counts, pilot duration, commercial assumptions and operational proposals are planning ideas, not confirmed commitments in this conversation.

WasteWorx now also has business clients. These businesses generate waste, want recyclable material collected and need reporting. The owner wants the next development phase to serve these clients while retaining the household service.

## 2 Current application and implementation boundary

The repository is an Expo and React Native application supporting web and native targets. Its current package versions include Expo SDK 57, React Native 0.86.2, React 19.2.3, Expo Router, TypeScript, Supabase and SWR.

### Existing source implementation

- Email/password authentication, session restoration, sign-out and password recovery.
- Invitation acceptance and a password-update flow that activates eligible household memberships.
- Staff household registration, address capture, duplicate checks and account invitations.
- An admin dashboard querying registration and activation totals from Supabase.
- A searchable household directory and invitation management.
- SQL migrations for household records, addresses, memberships, roles, collector assignments, invitation attempts and audit logs.
- Database access policies, role checks and authenticated Edge Functions for registration and invitation delivery.
- A themed household interface with dashboard, activity, rewards and sorting-guide screens.

The resident dashboard, collection history and rewards currently use preview or hardcoded data. Their appearance must not be taken as evidence of operational collection tracking, a live points ledger or reward redemption.

The current role vocabulary is `super_admin`, `registration_staff`, `collector`, `household_member` and `hoa_viewer`. Dedicated business memberships, site-scoped business users and business workflows are proposed additions, not existing capabilities.

No business collection schema, scheduling engine, facility weighing workflow, downstream reconciliation or business reporting workflow has been established by this planning work. SQL migrations and Edge Function source show implementation intent; their presence does not prove they have all been deployed and tested against the current backend.

The README describes public self-registration as unavailable during the pilot. A sign-up source file remains in the repository, so review route guards and backend configuration before concluding self-registration is technically disabled everywhere.

### Recent operational context

The local web app was opened successfully. A login/reset connectivity issue was traced to the Supabase project being paused. The owner resumed it and confirmed the existing password worked. This was a backend availability issue, not evidence of an invalid password. Do not include personal login details or secrets in the review.

### Implementation constraint

`AGENTS.md` requires reading the exact versioned Expo documentation at https://docs.expo.dev/versions/v57.0.0/ before writing application code. The current task is document review. No application code was changed to implement this business phase.

## 3 What the owner confirmed in conversation

The following are confirmed product and operating facts, paraphrased from the owner's messages.

| Topic | Owner confirmation |
| --- | --- |
| Customer groups | Households in a gated-community collection project, plus business clients |
| Business need | Businesses generate waste, want it recycled and require reporting |
| Next-phase focus | Register businesses, capture information needed to verify them, show collection data and provide scheduling |
| Collection arrangements | Both scheduled collections and on-demand requests |
| Weighing | WasteWorx weighs at its own facility; clients may also weigh if capable |
| Shared routes | Multiple businesses can share a vehicle route when quantities permit |
| Separation | Each client's material remains separate until weighing |
| Current reporting demand | Collection summaries |
| Future reporting ambition | Recycling certificates and environmental impact reporting |
| Data priority | Understand and capture the right foundational data now to support those future reports |

The owner agreed to make a working plan and then requested a requirements document before implementation. The owner now wants an independent review. Agreement to planning is not approval of every implementation detail proposed by the assistant.

## 4 How the proposed plan developed

The planning discussion recommended building around businesses, their sites and verified collection records. A business may need multiple collection locations, each with its own contacts and service arrangements. Multi-site support was recommended as a foundation; the owner did not separately confirm the number or structure of current clients' branches.

The proposed operating chain is:

**Business → site → schedule or request → collection occurrence → route stop → labelled containers or batches → facility receipt → measurements → collection summary**

Client-provided and facility-provided measurements should be retained as separate observations. For example, a client's 120 kg measurement and WasteWorx's 114 kg measurement must not overwrite one another or be added together. An explicitly approved reporting basis should determine what appears in totals.

Materials can be consolidated after client-level weighing, but the original client contributions must remain recorded. Later processing evidence may concern a combined batch; client-level certificates will need a documented allocation method rather than an unsupported claim of individual physical traceability through processing.

The proposed first release has five milestones:

1. Business and site registration, verification, activation and invitations.
2. Business memberships and a client portal showing authorised businesses and sites.
3. Recurring scheduling, on-demand requests, confirmations and changes.
4. Routes, pickups, facility receipt, material capture and approved weights.
5. Collection history, monthly summaries, CSV exports and report versions.

The requirements ask for downstream evidence relationships to be designed now. Complete certificate generation, impact calculations and downstream operating screens are deferred. No dates or effort estimates have been agreed.

## 5 Proposed requirements requiring scrutiny

These are planning recommendations, not independently confirmed business policies:

- Staff-led initial business onboarding and invitations, extending the existing household approach.
- Registered and trading names, industry, registration identifiers, primary contacts and supporting verification evidence.
- Business and site verification as separate processes, with service activation separate from verification.
- Draft, submission, review, correction, verification and rejection states.
- Business administrator and site contact memberships, with site-scoped access.
- Distinct permissions for verification approval and weight approval.
- Controlled materials and canonical mass reporting in kilograms.
- Approved facility measurements as the default reporting basis.
- Labels or manual collection references initially, with QR codes optional later.
- Monthly summaries and CSV exports as the initial report products.
- Audit history, versioned report corrections and private evidence storage.
- Shared collection concepts for households and businesses, with distinct onboarding and permissions.

Business verification here means an operational review of identity, contacts and service locations. No specific legal due-diligence standard, regulator requirement or mandatory document set has been established. Do not invent one.

## 6 What remains undecided

- Which business types are accepted, including sole traders or organisations without standard registration identifiers.
- Required identity evidence, documents and minimum registration fields.
- Who can approve businesses, sites, service activation and reportable measurements.
- Whether to permit service exceptions before verification is complete.
- Rules for suspension and existing future bookings.
- Business-user invitation rights and site-contact management.
- Accepted materials, categories, containers and weighing precision.
- Treatment of client-only weights, measurement disputes, discrepancies and partial rejections.
- Schedule recurrence options, planning horizon, service cutoffs, cancellation rights and response targets.
- Whether reporting periods follow pickup dates, facility receipt dates or another explicit basis.
- Downloadable summary format and any client-specific report requirements.
- Evidence visibility, retention, deletion and personal-contact handling.
- Notification channels and triggering events.
- Backend availability, recovery and monitoring expectations for paying or operationally dependent clients.
- Future downstream allocation methods, certificate evidence standards and environmental calculation factors.

Commercial terms, billing, subscriptions, pricing, business rewards and launch dates have not been agreed. These should not be silently added to the first release.

## 7 Questions for Claude to review

1. Does the proposed model represent the confirmed operation accurately, particularly shared routes, separation until weighing and optional client measurements?
2. Is the first release appropriately scoped for the existing household-focused app? What can be deferred without weakening the data foundation?
3. Is business verification practical and proportional? What minimum decisions are needed before building registration?
4. Are business, site, contact and user membership concepts sufficiently distinct? Can a user belong to multiple customers without data leakage?
5. Should collection and weighing infrastructure be shared across customer types, and what migration risks need attention?
6. Are requests, recurring schedules, collection occurrences, route stops, receipts and measurements separated enough to handle rescheduling, retries and partial outcomes?
7. Are quantities unambiguous across pickup, facility receipt, sorting, rejection, dispatch and confirmed processing? Where could totals be double-counted or overstated?
8. Is the evidence foundation sufficient for later certificates and environmental reports without prematurely building those features?
9. Are access boundaries, attachment controls, audit history, measurement approval and corrections adequately specified?
10. Are the acceptance criteria testable? Identify missing operational exceptions and prioritise those likely to occur in the first release.
11. Which decisions block milestone 1, and which can safely wait until later milestones?

## 8 Requested review output

Please return:

- A short assessment of whether the requirements are ready to guide development.
- Findings ranked by severity, with the relevant requirement IDs or sections, a concrete failure scenario and a suggested correction.
- A clear separation between blocking issues, useful refinements and future enhancements.
- Any assumptions in the requirements that should be confirmed with the owner.
- A recommended first implementation slice and its acceptance criteria.
- The smallest set of owner questions needed before starting that slice.

Avoid proposing a complete rewrite or adding enterprise features without tying them to a concrete operating need. Where the repository and planning documents disagree, identify the conflict rather than assume either is authoritative on current behaviour.

## 9 Repository reading guide

| File or directory | Why it matters |
| --- | --- |
| [Business requirements](business-client-requirements.md) | Main document to review; requirement IDs, acceptance criteria and milestones |
| [Original pilot plan](wasteworx-pilot-plan.md) | Earlier household vision; contains proposals that differ from the implemented stack and authentication |
| [README](../README.md) | Current setup, routes and documented implementation boundary |
| [Package manifest](../package.json) | Current dependencies and run scripts |
| [Repository instructions](../AGENTS.md) | Expo documentation requirement before coding |
| `src/app/(app)/` | Household screens and use of preview data |
| `src/data/dashboard-preview.ts` | Demonstration collection, pickup and rewards data |
| `src/app/admin/` | Household registration, directory and dashboard |
| `src/app/_layout.tsx` and `src/app/(auth)/` | Route access and authentication behaviour |
| `src/features/auth/` | Session handling, application roles and authentication UI |
| `src/lib/supabase.ts` and `src/lib/supabase.web.ts` | Platform-specific backend clients |
| `supabase/migrations/` | Household schema, access policies and server-side registration/invitation rules |
| `supabase/functions/` | Authenticated household registration and invitation delivery |

Do not request or reproduce `.env.local`, private credentials or customer data. Architecture and requirements review should use source code and configuration templates without exposing secrets.
