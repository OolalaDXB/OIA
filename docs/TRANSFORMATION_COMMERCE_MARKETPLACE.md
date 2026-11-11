# La Rose & le Glaive — commerce, academy & coach marketplace (product design, 2026-10-31)

**Status:** design specification. Not a launched storefront and **no real listings, coaches, stock, checkout, or fulfilment configured yet**. Personal transformation prototype in PR #3.

## North star

A premium, habit-forming *personal transformation platform* with four linked but legally/technically separated experiences:

1. **My Day (private)** — user-owned diary, photos, sleep, meals/intake, pain/recovery, location, personal calendar, goals, adherence and intentional morning brief.
2. **Programs / Academy (licensed content)** — 30-, 45-, and 90-day programs; self-paced lessons, live workshops, certificates of completion, community, quizzes, captions/transcripts, progress tracking.
3. **Coaches (two-sided services marketplace)** — independently verified practitioners; search, filter, select, availability, booking, cancellation/rescheduling, video links, session notes, packages, safe messaging, invoices, payouts.
4. **Shop (retail/curated partners)** — accessories/equipment, skincare/grooming, food supplements *only after market-specific clearance*, bundles, subscriptions, reviews, stock, order tracking, returns, VAT, shipping.

**Public-facing product must not inherit the professional OIA funding-console brand or its user database.** OIA can be the admin entry point to manage the incubation project. End-user identity and commerce tenancy separate. Private health data never exposed to vendors, coaches, advertisers, recommendation analytics, checkout or store staff by default.

## UX / conversion architecture

- Nav: **Aujourd'hui | Programme | Coachs | Academy | Boutique | Profil**
- Home: 2-minute check-in, recovery-aware intentions and morning plan. Noncommercial suggestions shown separately from **sponsored** or commercial inventory.
- Coach: compare qualification, language, discipline, location, timezone, verified licence, price, available slots, independent patient reviews, cancellation policy; request consultation; pay and book; reminders; human coach manages only what client explicitly shares.
- Academy: preview/free content, instructor bio, full syllabus, outcomes, prerequisites, live / on-demand formats, buy; completed workouts sync back to diary only with consent.
- Shop: evidence-grounded product detail; pictures, ingredients/contraindications and claims for supplements; bundles; transparent seller and returns; country restrictions; cart/checkout; logistics tracking.
- All storefront pages can render without revealing whether visitor is a member or any private data. Geo only used with affirmative user choice and can be manually overridden.

## Coach trust and marketplace operations

- Coach onboarding: identity, legal business status, relevant diplomas/qualifications, valid licence if legally required, professional liability insurance, availability, supported countries, payout profile, specialties.
- France: paid sports educator qualification / professional card, verify official public registry. No automatic claims that overseas credentials qualify in France.
- Practitioner category/titles scoped: distinguish certified fitness coach, physiotherapist, dietitian, dermatologist, mental health professional; avoid cross-specialty claims. Only licensed clinicians provide medical advice.
- Provider workspace: schedule, payout ledger, attendance, packages, refunds/disputes, content uploads, no read access to user diary or sensitive photos absent granular invitation.
- Trusted reviews: verified purchase/session; publication policy, moderation, right to reply; do not market reviews as independently certified unless verified through an actual provider.

## Purchase types and commerce domain

- **Physical item**: product, variation/SKU, inventory, price/currency/tax, market eligibility, seller, shipping rules, fulfilment, return/refund.
- **Supplement**: inherited physical plus mandatory regulatory evidence, batch/lot, expiry, registration/authorisation per jurisdiction, full ingredients and allergens, permitted claims, minimum age/risk information; medical promises forbidden. Restrict store by sales geography.
- **Digital course**: content entitlement after verified payment, DRM-light access controls, cancellation/withdrawal consent, access expiration, course progress.
- **Coach service**: coach profile, price, timezone-aware slots, booking hold, payment, asynchronous confirmation, video/meeting integration, cancel/no-show/reschedule/refund.
- **Membership**: recurring subscription and entitlement grants, cancellation, pause and non-deceptive renewal notices.
- Do not allow a user to buy a hypothetical listing. No hardcoded prices, fabricated reviews or fake professionals.

## Technical architecture: re-use rather than duplication

