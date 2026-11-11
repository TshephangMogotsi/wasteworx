# WasteWorx Pilot Plan

## Overview

WasteWorx is the operational backbone of a household waste collection company. The company will collect recyclable waste from households, separate and measure it by material type, and transfer it to recycling companies.

The application will record the weight and value of each collection, track how much each household contributes, and award points. In future, households will be able to exchange these points for benefits such as airtime and vouchers.

WasteWorx is currently exploring a partnership with the Phakalane Home Owners Association (PHOA) as the first pilot community.

## 1. Pilot Objective

The initial goal is to prove that household waste can be collected, measured, rewarded, and transferred to recycling partners reliably and sustainably.

A practical pilot would involve approximately 50–100 Phakalane households over 8–12 weeks. It should answer the following questions:

- Will households separate their recyclable waste consistently?
- Can WasteWorx complete collections reliably?
- How much recyclable material does each household generate?
- What does collection cost per household and per kilogram?
- How much will recycling companies pay for each material?
- Do rewards improve household participation?
- Can every kilogram be traced from the household to the recycler?

## 2. System Users

### Household

- Registers a household account.
- Views upcoming collection dates.
- Views collection history, material weights, points, and rewards.
- Receives collection confirmations and reminders.
- Reports missed collections or other problems.
- Accesses guidance on separating and preparing recyclable material.

### Collector

- Views assigned households and daily collection routes.
- Identifies a household using a QR code or manual search.
- Records material type and weight.
- Flags contaminated or rejected material.
- Captures an optional supporting photo.
- Continues working offline and synchronizes data later.

### Administrator

- Manages households, staff, routes, schedules, materials, and rates.
- Reviews and corrects collection records.
- Manages the points ledger and reward redemptions.
- Records deliveries to recycling partners.
- Monitors operational, environmental, and financial performance.

### HOA Representative

- Views aggregated participation and environmental reports.
- Does not access unnecessary household-level personal information.

### Recycling Partner

During the pilot, recycler information can be managed by WasteWorx administrators. A dedicated recycler portal can be introduced later for confirming deliveries and publishing purchasing rates.

## 3. Collection Journey

1. WasteWorx registers a participating household.
2. The household receives labelled bags or bins and a QR-code sticker.
3. The household separates supported materials such as plastic, glass, cans, and paper.
4. A collector visits the household on the scheduled collection day.
5. The collector scans the household QR code or finds the household manually.
6. Each material category is weighed separately.
7. The collector records the net weight, contamination status, time, and an optional photo.
8. The system calculates the points earned.
9. The household receives a digital collection receipt.
10. WasteWorx consolidates the collected material and delivers it to a recycling company.
11. The recycler's accepted weight and payment are recorded.
12. WasteWorx reconciles household collection totals against recycler delivery totals.

Reconciliation is important because the weight collected from households and the weight accepted by recyclers may differ because of contamination, moisture, sorting losses, or measurement differences.
 do
## 4. Minimum Viable Product
11
### Household Experience

- Phone-number registration and one-time-password login.
- Household profile and address.
- Upcoming collection date.
- Collection history organised by material.
- Points balance and transaction history.
- Collection reminders and receipts.
- Missed-collection reporting.
- A simple waste-sorting guide.

For the earliest pilot, WasteWorx could use a mobile-friendly web application with SMS or WhatsApp notifications instead of immediately building a complete native household app.

### Collection Application

- Daily collection list or route.
- QR-code scanning.
- Manual household search as a backup.
- Material type and weight entry.
- Contamination and rejection recording.
- Optional scale-reading or bag photo.
- Offline collection capture and later synchronization.
- Collection confirmation and receipt generation.

The field workflow should be extremely fast: identify the household, select the material, enter the weight, and confirm.

### Administration Dashboard

- Household and staff management.
- Route and schedule management.
- Material category management.
- Versioned material-value and points rules.
- Collection corrections with an audit trail.
- Points adjustments with mandatory reasons.
- Recycler and delivery records.
- CSV or Excel exports.
- Pilot reporting.
- Alerts for unusual weights, duplicates, or incomplete records.

## 5. Points and Rewards

Points should be kept separate from money, even if the initial calculation is related to the value of the collected material.

A simple calculation could be:

```text
points earned = accepted weight in kilograms × material points rate
```

Illustrative rates could be:

| Material | Example rate |
|---|---:|
| Plastic | 10 points/kg |
| Aluminium cans | 25 points/kg |
| Glass | 3 points/kg |
| Paper and cardboard | 5 points/kg |

These figures are examples only. Actual rates should be based on recycler prices, collection costs, available sponsorship, and reward costs.

Rates must be configurable and versioned. If a material rate changes, past collections must retain the rate that applied when they were recorded.

### Points Ledger

The system should record every points movement as a permanent transaction, for example:

- Collection credit: `+120 points`
- Contamination correction: `-20 points`
- Airtime redemption: `-100 points`
- Promotional bonus: `+50 points`

