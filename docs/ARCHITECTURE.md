# InspectAI — Technology & Product Architecture

Status: **Draft for review.** No production code is written until this document is reviewed and approved.
Sources: InspectAI SRS v1.0 (28 July 2026), BRD v1.0, Product Vision, Lean/Value Proposition canvases.
Workspace state at time of writing: empty (greenfield — no existing code to preserve).

---

## 1. Recommended Technology Architecture

The SRS (§9) sketches React / React Native / Laravel / OpenAI Vision / PostgreSQL / S3. We keep the
spirit of that sketch but recommend **one language (TypeScript) across all tiers** so that domain
types, authorization rules and API contracts are defined once and shared between backend, web and
mobile. This directly serves the "never hard-code business rules in the frontend" and "every
endpoint enforces authorization" rules.

| Tier | Choice | Rationale |
|---|---|---|
| Monorepo | **pnpm workspaces + Turborepo** | Single source of truth for shared domain types & contracts |
| Web app (landlord/PM/admin) | **Next.js (App Router) + TypeScript + Tailwind CSS** | Professional dashboard UX, SSR, design system |
| Tenant capture experience | **React Native (Expo)** app — initially also serves as the tenant web flow via Expo Web where practical | Camera, GPS, live-capture enforcement (FR-007) are native concerns |
| API | **NestJS (TypeScript)** — modular REST | Explicit modules per domain, guards for authorization, DI-friendly testing |
| ORM / DB | **PostgreSQL + Prisma** | Relational integrity for property/tenancy/inspection history; Prisma schema is the domain contract |
| Object storage | **S3 (or compatible: Cloudflare R2)** with private buckets + pre-signed upload URLs | Evidence files never pass through the API server |
| Queue / jobs | **BullMQ on Redis** | AI analysis, report rendering, notifications are asynchronous |
| AI layer | Provider-agnostic vision-analysis service behind one internal interface (OpenAI Vision first; Rekognition optional later) | AI is a subsystem, not the architecture |
| Auth | **Better-Auth (or Auth.js) + JWT/session cookies; MFA per FR-002** | Landlord accounts: email + OAuth. Tenants: invitation tokens — no account required to start |
| Notifications | Email (Postmark/SES) first; push via Expo/FCM later; SMS/WhatsApp deferred | Per SRS future-integration stance |
| Reports | Server-rendered PDF (React-PDF or Puppeteer) from stored evidence and findings | Reports are records, not live views |
| Hosting | AWS (per SRS) — ECS/RDS/S3/CloudFront; or Fly.io/Render for beta | Keep vendor-agnostic until Phase 5 |

**Deviation from SRS §9:** NestJS instead of Laravel. Reason: shared TypeScript domain/contract
packages eliminate an entire class of frontend/backend drift in a product whose core value is
contractual evidence. If the team is strongly Laravel-oriented, the architecture below still holds —
only §6/§11 change mechanically. **This is a review decision.**

Non-negotiables regardless of stack: PostgreSQL, private object storage with pre-signed URLs,
async AI queue, append-only audit log, server-enforced authorization.

---

## 2. Repository Structure

Monorepo (single repo until team size forces otherwise):

```
inspectai/
├── AGENTS.md
├── docs/
│   ├── ARCHITECTURE.md          # this document
│   ├── CONVENTIONS.md           # code, naming, migration, review rules
│   ├── contracts/               # API + AI contract specs (source of truth)
│   └── decisions/               # lightweight ADRs
├── packages/
│   ├── domain/                  # @inspectai/domain — entities, enums, state machines, business rules
│   ├── contracts/               # @inspectai/contracts — API DTOs, zod schemas, shared types
│   └── ui/                      # @inspectai/ui — design system (tokens, primitives, patterns)
├── apps/
│   ├── api/                     # NestJS REST API (modules mirror the domain)
│   ├── web/                     # Next.js landlord/PM dashboard
│   ├── mobile/                  # Expo tenant/inspector capture app
│   └── jobs/                    # workers: AI analysis, reports, notifications
├── prisma/                      # schema + migrations
└── tests/
    ├── e2e/                     # API-level end-to-end (vertical slice lives here)
    └── fixtures/
```

