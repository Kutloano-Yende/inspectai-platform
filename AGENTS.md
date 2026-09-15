# AGENTS.md — InspectAI Engineering Rules

InspectAI is an AI-assisted property inspection and condition-management platform.
**Landlord → Property → Unit → Tenancy → Tenant Invitation → Inspection → Evidence → AI-Assisted Condition Review → Landlord Review → Report → Maintenance/Decision.**

Read this before writing any code. The architecture of record is `docs/ARCHITECTURE.md`; API and AI contracts live in `docs/contracts/` and `packages/contracts`.

## Product principles (non-negotiable)

1. **Evidence comes before conclusions.** No finding, report or score exists without linked evidence.
2. **AI advises; humans decide.** AI output is always advisory, provenance-labelled, and never writes deposit/tenancy/legal/financial decisions. Those fields are writable only by an authenticated human principal via the review endpoints.
3. **Human approval required** for consequential decisions (deposit deductions, report publication).
4. **Property history persists** across tenants and inspections. Evidence and inspections are append-only; corrections add records, never overwrite.
5. **Tenant workflows are extremely simple.** Linear, camera-first, token-scoped, no accounts required, no jargon.
6. **Landlord workflows are professional and analytical.** Evidence-rich, calm, trustworthy.
7. **Do not build features just because they are possible.** If it is not in `docs/ARCHITECTURE.md` or `docs/contracts/`, raise it before building it.

## Engineering rules

- **Do not invent requirements.** Requirements come from the SRS/BRD and approved contracts. Ambiguity → ask/ADR, don't assume.
- **Inspect the repository before making architectural decisions.** Match existing patterns; do not introduce parallel ones.
- **Preserve existing functionality.** Regressions block merge.
- **No unnecessary dependencies.** A new dependency requires a short justification in the PR (ADR for major ones).
- **No duplicated components or business logic.** Business rules live only in `packages/domain` and are enforced in `apps/api`. Frontends import types from `packages/contracts`; they never re-implement rules.
- **Never hard-code business rules in the frontend.** State machines, mandatory checkpoints, authorization — all server-side.
- **Every API endpoint enforces authorization.** Auth guard + organization isolation + role/state permissions. An endpoint without authorization tests does not ship.
- **Tenant and property data remain isolated.** Every query resolves to an organization; cross-tenant access tests are mandatory. Tenants are scoped by invitation token only.
- **Major functionality requires automated tests** (unit for domain rules; integration incl. access-denied cases for endpoints; e2e for workflows).
- **Verify before claiming done.** Run the relevant suites. Report failures honestly; never mark complete without verification.
- **No unrelated refactoring.** Keep PRs scoped.

## Evidence rules (FR-007 guarantees)

- Live capture enforced client-side (UX), verified server-side (guarantee): freshness, GPS/timestamp/device metadata, sha256 duplicate detection, quality minimums.
- Uploads via pre-signed URLs to private storage; hashes verified on commit; originals immutable.
- Access only through authorization-checked, short-lived pre-signed GETs. No public URLs, ever.

## AI rules

- Providers sit behind the `ConditionAnalysisProvider` port; nothing else knows the vendor.
- Model outputs must pass schema validation (contracts) before persistence; reject and retry/degrade otherwise.
- Analyses run async in `apps/jobs`; inspection/report workflows must complete even if AI fails (graceful "manual review" degradation).
- Store provenance (provider, model, input hash). Render with explicit advisory framing.

## Design rules

Palette: Navy `#17324D`, Slate `#334E68`, Teal `#287D76`, Stone `#F5F4F1`, White, Sand `#E9E5DC`.
Use: strong typography, subtle borders/shadows, 8–12px radii, Lucide icons, real photography, evidence-rich layouts, status colours sparingly.
Ban: purple AI gradients, glow effects, robot imagery, glassmorphism, excessive rounding, decorative icons, giant stat dashboards.
Design tokens live once in `packages/ui`.

## Workflow

- Branch per feature; PRs describe scope and verification evidence (which suites ran, results).
- Inspection status machine: `DRAFT → INVITED → IN_PROGRESS → SUBMITTED → ANALYZING → UNDER_REVIEW → COMPLETED` (+ `CANCELLED`) — transitions validated in `packages/domain` only.
- Audit events for: auth, evidence commits, analyses, review decisions, report publication, deposit decisions. Append-only.
- Phasing per `docs/ARCHITECTURE.md` §13. No product code before contract sign-off; Phase 1 "done" = the vertical-slice e2e test passing.
