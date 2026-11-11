# WasteWorx Business Client Requirements

Version: 0.1  
Date: 8 November 2026  
Status: Proposed implementation baseline for review  
Audience: WasteWorx product, operations and development teams

## 1 Purpose

Extend WasteWorx to serve businesses that generate recyclable waste. Staff must be able to register and verify a business, manage its collection sites, arrange pickups, record traceable material quantities and publish collection summaries. Business users must be able to access their own sites, schedules and collection data.

The existing gated-community household service remains supported. This document defines the business phase; it does not replace the household pilot plan or authorise implementation.

## 2 Confirmed operating requirements

- WasteWorx serves households in gated communities and business clients.
- Business collections may be recurring or requested on demand.
- WasteWorx weighs material at its facility. Clients may also weigh material where they have the capacity.
- A vehicle route may serve several businesses when quantities permit. Each client's material remains separate until weighing.
- Clients currently require collection summaries. The foundation must support later recycling certificates and environmental impact reporting.
- The next phase includes business registration, information for verification, collection data and scheduling.

Requirements below translate these decisions into proposed system behaviour. Verification evidence, approval rules and other unsettled policies are explicitly listed in section 13.

## 3 Scope

### First business release

Business registration and review; multiple collection sites; invitations and business memberships; a business portal; recurring schedules and on-demand requests; route stops and pickup records; facility receipt and weighing; verified collection history; CSV exports and downloadable monthly summaries.

### Foundation for later releases

Downstream destinations, material dispatch batches, links from original collections to combined batches, processing evidence and reproducible environmental calculations. These require a defined data model now; complete downstream workflows and report generation are later deliverables.

### Outside the first business release

Billing and payments, contracts automation, business rewards, route optimisation, automated scale integration, a recycler portal, full offline synchronisation, automated external business-registry checks, recycling certificates and environmental impact calculations. Notification channels beyond account invitation are undecided.

## 4 Users and permissions

The permissions below are a proposed access model. Exact mappings to existing application roles must be agreed before implementation.

| User | Intended access |
| --- | --- |
| WasteWorx administrator | Manage businesses, review verification, activate service, manage authorised staff, correct records and oversee reporting |
| Registration staff | Capture business and site information, request corrections and manage invitations within granted permissions |
| Operations staff | Manage schedules, requests, routes, pickups and facility receipts for assigned operations |
| Facility staff | Record and submit material measurements and receipt exceptions |
| Collector | View assigned route stops and necessary site contacts; record pickup outcomes |
| Business administrator | View authorised business sites, manage site contacts within the business, request pickups and view reports |
| Site contact | View and request collections for explicitly assigned sites |

Confirmed on 8 November 2026: registration staff and super admins may both approve businesses and sites and activate service. Final weight approval remains a separate decision for the collection phase. Client users cannot grant WasteWorx staff roles or verify their own business or measurements.

## 5 Registration and verification

### Business information

| Field group | Proposed information |
| --- | --- |
| Identity | Registered name, trading name if different, registration identifier where applicable, country, industry and business type |
| Main contact | Full name, position, email and phone |
| Evidence | Document or reference type, reference number, issuing body if applicable, restricted attachment, submission date |
| Service needs | Expected materials, estimated quantities and units, available containers and desired frequency |
| Acknowledgements | Applicable service terms or consent version, accepting person and timestamp, once the policy is agreed |

Required registration identifiers and supporting evidence depend on the business types accepted by WasteWorx. The system must support a documented exception where an approved business type does not have the usual registration identifier.

### Site information

Each business can have one or more sites. Capture site name or reference, physical address, country, optional coordinates, site contact, operating hours, preferred collection windows, access instructions and container arrangements. A site has its own verification status and service activation status.

### Functional requirements

