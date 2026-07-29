# OIA — Oolala Intelligence Agency

OIA is intended to become a modular operational-intelligence platform. Planned
(but **not yet authorized**) modules: Funding, Tenders, CRM, Data, Training,
Signals, Ventures.

**The only module currently authorized for implementation is `OIA Funding V0`.**

> OIA Funding must discover, verify, qualify and rank **actionable** funding
> opportunities for projects operated by Oolala and TheStudio MT.
> **BAWABA** is the first project profile used to validate the system.

## Status

This branch contains **architecture and planning artifacts only**. No
application code has been written. Implementation is gated on review and
approval of the documents in [`docs/architecture/`](docs/architecture/).

## Where to start

Read [`docs/architecture/README.md`](docs/architecture/README.md) — it is the
index for all ten requested deliverables.

## Non-negotiable product rule

The system must produce a shortlist of **real and currently actionable**
funding opportunities. For every opportunity it must separate:

- confirmed official fact
- extracted information
- inference
- recommendation
- unresolved uncertainty

and maintain four independent scores: **Relevance**, **Eligibility**,
**Win potential**, **Information confidence**.

No opportunity may be recommended as `PURSUE` without an accessible primary
source, a verified deadline, confirmation it remains open, an eligibility
assessment, an exact proposed next action, and sufficient source confidence.