Rules: `apps/*` may depend on `packages/*`, never on each other. Business rules live only in
`packages/domain` and are enforced in `apps/api`. The frontend imports types from
`packages/contracts` only — it never re-implements rules.

---

## 3. Domain Model — bounded contexts

1. **Identity & Access** — users, sessions, MFA, roles, organization membership.
2. **Portfolio** — landlords/organizations, properties, units, documents, history.
3. **Tenancy** — tenancies, tenants, invitations, lease dates.
4. **Inspection** — templates, rooms, checkpoints, inspections, evidence (photos/video/metadata).
5. **Condition Review (AI-assisted)** — findings, comparisons, condition scores, *advisory* recommendations.
6. **Decision & Reporting** — landlord review, report generation, deposit decision record, maintenance decision.
7. **Maintenance** (post-V1 slice) — jobs, contractors, quotes, completion evidence.
8. **Platform** — notifications, audit log, subscriptions/billing.

Each context is a NestJS module with its own service layer; cross-context access via services, never
by reaching into another module's tables directly.

---

## 4. Core Entities & Relationships

```
Organization 1─* User (roles: OWNER, LANDLORD, PROPERTY_MANAGER, ADMIN)
Organization 1─* Property 1─* Unit
Unit 1─* Tenancy *─1 Tenant (User or invitation-derived person)
Tenancy 1─* Invitation (token, expiry, status: PENDING/ACCEPTED/EXPIRED/REVOKED)
Tenancy 1─* Inspection (type: MOVE_IN / MOVE_OUT / ROUTINE; status state machine)
InspectionTemplate 1─* Room 1─* Checkpoint   (template versioned; snapshot copied onto Inspection)
Inspection 1─* RoomCapture 1─* CheckpointCapture
CheckpointCapture 1─* Evidence (photo/video; kind, storage key, sha256, captured_at, gps, device meta, verified flags)
Inspection 1─* AIAnalysis (provider, model, input set hash, status, started/completed)
AIAnalysis 1─* Finding (checkpoint scope, category, severity, confidence, observation text, evidence refs)
AIAnalysis 1─* Comparison (pairs this inspection's evidence vs a prior inspection's)
AIAnalysis 1─* ConditionScore (0–100, per room & overall, with component breakdown)
Finding *─*? Recommendation (advisory: action, effort, indicative cost range, confidence)
Inspection 1─* Review (landlord decisions: ACCEPT_FINDING / REJECT_FINDING / AMEND; notes; who/when)
Inspection 1─1 Report (versioned, immutable once published; PDF artifact)
Tenancy 1─1 DepositRecord → Decision (APPROVE_FULL / DEDUCT / DISPUTE — human-only, never AI)
Property 1─* AuditEvent (append-only: actor, action, entity, before/after, timestamp)
```

Key invariants (enforced in `packages/domain`, never in the frontend):

- Every Property belongs to an Organization; every child entity resolves up to exactly one Organization.
- Inspection status machine: `DRAFT → INVITED → IN_PROGRESS → SUBMITTED → ANALYZING → UNDER_REVIEW → COMPLETED` (+ `CANCELLED`). Transitions validated server-side.
- An Inspection may only be submitted when all mandatory checkpoints have compliant evidence.
- Evidence is immutable once the inspection is SUBMITTED; corrections append, never overwrite.
- AI outputs (Finding/Recommendation/Score) are always labelled advisory and carry the model/provider provenance.
- Deposit decisions require an authenticated human principal with LANDLORD/PM authority; the audit event records the actor.

---

## 5. Authentication & Authorization Model

**Identities**