- Existing `OolalaDXB/CoachGari` repo: **code-level reusable patterns** for booking engine, calendar, Stripe Embedded Checkout, verified webhook-driven payment status, CRM, enquiry attachments and back-office. Inspect licences, schema, tenant isolation, security, and cross-origin CORS before porting. Never use CoachGari's live endpoint or keys for this product; do not entangle customer ledgers.
- New commerce backend: independent service/schema with account, coach/provider, verification, listing, inventory, calendar, cart, order, order lines, payment, provider settlement, invoice, returns/refunds, digital entitlements, course, lesson, progress, review, message.
- Every transition idempotent and logged; order marked paid only by verified payment webhook; appointment finalised only after race-safe availability lock and payment confirmation; explicit split-payout configurations per country.
- UAE Stripe Connect limitations: UAE platforms may require Custom UAE business accounts and certain charge types; verify current setup with Stripe before marketplace payments or cross-border coach payouts.
- Private health journal: separated tenant/datastore, owner-only access and private photo bucket, RLS / signed URLs, encryption where required, audit, retention/delete/export, guardian policy if children, never AI/ad training by default.
- Health/commerce boundaries: commercial recommendation engine uses user-confirmed preference **only**, not sensitive symptoms, medications, inferred diagnoses or clinical risk scores. Clear sponsored labels; no automatic personalized supplement prescriptions.
- PWA install / push: web push permission + notifications preferences; iOS/Android HealthKit/Health Connect require authorised native companion / bridge; Google Calendar OAuth with explicit scopes, event conflict resolutions, timezone handling.

## Initial product packaging — hypotheses to validate

- Free: check-in, routines, basic tracking, curated marketplace browsing.
- Plus: **€9–15/month** premium insights, adaptive plans and personal archive (pricing hypothesis, not established).
- Coaching: individual sessions / packs, **15–20% take rate** for a platform-mediated qualified coach (model assumption before PSP and customer-acquisition costs).
- Courses: individual purchase and/or membership, creator revenue share after fees.
- Physical items: supplier margin, curated affiliate fulfilment or owned inventory; **avoid inventory risk initially**.
- No cross-sell paywall preventing access to user's own health data or basic export/delete.

## Sequence and release gates

**Phase 0 (now → January 2027):** validate personal transformation through owner's daily use; build public storefront preview and recruit 3–5 qualified coaches + 2–3 course creators; discovery and supplier regulatory diligence. No supplement claims or checkout.

**Phase 1:** private beta coach booking and 1–2 original paid training programs with real service delivery; compliance and market-specific T&Cs, consumer withdrawal rights, tax, refunds.

**Phase 2:** simple physical goods marketplace via low-stock / affiliate / trusted fulfilment. Supplements only after product-level and market approvals; no medically unvalidated claims.

**Phase 3:** native health integrations, automatic nonintrusive planning, provider analytics, cohorts, upsells, loyalty and member referrals.

## Regulatory checkpoints

- UAE: licensed eCommerce and regulated product approvals; Emirates Drug Establishment handles marketing authorisations for categories of healthcare supplements. Match legal category and location before sale, no one-size-fits-all blanket certification.
- EU: food supplement composition/label and permitted health claims, consumer rights incl withdrawal for distance sales and conditional digital-content exception, tax/VAT and cross-border fulfilment.
- France: paid sports coaching subject to qualifications and declaration/card; require verification before public listing.

## Success metrics

- Daily active members / WAU, weekly adherence, morning check-in <2 minutes
- 7/30-day retention (not solely weight loss)
- Coach profile→book conversion; show rate; completed-session NPS; repeat purchase
- Academy intro→purchase→completion conversion; learning outcomes
- Shop conversion, net margin after logistics/returns, supplement compliance coverage
- Independent trust metrics: complaints, refund turnaround, incident reporting, coach certification up to date

## Unresolved decisions before production

1. **Public brand and company of record** (Oolala France SAS vs UAE entity; legal/merchant/insurance/tax implications).
2. **Initial market** (France, UAE, international) controls availability, payment, consumer and supplement compliance.
3. **Which qualified coaches/creators**, terms, payees, service geography, verification and scheduling.
4. **Supplier/fulfilment** model and product compliance documents.
5. **Privacy architecture** and separate domain/customer identity (OIA is internal back office, not a public marketplace brand).