- **REG-01** Staff can save an incomplete draft and resume it without creating an active service account.
- **REG-02** Submission validates the agreed mandatory fields and flags potential duplicate business identifiers and site records. Staff must resolve or explain a match rather than silently create duplicates.
- **REG-03** Business verification follows draft, submitted, under review, changes requested, verified or rejected states. Rejection and requests for changes require reasons.
- **REG-04** Verification records preserve reviewer, date, evidence references, decision and reason. Re-review preserves prior decisions.
- **REG-05** Site verification is separate from business verification. The system can represent a verified business with an unverified site.
- **REG-06** Service activation is separate from identity verification. Proposed rule: only verified businesses and verified, active sites can receive confirmed collections; exceptions require an agreed policy.
- **REG-07** Staff can suspend or deactivate service with a reason. Historical collection records remain accessible to authorised users. Effects on future pickups follow an explicit rule defined before release.
- **REG-08** Supporting documents are accessible only to authorised staff. Client-facing explanations do not expose internal review notes.

**Acceptance:** Staff register a business with two sites, request a correction, approve the corrected business and one site, and activate service for that site. The second site remains visibly pending and cannot silently become eligible for service.

## 6 Invitations and business portal

- **ACC-01** Reuse existing email/password authentication and recovery. Associate users through business and site memberships rather than email matching alone.
- **ACC-02** Authorised staff invite a business administrator. Invitation delivery failures can be retried without duplicating the business or membership.
- **ACC-03** Business administrators can manage site contacts within their own business, subject to agreed invitation rules. Account association must be verified before access is granted.
- **ACC-04** The portal displays business verification and service status, sites, upcoming collections, requests, collection history and reports. Empty, pending and error states must be explicit.
- **ACC-05** A user with multiple memberships can select an authorised business or site context. Every request is checked against current permissions.
- **ACC-06** Revoked memberships lose access without deleting operational history.

**Acceptance:** A business administrator sees both authorised sites; a site contact sees only their assigned site. Neither can access another business through navigation, changed URLs, API queries, attachments or exports.

## 7 Scheduling and on demand collections

- **SCH-01** Operations staff configure recurring schedules per site, including recurrence, start date, optional end date, preferred window, expected materials, quantities and instructions.
- **SCH-02** A recurrence creates distinct collection occurrences within a defined planning horizon. Re-running generation must not create duplicates.
- **SCH-03** Editing a schedule affects future eligible occurrences only. Completed collections and their original details remain unchanged.
- **SCH-04** Authorised clients request a pickup for a site, providing preferred date or window, materials, estimated quantities, containers and notes. Estimates are never presented as measured weights.
- **SCH-05** Requests move through submitted, under review, accepted, declined or cancelled states. Acceptance creates or links exactly one collection occurrence and provides its confirmed window.
- **SCH-06** Support rescheduling, cancellation and skipped recurring occurrences with actor, timestamp and reason. Client and staff views show the latest confirmed arrangement.
- **SCH-07** Store instants consistently and display collection windows in the site's local timezone, initially Africa/Gaborone. Preserve timezone information for future sites.
- **SCH-08** Collection source identifies recurring, on-demand or staff-created work. Planning includes estimated load without treating it as actual collected weight.

**Acceptance:** Generate a weekly schedule, skip one occurrence, reschedule another and accept an on-demand request. Both client and staff see the same resulting collections, with no duplicates and no changes to completed history.

## 8 Routes pickups and traceability

- **COL-01** A route records its date, assigned staff, optional vehicle, ordered stops and status. A route may serve multiple businesses.
- **COL-02** Each collection belongs to one business site and has a unique, human-readable reference. Route assignment can change without changing collection identity.
- **COL-03** Each bag, bin or identifiable group of containers is linked to its collection using a label or reference. Manual references are sufficient initially; QR labels are optional later.
- **COL-04** Pickup capture records actual timestamp, collector, container counts and types, declared materials, notes, optional photos and acknowledgement or reason it was unavailable.
- **COL-05** Record completed, partial, missed and cancelled pickup outcomes with reasons where applicable. An empty or missed stop must not create a positive material quantity.
- **COL-06** Keep pickup, facility receipt and measurement approval statuses separate. A completed pickup may have weights awaiting facility processing.
- **COL-07** Material remains identifiable by client until weighing. Missing labels, missing containers and damaged loads require a recorded exception and resolution before client attribution is approved.
- **COL-08** Evidence attachments retain collection linkage, uploader and timestamp, with access restricted to the relevant audience.

**Acceptance:** One route collects separately labelled material from three businesses. Facility staff identify and process each collection independently, and each client sees only its own results.

## 9 Receipt weighing and material records