WasteWorx should never store only a household's current points balance. The balance should be calculated from the transaction ledger so disputes and corrections can be investigated.

Before promising specific rewards, WasteWorx should calculate their actual cost. Redemption may be introduced after the pilot has established dependable recycling revenue or sponsorship funding.

## 6. Core Data Model

The system will need the following main records:

- Household
- Household member
- Address or property
- Collector
- Collection route
- Scheduled pickup
- Completed collection
- Collection item
- Material type
- Material rate
- Points transaction
- Reward
- Redemption
- Recycler
- Recycler delivery
- Delivery item
- Scale or weighing device
- Audit log

Each collection item should record:

- Household
- Material type
- Gross, container, and net weight
- Applied material and points rates
- Awarded points
- Contamination status
- Collector
- Date and time
- Location, where appropriate and consented to
- Supporting photo, if required
- Synchronization status
- Correction history

## 7. Product Rules to Define

WasteWorx and its partners should agree on the following rules before development and pilot launch:

- Are points awarded for weight collected at the household or weight accepted by the recycler?
- Who owns the recyclable material after collection?
- Which materials and cleanliness levels are accepted?
- How are shared houses, tenants, and property owners handled?
- What happens when materials are mixed or contaminated?
- Who may correct a completed collection, and how is that change audited?
- How are weight or points disputes resolved?
- Do unused points expire?
- Who funds rewards?
- What happens if recycler purchasing prices fall?
- What household information may the HOA access?

One option is to award provisional points when material is collected and confirm them after recycler reconciliation. A simpler pilot could award points immediately while allowing clearly explained ledger adjustments.

## 8. Pilot Operations

Before launching, WasteWorx should prepare:

- A written pilot agreement with the HOA.
- A household consent and privacy notice.
- A list of participating households.
- A defined collection area and schedule.
- An accepted-material and preparation guide.
- Bags, bins, labels, and household QR codes.
- Calibrated weighing scales.
- Collector training.
- A vehicle and temporary-storage plan.
- Agreements with a primary and backup recycling partner.
- Incident, complaint, and missed-pickup procedures.
- A weekly pilot report format.

The pilot should initially accept only three or four high-value, operationally manageable material categories. Additional categories can be introduced after the collection process is stable.

## 9. Pilot Measurements

WasteWorx should track the following every week:

- Registered households.
- Active households.
- Household participation rate.
- On-time collection rate.
- Kilograms collected by material.
- Kilograms collected per participating household.
- Contamination and rejection rate.
- Recycler-accepted weight.
- Difference between collected and accepted weight.
- Recycling revenue.
- Collection, sorting, and reward costs.
- Cost per household and per kilogram.
- Points issued and redeemed.
- Missed pickups and complaints.
- Repeat participation rate.

Environmental reporting may include an estimate of waste diverted from landfill, provided the calculation method is documented and estimates are labelled clearly.

## 10. Recommended Delivery Phases

### Phase 1: Discovery and Operating Design

Interview the HOA, 10–15 households, collectors, and recycling companies. Confirm collection methods, accepted materials, purchasing rates, storage arrangements, reward expectations, and reporting requirements.

### Phase 2: Pilot MVP

Build household registration, QR identification, collection capture, the points ledger, the administration dashboard, data exports, and basic notifications.

### Phase 3: Controlled Pilot

Begin with approximately 20 households for two weeks. Resolve operational and software problems before expanding to the full pilot group.

### Phase 4: Rewards

Introduce airtime or voucher redemption after collection records and the points ledger have proven reliable.

### Phase 5: Expansion

Add route optimisation, a recycler portal, automated scale integration, multiple communities, sponsorships, payments, and deeper analytics.

## 11. Suggested Technical Approach

A practical first version could use:

- Flutter or React Native for the collector application.
- A responsive web portal for households and administrators.
- PostgreSQL with a managed backend such as Supabase for data, authentication, and file storage.
- Offline-first collection records.
- QR codes for household identification.
- SMS or WhatsApp for reminders and receipts.
- Role-based access controls.
- An append-only points ledger.
- A detailed audit log.

## 12. Key Risks

- Reward costs exceed the value of recovered material.
- Households do not separate waste correctly.
- Recycler prices change unexpectedly.
- Collected and recycler-accepted weights do not reconcile.
- Collections become too expensive or unreliable.
- Poor connectivity prevents field data capture.
- Unauthorised changes are made to weights or points.
- Household information is shared more widely than necessary.

The most important early risk is promising points whose redemption cost exceeds the value of recovered materials. The pilot must validate both household participation and the underlying unit economics.

## 13. Immediate Next Steps

Before committing to the complete build, the founders should prepare four working documents:

1. A one-page pilot proposal for the Phakalane Home Owners Association.
2. A collection and material-handling procedure.
3. A points-and-rewards financial model.
4. An MVP product specification containing screens, user stories, and acceptance criteria.

The pilot should be considered successful if WasteWorx can demonstrate dependable household participation, accurate and traceable measurements, reliable recycler handoff, manageable collection costs, and a financially sustainable rewards model.
