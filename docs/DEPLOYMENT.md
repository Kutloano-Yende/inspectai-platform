# InspectAI Deployment Guide

**Status:** Stage 5 deployment configuration (landlord inspection vertical slice)  
**Last Updated:** 2026-09-27  

---

## Current Deployment: Web on Vercel, API on Render

This is the setup actually in use today (a preview/demo deployment, not the generic
self-hosted guide below). Social sign-in is not part of it.
([`railway.json`](../railway.json) at the repo root is an equivalent config for Railway
instead, kept because it was the first host tried — unused while Render is current.)

**Web** — `apps/web`, Vercel project `inspectai-web`, root directory `apps/web`.
Build config lives in [`apps/web/vercel.json`](../apps/web/vercel.json) (installs from the
workspace root, builds `@inspectai/ui` and `@inspectai/contracts` before `next build`, since
the web app imports both from `dist`).

**API** — `apps/api`, deployed separately on Render. Config is a Blueprint,
[`render.yaml`](../render.yaml) at the repo root: builds `@inspectai/contracts` →
`@inspectai/domain` → `@inspectai/storage` → `@inspectai/api` in dependency order, generates
the Prisma client, runs `prisma migrate deploy` before `node apps/api/dist/main.js` on every
deploy, and points Render's health check at `GET /api/v1/health` (added in
[`apps/api/src/health.controller.ts`](../apps/api/src/health.controller.ts) — `@Public()`, no
DB access, so a database outage doesn't also get the API process killed and restarted).
`DATABASE_URL` points at a free Supabase Postgres project, not Render's own — Render's free
Postgres plan deletes the database after its trial window with no free recovery path, so this
project uses Supabase's free tier instead, which pauses on inactivity rather than deleting (see
"Current Production Status" below). The Blueprint's `databases:` block for `inspectai-db` is
left in place but unreferenced — `DATABASE_URL` is `sync: false`, set manually in Render's
Environment tab.

