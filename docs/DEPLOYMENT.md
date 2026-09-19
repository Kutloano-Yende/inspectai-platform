# InspectAI Deployment Guide

**Status:** Stage 5 deployment configuration (landlord inspection vertical slice)  
**Last Updated:** 2026-09-16  

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

### Web Application Only

| Variable | Required | Example | Notes |
|----------|----------|---------|-------|
| `NEXT_PUBLIC_API_URL` | ✅ | `https://api.example.com/api/v1` | Public API endpoint URL |

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
