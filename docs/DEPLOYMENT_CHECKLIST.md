# Deployment Readiness Checklist — Stage 5

**Status:** ✅ Ready for Deployment  
**Last Updated:** 2026-09-16  
**Scope:** Landlord inspection vertical slice (Phase C/D/E)

---

## Pre-Deployment Verification

### Code Quality
- [x] All tests passing (79/79)
- [x] TypeScript strict mode compliant
- [x] Production builds succeed
- [x] No console errors in builds
- [x] No security vulnerabilities in dependencies

### Security
- [x] No hardcoded credentials in code
- [x] All secrets via environment variables only
- [x] .env files git-ignored
- [x] S3 buckets configured private
- [x] CORS configured for production domains
- [x] HTTP-only cookies for auth
- [x] Presigned URLs time-limited (60s)

### Configuration
- [x] Environment variables documented
- [x] Production example created (.env.production.example)
- [x] Database migrations tested
- [x] Deployment guide written (DEPLOYMENT.md)
- [x] Scaling guide included
- [x] Rollback procedures documented

---

## Infrastructure Requirements

### Compute
- [ ] Node.js 20+ runtime
- [ ] Container orchestration (Docker, Kubernetes) - optional
- [ ] Load balancer (if multiple API instances)

### Data Storage
- [ ] PostgreSQL 16+ (managed or self-hosted)
  - Connection pool: 5-10 for single API instance
  - Backup enabled: Daily minimum
  - SSL/TLS enabled: Yes

- [ ] Redis 7+ (managed or self-hosted)
  - Used by BullMQ (job queue)
  - Persistence: RDB or AOF recommended
  - Memory: >= 256MB for Phase 5 scale

### Object Storage
- [ ] AWS S3 or Cloudflare R2
  - Two private buckets created (evidence + reports)
  - Access restricted: IAM role or API token
  - Lifecycle: No auto-delete
  - Versioning: Optional but recommended
  - Encryption: At-rest and in-transit

### Network
- [ ] Domain name with DNS
- [ ] TLS certificate (Let's Encrypt or commercial)
- [ ] Reverse proxy (Nginx, Apache, or cloud LB)
- [ ] Firewall rules: API (:4000), Web (:3000)
- [ ] Egress allowed for S3/R2, email service

---

## Environment Variables (Must Be Set)

### API & Jobs
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host/db
REDIS_URL=redis://host:6379
PORT=4000
S3_ENDPOINT=https://...
S3_REGION=us-east-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_EVIDENCE_BUCKET=inspectai-evidence
S3_REPORTS_BUCKET=inspectai-reports
```

### Web
```
NEXT_PUBLIC_API_URL=https://api.example.com/api/v1
```

### Optional (Future Phases)
```
EMAIL_PROVIDER=postmark
EMAIL_API_KEY=...
LOG_LEVEL=info
SENTRY_DSN=...
```

---

## Deployment Steps

### 1. Infrastructure Setup
- [ ] Create PostgreSQL database
- [ ] Create Redis instance
- [ ] Create S3/R2 buckets (2x, private)
- [ ] Configure DNS records
- [ ] Obtain TLS certificate

### 2. Application Build
```bash
pnpm install --frozen-lockfile
pnpm run build
```
- [ ] API builds without errors
- [ ] Web builds without errors
- [ ] Jobs builds without errors

### 3. Database Setup
```bash
export DATABASE_URL=...
pnpm exec prisma migrate deploy
```
- [ ] Migrations applied successfully
- [ ] Schema verified in database

### 4. Service Startup (Order Matters)
1. Database (PostgreSQL)
2. Cache (Redis)
3. API Server (NestJS on :4000)
4. Jobs Worker (Node.js)
5. Web App (Next.js on :3000)
6. Reverse Proxy (Nginx/Apache)

### 5. Verification
```bash
# API health
curl -v https://api.example.com/api/v1/auth/me
# Expected: 401 Unauthorized (no session)

# Web app loads
curl -v https://example.com/login
# Expected: 200 OK with HTML

# Database connection working
# Check API logs for: "Prisma connected"

# Redis connection working
# Check jobs logs for: "Worker listening"

# S3 connection working
# Check API logs for: "Storage configured"
```

---

## Post-Deployment Verification

### Functionality
- [ ] Login form renders
- [ ] Unauthenticated /app/* redirects to /login
- [ ] Database queries work
- [ ] S3 file operations work
- [ ] Job queue processes messages
- [ ] Session cookies set (http-only)

### Security
- [ ] No credentials in error messages
- [ ] No stack traces exposed in 5xx errors
- [ ] S3 buckets remain private
- [ ] Presigned URLs expire after 60 seconds
- [ ] CORS only allows expected domains

### Performance
- [ ] API response time < 500ms (typical)
- [ ] Web page load time < 3s (first load)
- [ ] Job processing: Analysis < 60s per inspection
- [ ] Database connection pool healthy

### Monitoring
- [ ] Logs aggregated (stdout to centralized logging)
- [ ] Error tracking configured (Sentry or similar)
- [ ] Health checks passing
- [ ] Database backups scheduled
- [ ] S3 access logged

---

## Rollback Procedures

### If API Deployment Fails
1. Stop new API instance
2. Restart previous API version (if available)
3. Verify DATABASE_URL points to correct database
4. Check logs: `docker logs [api-container]` or check application logs

### If Database Migration Fails
1. Stop applications
2. Identify failed migration: `prisma migrate status`
3. Resolve manually or revert to previous database snapshot
4. Check Prisma documentation for migration recovery

### If S3 Misconfigured
1. Verify bucket names and regions match env vars
2. Verify IAM credentials have s3:GetObject and s3:PutObject
3. Test: `aws s3 ls s3://bucket-name/`
4. No rollback needed (just reconfigure env vars)

---

## Known Limitations & Future Work

### Phase 5 Does Not Include
- Email notifications (Phase 3)
- Push notifications (Phase 5)
- Admin console (Phase 3)
- MFA (Phase 2)
- Offline capture sync (Phase 2)
- Tenant capture app (Mobile - Phase 1)
- Comparison pass (Phase 2)
- Condition scores (Phase 2)

### Manual Processes (Post-Deploy)
- [ ] Email service configuration (for Phase 3)
- [ ] Monitoring dashboard setup
- [ ] Log aggregation pipeline
- [ ] Backup retention policy
- [ ] Disaster recovery testing
- [ ] Load testing (if needed)

---

## Sign-Off

| Role | Name | Date | Notes |
|------|------|------|-------|
| DevOps | — | — | *To be completed during deployment* |
| Security | — | — | *To be completed during security review* |
| Product | — | — | *To be completed after UAT* |

---

## References

- DEPLOYMENT.md - Step-by-step deployment guide
- ARCHITECTURE.md - Application design
- .env.production.example - Environment template
- Prisma Migration Guide: https://www.prisma.io/docs/orm/prisma-migrate
- BullMQ Documentation: https://docs.bullmq.io/