- **Landlord / PM / Admin:** full accounts (email+password, OAuth per FR-001, MFA per FR-002), session cookies on web.
- **Tenants:** may exist without an account. They act through **scoped invitation tokens** (signed, single-tenancy, single-inspection scope, expiring). Accepting an invitation can create a lightweight account, but the move-out flow must work token-only (tenant simplicity principle).
- **Inspectors/Contractors:** accounts with narrow scopes (post-V1).

**Authorization — three layers, all server-side**

1. **Authentication guard** — who is the principal (user or invitation token)?
2. **Organization isolation guard** — every resource read/write resolves to an `organizationId` and must match the principal's membership. This is the data-isolation boundary; implemented once, in a shared guard/middleware, not per-handler ad hoc.
3. **Role + state permissions** — role (OWNER/LANDLORD/PM) × entity state (e.g. only the invited tenant's token can submit *their* inspection; only landlords can publish reports or make deposit decisions).

Tenants see only the inspections they were invited to, scoped by token — never a portfolio view.
Every authorization decision emits an audit event. Tests must include cross-tenant access attempts as first-class cases.

---

## 6. API Architecture

REST (per SRS §14), JSON, versioned under `/api/v1`.

- **Contract-first:** DTOs defined once in `packages/contracts` (zod schemas + inferred types); NestJS validates inbound with the same schemas; web/mobile import the types. OpenAPI generated from the contracts.
- **Shape:** resource-oriented endpoints per bounded context: `/auth`, `/properties`, `/properties/:id/units`, `/tenancies`, `/tenancies/:id/invitations`, `/invitations/:token` (public, scoped), `/inspections`, `/inspections/:id/evidence` (pre-signed upload flow), `/inspections/:id/analysis`, `/inspections/:id/review`, `/inspections/:id/report`, `/maintenance` (later).
- **AI is not an API of its own for clients** — clients trigger/request analysis state; AI runs as an internal job. Findings are read via the inspection resource.
- **Errors:** RFC 7807 problem+json, consistent error codes in contracts.
- **Idempotency** on evidence upload completion and submission (client-generated keys).
- **Pagination, filtering, sorting** conventions documented once in contracts.

---

## 7. Media / Evidence Architecture

Trust in evidence is the product. Therefore:

1. **Live-capture enforcement (FR-007):** mobile client captures via camera API only (no gallery picker by default), records EXIF, GPS, timestamp, device metadata, and a capture nonce from the server. The server validates: freshness window, duplicate hash (sha256 per evidence + per inspection), dimensions/quality minimums. Client behaviour is UX; **server verification is the guarantee.**
2. **Upload flow:** API issues a **pre-signed S3 PUT** bound to a key `org/{orgId}/inspection/{inspectionId}/{checkpointId}/{uuid}` and expected content-type/size (≤25 MB images, ≤500 MB video per SRS §8; video compressed client-side). Client uploads directly to storage, then commits evidence with the hash + metadata; server verifies object exists and matches hash before accepting.
3. **Immutability & provenance:** evidence rows are append-only after submission; original file is never modified. Derivatives (thumbnails, normalized JPEGs for AI) are separate objects referencing the original.
4. **Access:** all buckets private; downloads via short-lived pre-signed GETs issued only through authorization-checked endpoints. No public URLs, ever.
5. **Retention:** per property history principle and BRD business rules — evidence outlives tenancies; deletion is an org-level legal-hold-aware operation, not a per-row delete.
6. **Offline mode (SRS §8):** mobile queues captures locally with signed metadata and syncs on reconnect; server re-validates capture times against the signed nonce window.

---

## 8. AI Architecture

Positioning: **an advisory analysis subsystem**, clearly bounded.

- **Interface:** one internal `ConditionAnalysisProvider` port in `apps/jobs`. Providers (OpenAI Vision first) implement it. Swap/adding providers (e.g. Rekognition for pre-filtering) touches nothing else.
- **Pipeline (async, queue-driven, target <60s per SRS):**
  1. Trigger: inspection SUBMITTED.
  2. Pre-flight: image quality assessment, duplicate detection, missing-angle detection (per SRS §11) — these are deterministic checks where possible, model-assisted otherwise.
  3. Per-checkpoint vision analysis → structured Findings (category, severity, confidence, evidence refs).
  4. Comparison pass: pair against prior inspection evidence (move-in vs move-out etc.) → change highlights.
  5. Synthesis: room + overall ConditionScore, inspection summary, advisory Recommendations (action, effort, indicative cost *range* only).
- **Structured output contract:** the model must return a schema-validated payload (defined in `packages/contracts`); anything non-conforming is rejected and retried/fallback-flagged, never surfaced raw to users.
- **Human-in-the-loop guarantees (product principles):** every AI output is stored with provenance (provider, model version, input set hash) and rendered with explicit "AI observation — advisory" framing. Findings become report content only through landlord Review acceptance. The deposit decision field is *structurally inaccessible* to the AI pipeline — it is written only by the review endpoint from an authenticated human principal.
- **Cost/abuse control:** analysis jobs are budgeted per inspection; failures degrade gracefully ("analysis unavailable — manual review") rather than blocking the workflow.
- No AI feature may be a hard dependency for completing an inspection or generating a report.

---

## 9. Security & Privacy Architecture

- TLS everywhere; sensitive fields encrypted at rest (application-layer encryption for tenant PII such as phone/email where feasible; RDS volume encryption for the rest).
- RBAC + organization isolation as per §5; authorization tests mandatory per endpoint.
- Append-only **audit log** (separate table, no update/delete path in code) for: auth events, evidence commits, AI analyses, review decisions, report publication, deposit decisions — actor, action, entity, timestamp, request id (BRD: complete audit trail is an acceptance criterion).
- Invitation tokens: signed, single-purpose, expiring, revocable; rate-limited.
- Evidence access only via authorization-checked short-lived pre-signed GETs.
- Input validation everywhere via shared zod contracts; upload constraints enforced server-side.
- Secret management via environment/secret store; no secrets in repo.
- POPIA (South Africa) alignment: data minimization for tenants, retention policy, deletion/export on request — tracked as a Phase-4 compliance task.
- Suspicious-login detection deferred to Phase 5+ (per SRS, listed but not core to V1 slice).

---

## 10. Testing Strategy

| Level | Scope | Tooling | Gate |
|---|---|---|---|
| Unit | Domain rules, state machines, guards, AI output validation | Vitest / Jest | Every domain rule has tests; PRs must pass |
| Contract | zod schemas round-trip, OpenAPI drift | Vitest | CI |
| Integration (API) | Module endpoints with real Postgres (testcontainers), incl. **cross-org access-denied cases** | Supertest | Every endpoint has auth + happy + failure path |
| E2E (vertical slice) | Full workflow from `tests/e2e` (see §14) | Playwright (API-level first, UI later) | The slice test is the definition of "done" for each phase |
| AI pipeline | Golden-set fixtures: staged evidence → expected finding shapes; deterministic stub provider for CI, real provider in nightly | Vitest + fixture corpus | Findings always schema-valid; no test asserts specific model opinions |
| Frontend | Component/design-system tests, minimal; workflow tests via Playwright | Vitest/RTL + Playwright | Smoke-level |

Rule: no major functionality is merged without its automated test; verification before "complete" is an AGENTS.md obligation.

---

## 11. Frontend Architecture

**Two products, one design system (`packages/ui`):**

- **Web (landlord/PM):** Next.js App Router — server components for data-heavy evidence views, client components for interactive review. Professional, analytical, evidence-rich: side-by-side photo comparisons, finding lists with severity/confidence, review actions, audit timeline. Calm hierarchy; typography-led; navy/slate/teal/stone palette; 8–12px radii; subtle borders; Lucide icons; real photography in marketing/onboarding surfaces. No glassmorphism, no AI-glow, no giant stat cards.
- **Mobile (tenant):** Expo — the guided inspection is a linear, one-thing-at-a-time flow: room → checkpoint → capture → confirm. Camera-first UI, large targets, progress indicator, offline queue indicator. No dashboard, no jargon; tenant sees only their current task.

State & data: typed client generated from contracts; server state via React Query; forms via react-hook-form + zod resolvers (schemas imported, not rewritten). Status colours used sparingly and consistently via design tokens defined once in `packages/ui`.

---

## 12. Agent Responsibilities

For future coding agents (and humans) working in this repo:

| Agent/Area | Owns | Must |
|---|---|---|
| **Architecture agent** | docs/, ADRs, contracts review | Keep this document current; reject scope creep |
| **Domain agent** | packages/domain | Implement rules/invariants + unit tests; no framework imports |
| **API agent** | apps/api | Wire contracts → endpoints; guards on every route; integration tests |
| **Evidence agent** | evidence pipeline + storage | Server-side verification; never weaken FR-007 guarantees |
| **AI agent** | apps/jobs analysis pipeline | Provider behind port; schema-validated outputs; advisory framing; never touch decisions |
| **Web agent** | apps/web + packages/ui | Design-system compliance; no business rules in components |
| **Mobile agent** | apps/mobile | Camera-first capture UX; offline queue; token-scoped flows |
| **QA agent** | tests/e2e | Owns the vertical-slice suite; verifies before any "done" claim |

All agents: read AGENTS.md first; no unrelated refactoring; no new dependencies without an ADR; no endpoint without authorization tests.

---

## 13. Development Phases

- **Phase 0 (this document):** architecture + contracts + AGENTS.md — review gate. **No product code before sign-off.**
- **Phase 1:** Vertical slice (§14) with stub AI provider. Landlord property/tenancy, invitation, tenant capture (mobile or web-camera fallback), evidence storage, analysis job, review, PDF report. E2E green.
- **Phase 2:** Harden the slice: real AI provider, comparison pass (move-in vs move-out), condition scores, offline capture sync, MFA, audit completeness.
- **Phase 3:** Portfolio depth: templates, routine inspections, property history views, reports catalogue, notifications (email), admin console.
- **Phase 4:** Deposit decision workflow record, maintenance module, contractor role, POPIA compliance pass.
- **Phase 5:** Beta hardening: payments/subscriptions, monitoring, load testing, suspicious-login detection, push/SMS.

---

## 14. First Vertical Slice (acceptance-tested end-to-end)

```
1. Landlord registers organization + property (+unit)
2. Landlord creates tenancy on the unit
3. Landlord invites tenant  → invitation token issued, email queued
4. Tenant opens invitation (token-scoped) → accepts
5. Landlord/tenant triggers MOVE_OUT inspection → tenant enters guided flow
6. Tenant captures evidence per checkpoint (live capture, GPS/timestamp metadata)
7. Evidence uploaded via pre-signed URLs → hash-verified → stored immutable
8. Tenant submits (all mandatory checkpoints satisfied — enforced server-side)
9. Analysis job runs (stub provider in CI, real provider optional) → schema-valid findings, advisory only
10. Landlord notified; opens review → accepts/amends/rejects findings
11. Report generated (PDF) and published → immutable, versioned
12. Audit log shows every step with actor + timestamp
```

**Definition of done for Phase 1:** the e2e test in `tests/e2e` executes steps 1–12 against a real Postgres and object storage, including at least: a cross-organization access denial, an invalid/expired invitation rejection, and a submission blocked for missing mandatory evidence.

---

## Open review decisions (blocking Phase 1)

1. NestJS vs Laravel for the API (§1 deviation).
2. Tenant capture surface for Phase 1: Expo app, or web-camera flow first (faster slice, weaker live-capture guarantees), or both.
3. Object storage vendor: S3 vs R2 (cost, egress).
4. AI provider for Phase 2 (OpenAI Vision assumed; confirm budget/region — data residency for SA).
