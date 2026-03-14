# Phase 6 Smoke Test Playbook (Fileverse + Blueprint Access)

This playbook validates the full zero-knowledge workflow:

1. Council blueprint is created and stored in Fileverse.
2. Job is created with blueprint reference only.
3. Blueprint access is granted to a provider.
4. Provider can fetch job-scoped blueprint payload.
5. Access is revoked.
6. Provider loses access immediately.

---

## Prerequisites

- Backend running: `npm run --prefix backend dev`
- Latest DB migration applied: `npm run --prefix backend prisma:migrate`
- Valid JWTs from SIWE login flow:
  - `POSTER_TOKEN`
  - `PROVIDER_TOKEN`
- Known provider `agentId` (target agent)

> Tip: use your existing frontend auth flow to mint SIWE JWTs, then paste tokens below.

---

## Environment variables

Use these in your terminal session:

- `BASE_URL=http://localhost:3000`
- `POSTER_TOKEN=<jwt_for_poster_owner>`
- `PROVIDER_TOKEN=<jwt_for_provider_agent>`
- `PROVIDER_AGENT_ID=<uuid_of_provider_agent>`

---

## Step 1 — Create a council blueprint

Request:

`POST /api/council/blueprints`

Headers:
- `Authorization: Bearer $POSTER_TOKEN`
- `Content-Type: application/json`
- `Idempotency-Key: blueprint-smoke-001`

Body:

```json
{
  "requestId": "req-smoke-001",
  "title": "SOL Strategy Smoke Test",
  "inputJson": {
    "asset": "SOL",
    "intent": "long",
    "risk": "medium",
    "fallback": "summarize AI news"
  }
}
```

Expected:
- HTTP `201`
- response includes `id`, `storageRef`, `contentHash`, `fileverseDocId`
- save `BLUEPRINT_ID=response.id`

---

## Step 2 — Create job with blueprint reference

Request:

`POST /api/jobs`

Headers:
- `Authorization: Bearer $POSTER_TOKEN`
- `Content-Type: application/json`

Body:

```json
{
  "title": "Execute SOL Strategy",
  "description": "Use blueprint-guided execution",
  "budgetMin": 0.05,
  "budgetMax": 0.2,
  "blueprintId": "<BLUEPRINT_ID>"
}
```

Expected:
- HTTP `201`
- response includes `id` (save as `JOB_ID`)
- response includes non-null `blueprintId`, `blueprintRef`, `blueprintHash`, `blueprintAttachedAt`

---

## Step 3 — Grant provider access

Request:

`POST /api/blueprints/<BLUEPRINT_ID>/grant-access`

Headers:
- `Authorization: Bearer $POSTER_TOKEN`
- `Content-Type: application/json`

Body:

```json
{
  "targetAgentId": "<PROVIDER_AGENT_ID>",
  "encryptedKeyForAgent": "encrypted-key-for-provider-smoke"
}
```

Expected:
- HTTP `201`
- response includes grant record with `revokedAt = null`

---

## Step 4 — Provider fetches job-scoped blueprint

Request:

`GET /api/jobs/<JOB_ID>/blueprint`

Headers:
- `Authorization: Bearer $PROVIDER_TOKEN`

Expected:
- HTTP `200`
- response:
  - `authorized = true`
  - `role = "granted_agent"`
  - `blueprintRef` populated
  - `encryptedKeyForAgent` populated

---

## Step 5 — Revoke provider access

Request:

`POST /api/blueprints/<BLUEPRINT_ID>/revoke-access`

Headers:
- `Authorization: Bearer $POSTER_TOKEN`
- `Content-Type: application/json`

Body:

```json
{
  "targetAgentId": "<PROVIDER_AGENT_ID>"
}
```

Expected:
- HTTP `200`
- response includes `revokedAt` timestamp

---

## Step 6 — Provider access should now fail

Request:

`GET /api/jobs/<JOB_ID>/blueprint`

Headers:
- `Authorization: Bearer $PROVIDER_TOKEN`

Expected:
- HTTP `403`
- error message like `No active blueprint access grant for this agent`

---

## Step 7 — Confirm access list state

Request:

`GET /api/blueprints/<BLUEPRINT_ID>/access?includeRevoked=true`

Headers:
- `Authorization: Bearer $POSTER_TOKEN`

Expected:
- HTTP `200`
- list contains provider grant row
- provider row has non-null `revokedAt`

---

## Optional extension: deliverable flow sanity

1. Worker uploads file via `POST /api/jobs/<JOB_ID>/deliver` (multipart)
2. Poster lists versions via `GET /api/jobs/<JOB_ID>/deliverables`
3. Poster finalizes via `POST /api/jobs/<JOB_ID>/deliverables/<id>/finalize`
4. Fetch evidence via `GET /api/jobs/<JOB_ID>/dispute/evidence`

Expected: all succeed, evidence includes deliverable hashes and versions.

---

## Pass criteria

- Blueprint reference is attached to job (not raw strategy body).
- Granted provider can fetch execution blueprint payload.
- Revoked provider cannot fetch it anymore.
- Access list reflects current + revoked state accurately.
- No server build/type/test regressions.
