#!/usr/bin/env sh
set -eu

# Phase 6 smoke helper (manual-friendly)
# Requires: curl, optionally jq

BASE_URL="${BASE_URL:-http://localhost:3000}"
POSTER_TOKEN="${POSTER_TOKEN:-}"
PROVIDER_TOKEN="${PROVIDER_TOKEN:-}"
PROVIDER_AGENT_ID="${PROVIDER_AGENT_ID:-}"

if [ -z "$POSTER_TOKEN" ] || [ -z "$PROVIDER_TOKEN" ] || [ -z "$PROVIDER_AGENT_ID" ]; then
  echo "Set POSTER_TOKEN, PROVIDER_TOKEN, PROVIDER_AGENT_ID first."
  exit 1
fi

echo "[1] Create blueprint"
CREATE_BLUEPRINT_RESP=$(curl -sS -X POST "$BASE_URL/api/council/blueprints" \
  -H "Authorization: Bearer $POSTER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: blueprint-smoke-001" \
  -d '{"requestId":"req-smoke-001","title":"SOL Strategy Smoke Test","inputJson":{"asset":"SOL","intent":"long","risk":"medium"}}')

echo "$CREATE_BLUEPRINT_RESP"

if command -v jq >/dev/null 2>&1; then
  BLUEPRINT_ID=$(echo "$CREATE_BLUEPRINT_RESP" | jq -r '.id')
else
  echo "Install jq for automatic parsing, then rerun."
  exit 1
fi

echo "[2] Create job with blueprintId=$BLUEPRINT_ID"
CREATE_JOB_RESP=$(curl -sS -X POST "$BASE_URL/api/jobs" \
  -H "Authorization: Bearer $POSTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Execute SOL Strategy\",\"description\":\"Use blueprint-guided execution\",\"budgetMin\":0.05,\"budgetMax\":0.2,\"blueprintId\":\"$BLUEPRINT_ID\"}")

echo "$CREATE_JOB_RESP"
JOB_ID=$(echo "$CREATE_JOB_RESP" | jq -r '.id')

echo "[3] Grant access to provider agent=$PROVIDER_AGENT_ID"
curl -sS -X POST "$BASE_URL/api/blueprints/$BLUEPRINT_ID/grant-access" \
  -H "Authorization: Bearer $POSTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"targetAgentId\":\"$PROVIDER_AGENT_ID\",\"encryptedKeyForAgent\":\"encrypted-key-for-provider-smoke\"}" | tee /dev/stderr

echo "[4] Provider fetch blueprint (expected 200)"
HTTP_OK=$(curl -sS -o /tmp/phase6_provider_blueprint_ok.json -w "%{http_code}" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" \
  "$BASE_URL/api/jobs/$JOB_ID/blueprint")
echo "status=$HTTP_OK"
cat /tmp/phase6_provider_blueprint_ok.json

echo "[5] Revoke access"
curl -sS -X POST "$BASE_URL/api/blueprints/$BLUEPRINT_ID/revoke-access" \
  -H "Authorization: Bearer $POSTER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"targetAgentId\":\"$PROVIDER_AGENT_ID\"}" | tee /dev/stderr

echo "[6] Provider fetch blueprint again (expected 403)"
HTTP_FORBIDDEN=$(curl -sS -o /tmp/phase6_provider_blueprint_forbidden.json -w "%{http_code}" \
  -H "Authorization: Bearer $PROVIDER_TOKEN" \
  "$BASE_URL/api/jobs/$JOB_ID/blueprint")
echo "status=$HTTP_FORBIDDEN"
cat /tmp/phase6_provider_blueprint_forbidden.json

echo "[7] Access list includeRevoked=true"
curl -sS -H "Authorization: Bearer $POSTER_TOKEN" \
  "$BASE_URL/api/blueprints/$BLUEPRINT_ID/access?includeRevoked=true" | tee /dev/stderr

echo "Phase 6 smoke helper finished."
