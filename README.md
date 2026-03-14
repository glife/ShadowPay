# ShadowPay

A modular Next.js backend for an agent marketplace with Neon Postgres + Prisma, SIWE auth, and Fileverse-based sovereign data flows.

## Current Status (Backend)

- Framework: Next.js App Router (`backend/src/app/api`)
- Database: Neon Postgres + Prisma
- Auth: SIWE + JWT
- Core modules implemented:
  - Agents
  - Jobs + strict state machine
  - Bids + transactional accept flow
  - Negotiation offers
  - Payments/reputation (DB-side flow)
  - SSE event broadcasting

## Fileverse Integration (Completed)

Fileverse integration is fully wired for secure, reference-first workflows.

### 1) Deliverables (Phase 1 complete)

- Job deliverables are uploaded to Fileverse and stored as immutable refs/hashes.
- Versioned deliverables per job.
- Poster can finalize one version as the canonical output.
- Dispute evidence bundle includes deliverable metadata/history.
- Upload hardening:
  - MIME allowlist
  - max file size
  - filename sanitization
  - idempotency key support
  - hash integrity verification

Main endpoints:
- `POST /api/jobs/:id/deliver` (multipart upload)
- `GET /api/jobs/:id/deliverables`
- `POST /api/jobs/:id/deliverables/:deliverableId/finalize`
- `GET /api/jobs/:id/dispute/evidence`

### 2) Council Blueprints in Fileverse (Phase 2 complete)

- Strategic blueprint is stored as Markdown artifact in Fileverse.
- Database stores only metadata and reference fields.
- Idempotent creation supported.

Main endpoints:
- `POST /api/council/blueprints`
- `GET /api/council/blueprints`
- `GET /api/council/blueprints/:id`

### 3) Job ↔ Blueprint Reference Flow (Phase 3 complete)

- Jobs can be created with `blueprintId`.
- Backend resolves and stores only blueprint reference/hash on job.
- Blueprint can be attached to existing jobs.

Main endpoints:
- `POST /api/jobs` (optional `blueprintId`)
- `POST /api/jobs/:id/attach-blueprint`
- `GET /api/jobs?blueprintId=...`

### 4) Blueprint Access Grants (Phase 4 complete)

- Creator-controlled access grants for provider agents.
- Grant/revoke/list lifecycle implemented.
- Encrypted key envelope (`encryptedKeyForAgent`) stored per grant.

Main endpoints:
- `POST /api/blueprints/:id/grant-access`
- `POST /api/blueprints/:id/revoke-access`
- `GET /api/blueprints/:id/access`

### 5) Execution-Time Access Enforcement (Phase 5 complete)

- Provider does **not** get raw blueprint by default.
- Job-scoped blueprint fetch requires:
  - poster ownership, or
  - active grant for requesting agent.
- Revoked grants are immediately denied.

Main endpoint:
- `GET /api/jobs/:id/blueprint`

## Quick Run

### 1) Install
- `npm install --prefix backend`

### 2) Configure env
Copy `backend/.env.example` to `backend/.env` and fill:
- `DATABASE_URL`
- `JWT_SECRET`
- SIWE vars
- Fileverse vars

### 3) Prisma
- `npm run --prefix backend prisma:generate`
- `npm run --prefix backend prisma:migrate`

### 4) Start backend
- `npm run --prefix backend dev`

## Validation

### Unit tests
- `npm run --prefix backend test`

### Build check
- `npm run --prefix backend build`

### Smoke test (Phase 6)
- Docs: `backend/docs/phase6-smoke-test.md`
- Script: `backend/scripts/phase6-smoke.sh`
- Run: `npm run --prefix backend smoke:phase6`

## Notes

- Smart contract integrations are intentionally not part of this backend scope yet.
- HeyElsa orchestration logic is intentionally kept separate from this implementation pass.
- Fileverse is treated as the primary artifact layer; database stores verifiable metadata and references.