**Jobs** — `apps/jobs` (the BullMQ analysis/report workers), also on Render, as a second
Blueprint service, `inspectai-jobs`. It has no real HTTP API — Render's free plan only exists
for Web Services (a Background Worker needs a paid instance), so this service is deployed as a
Web Service too and exposes a trivial `GET /health` purely to satisfy Render's health check
([`apps/jobs/src/main.ts`](../apps/jobs/src/main.ts)). It needs its own `REDIS_URL`, pointed at
the same Redis instance as the API (so the queue one side enqueues to is the one the other
consumes from) — a free [Upstash](https://upstash.com) Redis database works here; Render's own
free Key Value offering is explicitly in-memory-only and not meant for production, which would
risk silently dropping queued jobs on a restart.

**Why a Vercel rewrite, not a direct cross-domain call:** Vercel (`*.vercel.app`) and Render
(`*.onrender.com`) are different sites from a cookie's perspective, so a browser will not send
a `SameSite=Lax` cookie set by one to the other — auth would silently fail even with CORS
configured correctly. [`apps/web/next.config.js`](../apps/web/next.config.js) instead proxies
`/api/v1/*` on the Vercel domain to `API_ORIGIN` (the Render URL) server-side; the browser
only ever talks to its own origin, so the cookie stays first-party. This only works because
the API doesn't set a cookie `Domain` attribute.

Setup, once you have a Render account:

1. Render dashboard → New → Blueprint → connect the `Kutloano-Yende/inspectai-platform` repo.
   Render reads `render.yaml` and creates `inspectai-api`, `inspectai-jobs` (and an
   `inspectai-db` Postgres instance, currently unused — see below). `CORS_ORIGINS` and
   `WEB_APP_URL` are pre-filled from `render.yaml` — update them there (and redeploy) if the
   Vercel URL ever changes. Set `DATABASE_URL` manually on **both** services to the same
   Postgres connection string (this project uses a free Supabase project, not Render's own
   Postgres), and `REDIS_URL` manually on **both** services to the same Redis connection string
   (a free [Upstash](https://upstash.com) database — sign up, create a database, copy its
   `rediss://` connection string). Storage (`S3_*`) and social sign-in vars are optional — fill
   them in via the Environment tab if/when needed; see the tables below for what each does.
2. On Vercel (project → Settings → Environment Variables): set `API_ORIGIN` to the Render
   service's public URL (no trailing slash, no `/api/v1`) and `NEXT_PUBLIC_API_URL=/api/v1`
   (relative, so requests go through the proxy above, not straight to Render). Redeploy after
   changing either — both are read at build time.
3. Confirm: open the Vercel URL, sign up, and check the request in DevTools → Network goes to
   the Vercel origin's own `/api/v1/auth/register`, not `localhost` or the Render domain.

The generic guide below (self-hosted Nginx, S3/R2) still applies if/when this moves off
Vercel/Render.

---

## ⚠️ Current Production Status (as of 2026-11-20): Up, jobs/Redis pending setup

The API is live and has been exercised against real production data. The 2026-11-08 outage below
(database expiry + a Corepack crash) is resolved. What's open now: the `inspectai-jobs` Blueprint
service and its Redis wiring are defined in `render.yaml` but **not yet deployed** — clicking
"Start Analysis" in production hangs today, because `apps/api`'s queue producer has no
`REDIS_URL` and falls back to `redis://localhost:6379`, which doesn't exist on Render
(confirmed directly: the request never completes, and the inspection's status correctly stays
`SUBMITTED` rather than getting stuck half-transitioned, since the status update and the queue
write are one atomic transaction). Deploying `inspectai-jobs` and setting a real `REDIS_URL` on
both services closes this. There is also currently no backup/recovery path for the production
database.

**1. Database — migrated off Render's free Postgres to Supabase.**
Render's free Postgres plan expires 30 days after creation, with no free recovery path once it
does (Point-in-Time Recovery and Export are paid-plan-only). Rather than pay to keep the expired
`inspectai-db` alive, `DATABASE_URL` now points at a free Supabase Postgres project instead (set
manually in Render's Environment tab — `sync: false` in `render.yaml`, never committed). Supabase's
free tier pauses on inactivity rather than deleting, which is strictly better, but it still has
**no automated backups or Point-in-Time Recovery on the free tier** — there is currently no
recovery path if production data is ever lost again. The old `inspectai-db` Render resource is
left as-is (suspended/expired, unreferenced by the app) — deleting it is a manual, low-priority
cleanup step, not yet done.

**2. API — Corepack start-command crash fixed and deployed.**
The start command previously crashed with `Error: Cannot find matching keyid` (a Corepack
package-signature verification failure when `pnpm exec` re-resolved the `pnpm` binary at
container start). `render.yaml`'s `startCommand` now calls `node_modules/.bin/prisma` directly
instead, skipping that resolution entirely. Committed and deployed — `GET
https://inspectai-api.onrender.com/api/v1/health` returns `200 {"status":"ok"}` (expect a cold
start of 20–30s on Render's free tier if the instance has spun down).

**3. Evidence storage — real AWS S3, confirmed working.**
`S3_*` env vars are set in Render's Environment tab (manual, `sync: false`). A direct scripted
round trip (ticket → PUT → commit) against the live API confirmed a real object landing in
`s3.eu-north-1.amazonaws.com`, re-downloaded and re-hashed by the server before being accepted.

**What's actually been verified against production, and what hasn't** (full detail: the
production verification report from 2026-11-15):
- ✅ Landlord auth, property/unit/tenancy/invitation CRUD, tenant invitation acceptance, evidence
  upload ticket issuance and commit (mechanism proven; no evidence currently persists in
  production — the one test run was cleaned up and never carried through to submission).
- ❌ **Not yet run against production, only locally:** AI analysis, landlord review
  (accept/amend/reject), and PDF report generation — blocked on `inspectai-jobs` + Redis not
  being deployed yet (see above). This is the main gap before Phase 1 can be called genuinely
  done end-to-end in production.
- ⚠️ **Open risk:** `apps/jobs/scripts/demo-report.mjs` and `apps/jobs/scripts/reconstruct-demo-data.mjs`
  now both refuse to run unless `DATABASE_URL` resolves to `localhost`/`127.0.0.1` (added
  2026-11-20, after the first script was found to `TRUNCATE` every table with no such guard —
  exactly the kind of bug that caused an earlier local data-loss incident).

**In the meantime:** local development remains fully independent of Render/Vercel/Supabase —
Docker Compose's local Postgres, Redis, and MinIO, plus the three `pnpm dev` processes, are still
the day-to-day development environment.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Web Browser (HTTPS)                      │
└────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
   │  Web App  │    │  API Server │    │  Jobs Worker│
   │ (Next.js) │    │  (NestJS)   │    │ (Node+Bull) │
   └───────────┘    └─────────────┘    └─────────────┘
        │                   │                   │
        └───────────────────┼───────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼──────┐    ┌──────▼──────┐    ┌──────▼──────┐
   │PostgreSQL │    │    Redis    │    │S3 / R2      │
   │ Database  │    │   (BullMQ)  │    │ (Evidence & │
   │           │    │             │    │  Reports)   │
   └───────────┘    └─────────────┘    └─────────────┘
```

---

## Application Architecture

| Component | Technology | Purpose | Deployment |
|-----------|-----------|---------|------------|
| **Web** | Next.js 15 (App Router) | Landlord dashboard | SSR/Static export to CDN |
| **API** | NestJS + Express | REST endpoints, authorization | Node.js container |
| **Jobs** | Node.js + BullMQ | Async analysis, report generation | Node.js container |
| **Database** | PostgreSQL 16+ | Relational data (entities, evidence, audit) | Managed service or self-hosted |
| **Queue** | Redis 7+ | Async job queue (BullMQ) | Managed service or self-hosted |
| **Storage** | S3 or R2 | Private evidence & report files | Managed S3/R2 buckets |

---

## Environment Variables

### Required for All Applications

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `NODE_ENV` | ✅ | `production` | Set to `production` in staging/prod |
| `DATABASE_URL` | ✅ | `postgresql://user:pass@host:5432/db` | Prisma connection string |
| `REDIS_URL` | ✅ | `redis://host:6379` | BullMQ queue connection |

### API Server Only

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `PORT` | ✅ | `4000` | HTTP port for API |
| `S3_ENDPOINT` | ✅ | `https://s3.amazonaws.com` | S3 or S3-compatible |
| `S3_REGION` | ✅ | `us-east-1` | AWS region or R2 auto |
| `S3_ACCESS_KEY` | ✅ | `AKIA...` | AWS IAM access key |
| `S3_SECRET_KEY` | ✅ | `...` | AWS IAM secret key |
| `S3_EVIDENCE_BUCKET` | ✅ | `inspectai-evidence` | Private bucket for photos/video |
| `S3_REPORTS_BUCKET` | ✅ | `inspectai-reports` | Private bucket for PDFs |
| `CORS_ORIGINS` | ✅ | `https://app.example.com` | Comma-separated web app origin(s) allowed to call the API with cookies. Defaults to `localhost:3000`/`3001` if unset — **must** be set to the real domain in production, or sign-in and every other cookie-authenticated request fails with a CORS error. |
| `WEB_APP_URL` | ✅ | `https://app.example.com` | Where the API redirects back to after a social sign-in completes (or fails) |

### Web Application Only

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_API_URL` | ✅ | `https://api.example.com/api/v1` | Public API endpoint URL |

### Social Sign-In (optional — API Server Only)

Each provider's button on `/login` and `/signup` checks `GET /auth/providers` at runtime and stays a disabled "Coming soon" until all of that provider's variables below are set. None are required to deploy.

| Variable | Provider | Notes |
|----------|----------|-------|
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google | From Google Cloud Console > APIs & Services > Credentials > OAuth client ID (Web application). Free. |
| `APPLE_TEAM_ID`, `APPLE_SERVICES_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_REDIRECT_URI` | Apple | Requires a paid Apple Developer Program membership. `APPLE_PRIVATE_KEY` is the `.p8` key's contents with real newlines escaped as `\n` on one line. |
| `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI` | Microsoft | From Azure Portal > App registrations. Free. Account type must allow personal + org accounts if you want both. |

See `.env.example` for the full, commented list including where to obtain each value.

### Optional (Future Phases)

| Variable | Used When | Example | Notes |
|----------|-----------|---------|-------|
| `EMAIL_PROVIDER` | Phase 3+ | `postmark` | Email notifications |
| `EMAIL_API_KEY` | Phase 3+ | `...` | Provider API key |
| `LOG_LEVEL` | Logging | `info` | Verbosity (info/warn/error) |
| `SENTRY_DSN` | Error tracking | `https://...@sentry.io/...` | Optional crash reporting |

---

## Deployment Steps

### 1. Prerequisites

- [ ] PostgreSQL 16+ (managed or self-hosted)
- [ ] Redis 7+ (managed or self-hosted)
- [ ] AWS S3 or Cloudflare R2 account
- [ ] Domain name with HTTPS certificate
- [ ] Node.js 20+ runtime environment
- [ ] pnpm package manager

### 2. Database Setup

```bash
# 1. Create PostgreSQL database and user
CREATE DATABASE inspectai;
CREATE USER inspectai_user WITH PASSWORD '[SECURE_PASSWORD]';
GRANT ALL PRIVILEGES ON DATABASE inspectai TO inspectai_user;

# 2. Set DATABASE_URL environment variable
export DATABASE_URL=postgresql://inspectai_user:PASSWORD@host:5432/inspectai

# 3. Run Prisma migrations
cd /path/to/inspectai-platform-main
pnpm install
pnpm exec prisma migrate deploy

# 4. Verify schema
pnpm exec prisma studio  # Optional: inspect data via web UI
```

### 3. Object Storage Setup

**AWS S3:**
```bash
# 1. Create S3 buckets (private)
aws s3 mb s3://inspectai-evidence-[ORG]
aws s3 mb s3://inspectai-reports-[ORG]

# 2. Block public access
aws s3api put-bucket-public-access-block \
  --bucket inspectai-evidence-[ORG] \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Same for reports bucket

# 3. Create IAM user with bucket-specific permissions
# Policy: s3:GetObject, s3:PutObject, s3:GetObjectVersion on both buckets
# Set S3_ACCESS_KEY and S3_SECRET_KEY from IAM credentials
```

**Cloudflare R2 (alternative):**
```bash
# 1. Create R2 buckets via dashboard
# inspectai-evidence, inspectai-reports (both private)

# 2. Create API token with bucket permissions
# Set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY
# S3_ENDPOINT format: https://[ACCOUNT_ID].r2.cloudflarestorage.com
```

### 4. Build Artifacts

```bash
# From monorepo root
pnpm install --frozen-lockfile

# Build all applications
pnpm run build

# Verify builds succeeded
ls -la apps/api/dist/main.js       # API
ls -la apps/web/.next/             # Web
ls -la apps/jobs/dist/main.js      # Jobs
```

### 5. Start Services

#### API Server
```bash
# Set environment variables
export NODE_ENV=production
export DATABASE_URL=postgresql://...
export REDIS_URL=redis://...
export PORT=4000
export S3_ENDPOINT=https://...
export S3_REGION=us-east-1
export S3_ACCESS_KEY=...
export S3_SECRET_KEY=...
export S3_EVIDENCE_BUCKET=inspectai-evidence
export S3_REPORTS_BUCKET=inspectai-reports

# Start API
cd apps/api
npm run build  # if not already built
npm start

# Expected output:
# [Nest] ... - 09/16/2026, 11:00:00 PM     LOG [NestFactory] Nest application successfully started +2ms
# [Nest] ... - 09/16/2026, 11:00:00 PM     LOG [AppModule] API listening on port 4000 +1ms
```

#### Jobs Worker
```bash
# Set same environment variables as API

# Start jobs worker
cd apps/jobs
npm run build  # if not already built
npm start

# Expected output:
# [Nest] ... - 09/16/2026, 11:00:00 PM     LOG [NestFactory] Nest application successfully started +2ms
# [Nest] ... - 09/16/2026, 11:00:00 PM     LOG [JobsModule] Worker listening on Redis +1ms
```

#### Web Application
```bash
# Set environment variables
export NODE_ENV=production
export NEXT_PUBLIC_API_URL=https://api.example.com/api/v1

# Start web app
cd apps/web
npm run build  # if not already built
npm start

# Expected output:
# > Ready on http://localhost:3000
# Listens on port 3000 by default (configurable via PORT env var)
```

### 6. Nginx/Reverse Proxy (Example)

```nginx
# /etc/nginx/sites-available/inspectai

upstream api {
  server localhost:4000;
}

upstream web {
  server localhost:3000;
}

server {
  listen 443 ssl http2;
  server_name api.example.com;
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://api;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 443 ssl http2;
  server_name example.com;
  ssl_certificate /path/to/cert.pem;
  ssl_certificate_key /path/to/key.pem;

  location / {
    proxy_pass http://web;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# Redirect HTTP to HTTPS
server {
  listen 80;
  server_name example.com api.example.com;
  return 301 https://$server_name$request_uri;
}
```

---

## Verification Checklist

### Pre-Deployment

- [ ] Database migrations applied
- [ ] S3 buckets created and private
- [ ] IAM credentials configured
- [ ] Environment variables set (no hardcoded secrets)
- [ ] All applications build successfully
- [ ] No development dependencies in production bundles

### Post-Deployment

- [ ] API server responds to requests: `curl https://api.example.com/api/v1/...`
- [ ] Web app loads in browser: `https://example.com`
- [ ] Unauthenticated users redirected to /login
- [ ] Database connectivity working
- [ ] Redis connection working
- [ ] S3 storage accessible for evidence upload/download
- [ ] Presigned URLs work (60-second TTL)
- [ ] Jobs worker processing queue

### Production Monitoring

- [ ] All services have restart-on-failure configured
- [ ] Logs aggregated to centralized logging (optional)
- [ ] Error tracking configured (optional: Sentry)
- [ ] Health checks configured for load balancer
- [ ] Database backups enabled
- [ ] S3 backup retention policy set

---

## Database Migrations

```bash
# Apply pending migrations
pnpm exec prisma migrate deploy

# Create new migration (if schema changes after Phase 5)
pnpm exec prisma migrate dev --name migration_name

# Reset database (dev only, destroys data)
pnpm exec prisma migrate reset
```

---

## Rollback Procedure

```bash
# If deployment fails:

# 1. Revert environment variables to previous values
# 2. Restart services pointing to old images/binaries
# 3. Database: no rollback needed (migrations are applied, not reverted)
# 4. S3: files remain accessible if previous buckets still exist

# Manual rollback of schema (if needed):
pnpm exec prisma migrate resolve --rolled-back migration_name
```

---

## Scaling Considerations (Phase 5 baseline)

| Component | Baseline | Scaling |
|-----------|----------|---------|
| **API** | Single instance, Node.js | Load balancer + multiple instances |
| **Jobs** | Single worker, BullMQ on Redis | Multiple workers (one per CPU core) |
| **Database** | PostgreSQL single instance | Read replicas, connection pooling |
| **Cache** | Redis single instance | Redis cluster or managed Redis |
| **Storage** | S3/R2 | No scaling needed (object storage auto-scales) |

---

## Security Checklist

- [ ] Database credentials not in code (env vars only)
- [ ] S3 credentials not in code (IAM roles or env vars only)
- [ ] HTTP-only cookies enabled for auth
- [ ] TLS 1.2+ enforced
- [ ] CORS configured correctly (API origin checks)
- [ ] S3 buckets private (no public read/write)
- [ ] Presigned URLs time-limited (60 seconds)
- [ ] Audit logs stored in database
- [ ] No sensitive data in logs

---

## Known Limitations (Phase 5)

1. Email notifications not yet implemented (Phase 3)
2. Push notifications not yet implemented (Phase 5)
3. Offline capture sync not implemented (Phase 2)
4. MFA not implemented (Phase 2)
5. Admin console not implemented (Phase 3)

---

## Support & Troubleshooting

**API won't start:**
- Check DATABASE_URL is correct: `psql $DATABASE_URL -c "SELECT 1"`
- Check REDIS_URL is accessible: `redis-cli -u $REDIS_URL ping`
- Check S3 credentials: `aws s3 ls` (if using AWS CLI)

**Jobs not processing:**
- Verify Redis connection: `redis-cli -u $REDIS_URL`
- Check jobs logs for errors
- Verify S3 buckets exist

**Web app can't reach API:**
- Verify NEXT_PUBLIC_API_URL points to correct domain
- Check CORS settings on API
- Verify SSL certificates valid
- Test API directly: `curl https://api.example.com/api/v1/...`

---

## References

- ARCHITECTURE.md - Application design
- AGENTS.md - Engineering rules
- .env.production.example - Environment variables