- **WGT-01** Maintain a controlled material catalogue with categories and optional subcategories. Historic records retain a meaningful material identity after catalogue changes.
- **WGT-02** A collection supports multiple containers, material lines and measurements. A measurement records quantity, unit, material or unsorted load, stage, method, source party, location, timestamp and recorder.
- **WGT-03** Preserve client measurements separately from WasteWorx facility measurements. Identify estimates, measured quantities, submitted measurements and approved measurements explicitly.
- **WGT-04** Where gross and tare weights are used, retain both and calculate net weight. Reject negative quantities, tare greater than gross, missing units and incompatible units. Canonical mass reporting uses kilograms.
- **WGT-05** Facility receipt records arrival time, received containers, discrepancies, accepted material and rejected or contaminated material with reasons. Distinguish measured rejection weights from estimates.
- **WGT-06** An authorised reviewer approves reportable facility measurements. Proposed reporting basis: approved facility material weights; any alternative requires an explicit, visible basis.
- **WGT-07** Client and facility weights are observations at different stages, not additive quantities. Load weights and sorted material weights must not be counted twice. Flag discrepancies for review without inventing unmeasured losses.
- **WGT-08** Correcting an approved measurement requires permission and a reason, preserves its previous value and identifies affected report versions. Client users cannot overwrite facility measurements.
- **WGT-09** Retain scale or ticket references and supporting evidence where available. Never imply scale calibration was checked unless a calibration record exists.

**Acceptance:** A client records 120 kg and the facility records 114 kg. Both values remain available with provenance; the summary uses the approved basis and does not report 234 kg. Sorting into material lines does not add the load weight a second time.

## 10 Collection summaries and future evidence

### First release reporting

- **RPT-01** Filter collection history by authorised business, site, date range, material and status.
- **RPT-02** Show actual collection date, reference, site, pickup outcome, measurement status and accepted or rejected quantities where recorded.
- **RPT-03** Summarise approved material weights by site, material and month. Clearly distinguish collected, received and accepted weights. Missing weights appear as pending or unavailable, never as confirmed zero.
- **RPT-04** Publish CSV exports and a downloadable monthly summary with business, sites, reporting period, timezone, units, weight basis, generation timestamp and report version. Download format remains to be selected.
- **RPT-05** Report totals reconcile to included approved records. Corrections create a new report version and preserve the basis of previously issued reports.
- **RPT-06** Do not label collected or accepted material as confirmed recycled or landfill-diverted without an agreed evidence and calculation basis.

**Acceptance:** A monthly report across two sites reconciles to approved material lines, excludes cancelled work from weight totals, identifies pending measurements and respects the user's site permissions. Reissuing after a correction produces a distinguishable version.

### Future reporting foundation

- **FND-01** Model downstream processors or destinations, dispatch batches, material quantities, dispatch and receipt dates, treatment route and supporting evidence.
- **FND-02** Link contributions from original collections to combined batches. Track dispatch quantities, processing confirmation and residuals separately; do not assume all dispatched material was recycled.
- **FND-03** Record the method and quantities used to allocate combined-batch outcomes to clients. Allocations must not exceed available quantities or count the same contribution twice.
- **FND-04** Future certificates must state their scope and evidence basis. Mixing after weighing must not imply that material remained individually traceable through processing.
- **FND-05** Future impact calculations must retain input records, factor source and version, geography, units, assumptions, calculation version and generation date. Estimates must be labelled.

## 11 Logical data foundation

These are logical records, not a final database schema.

| Record | Principal relationships |
| --- | --- |
| Business | Has sites, contacts, memberships, verification reviews and service status |
| Site | Belongs to a business; has contacts, verification, service arrangements and timezone |
| Membership | Links an authenticated user to a business and optional site scope |
| Verification review | Links a business or site to evidence, reviewer, decision and history |
| Service arrangement and recurring schedule | Defines agreed collection needs and recurrence for a site |
| Collection request | Records client intent and links to a confirmed collection when accepted |
| Collection | Identifies one site pickup independently of route assignment |
| Route and stop | Groups collections into an assigned operational journey |
| Container or batch | Preserves a labelled collection's identity through facility weighing |
| Measurement and material line | Captures source observations, material quantities and approval history |
| Receipt and exception | Records facility arrival, discrepancies, rejection and resolution |
| Evidence attachment | Links files to records with audience and access controls |
| Report version | Preserves scope, included approved data and issued output |
| Downstream batch and allocation | Links future consolidated processing evidence to collection contributions |
| Audit event | Records actor, action, timestamp, reason and relevant changes |

Use shared collection and measurement concepts where appropriate for households and businesses. Business-specific registration and access must not force household records into business structures. The final schema must enforce valid ownership and prevent cross-client references.

## 12 Quality and release requirements

- **NFR-01 Security:** Enforce business and site access in database policies and server operations, including private file access and exports. Keep privileged credentials off clients.
- **NFR-02 Auditability:** Record verification decisions, service changes, membership changes, schedule changes and approved measurement corrections. Protect history against unauthorised modification.
- **NFR-03 Reliability:** Retried submissions, invitations, recurrence generation and pickup capture must not silently duplicate records. Failed writes must remain visibly failed or retryable.
- **NFR-04 Usability:** Client, admin and field screens must work on responsive web layouts with accessible labels, clear validation and loading, empty and failure states. Full offline synchronisation is deferred; never imply a failed save succeeded.
- **NFR-05 Privacy:** Limit collection and exposure of business contacts and supporting documents to operational needs. Retention, removal and evidence access policies must be agreed before launch.
- **NFR-06 Compatibility:** Preserve existing household authentication and registration. Review the Expo SDK 57 versioned documentation before application code changes, as required by AGENTS.md.
- **NFR-07 Operations:** Define backend availability, recovery, backups and monitoring appropriate to client use before launch; an inactivity-paused backend must not be mistaken for invalid credentials.
- **NFR-08 Validation:** Test the full business journey, multiple-business isolation, site restrictions, duplicate retries, date exceptions, weight reconciliation and correction history. Confirm report totals using known source records.

## 13 Decisions required before implementation

| Decision | Proposed starting position | Needed before |
| --- | --- | --- |
| Eligible businesses and verification evidence | Staff review identity, contact and collection location; support justified exceptions | Registration build |
| Mandatory fields and documents | Confirm by business type; avoid collecting documents without a verification purpose | Registration build |
| Who approves verification and weights | Business and site approval confirmed for registration staff and super admins; weight approval remains undecided | Weighing build |
| Activation and suspension rules | Verified business and site required for confirmed service; record handling of future bookings | Scheduling build |
| Material catalogue and units | Controlled categories; canonical kilograms with explicit estimates | Collection build |
| Reporting weight basis | Approved facility weights; client weights retained as separate observations | Weighing build |
| Client invitation and contact management | Staff invite initial business administrator; tightly scoped site contact management | Portal build |
| Scheduling policy | Confirm recurrence types, planning horizon, cutoffs, request response targets and client cancellation rights | Scheduling build |
| Report format and date basis | Monthly downloadable summary plus CSV; specify collection date versus receipt date | Reporting build |
| Evidence and retention policy | Restricted verification documents; explicit client-visible collection evidence | File capture build |
| Notifications | Choose channels, recipients and triggering events; in-app state remains authoritative | Operational launch |
| Backend operational plan | Agree availability and recovery expectations for business customers | Operational launch |

## 14 Delivery milestones

| Milestone | Deliverable | Exit condition |
| --- | --- | --- |
| 1 Business onboarding | Business and site capture, review, activation, access foundation and invitations | Staff can approve a business and activate one verified site; unauthorised access is denied |
| 2 Client portal | Business and site memberships, context selection and business overview | Invited users see only their authorised business and sites |
| 3 Scheduling | Recurring occurrences, on-demand requests and exceptions | Requests and schedules create consistent, non-duplicated confirmed work |
| 4 Collection operations | Routes, labelled material, pickups, facility receipts and approved weights | Multi-client route reconciles to separate client records with provenance |
| 5 Reporting | Collection history, monthly summaries, CSV and report versions | Published totals reconcile to approved data and corrections remain traceable |

No implementation dates or effort estimates are committed in this document. Before starting each milestone, resolve its listed policy decisions and convert its requirements and acceptance criteria into implementation tasks. The business release is ready when all five milestones pass acceptance checks and the operational launch decisions are resolved.
