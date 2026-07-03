#!/usr/bin/env bash
# =============================================================================
# scripts/ci.sh — AI First verification pipeline
#
# Runs every layer of the test & verification framework in order. Each step
# gates the next, and emits a structured JSON record so an AI review agent
# (or a human) can quickly identify which layer failed.
#
# Layers:
#   1. typecheck    (tsc --noEmit)        — L1 TypeScript Strict
#   2. lint         (eslint)              — L1 ESLint Code Style + AI guardrails
#   3. test         (vitest run)          — L4 behavioural unit tests
#   4. contract     (vitest *.contract)   — L4 schema / contract regression
#   5. coverage     (vitest --coverage)   — L4 threshold gate (100/95/90/100)
#   6. build        (vite build)          — production build sanity
#   7. e2e:smoke    (scripts/e2e-smoke)   — live HTTP smoke
#   8. e2e:deep     (scripts/e2e-deep-check.mjs) — Console interaction
#
# Usage:
#   ./scripts/ci.sh           # local quick gate (no e2e)
#   ./scripts/ci.sh --full    # include e2e smoke + deep check
#   ./scripts/ci.sh --no-coverage   # skip slow coverage step
#   ./scripts/ci.sh --skip-typecheck # skip typecheck (e.g. while iterating)
# =============================================================================
set -euo pipefail

# ---- output paths --------------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${ROOT}/coverage/ci"
mkdir -p "${REPORT_DIR}"
SUMMARY="${REPORT_DIR}/summary.json"

# ---- colour helpers ------------------------------------------------------
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { printf "  ${GREEN}✓${NC} %s\n" "$1"; }
fail() { printf "  ${RED}✗${NC} %s\n" "$1"; }
warn() { printf "  ${YELLOW}⚠${NC} %s\n" "$1"; }
step() { printf "\n${BLUE}[%s/%s]${NC} %s\n" "$1" "$TOTAL" "$2"; }

# ---- arg parsing ---------------------------------------------------------
WITH_E2E=false
WITH_COVERAGE=true
SKIP_TYPECHECK=false
for arg in "$@"; do
  case "$arg" in
    --full)           WITH_E2E=true ;;
    --no-coverage)    WITH_COVERAGE=false ;;
    --skip-typecheck) SKIP_TYPECHECK=true ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if $WITH_E2E; then
  TOTAL=8
else
  TOTAL=6
fi

# ---- configuration --------------------------------------------------------
PROJECT_NAME="t0-sandbox-bridge"
BUILD_COMMAND="bun run build"
INSTALL_COMMAND="bun install"

# ---- result accumulator --------------------------------------------------
RESULTS=()
pass()  { RESULTS+=("\"$1\":{\"status\":\"pass\",\"durationMs\":$2}"); }
failc() { RESULTS+=("\"$1\":{\"status\":\"fail\",\"durationMs\":$2,\"error\":\"$(echo "$3" | tr '\n' ' ' | head -c 400)\"}"); }

run_step() {
  local name="$1"; shift
  local start_ms end_ms
  start_ms=$(python3 -c 'import time;print(int(time.time()*1000))')
  # vitest --coverage wipes coverage/, so recreate the ci subdir on every step.
  mkdir -p "${REPORT_DIR}"
  # Ensure the log file exists so downstream tools can tail/read it even if
  # the step produced no output.
  : >"${REPORT_DIR}/${name}.log"
  if "$@" >"${REPORT_DIR}/${name}.log" 2>&1; then
    end_ms=$(python3 -c 'import time;print(int(time.time()*1000))')
    pass "$name" $((end_ms - start_ms))
    ok "${name} (${REPORT_DIR}/${name}.log)"
    return 0
  else
    end_ms=$(python3 -c 'import time;print(int(time.time()*1000))')
    local tail
    tail=$(tail -n 40 "${REPORT_DIR}/${name}.log")
    failc "$name" $((end_ms - start_ms)) "$tail"
    fail "${name} (full log: ${REPORT_DIR}/${name}.log)"
    return 1
  fi
}

# =============================================================================
# Pipeline
# =============================================================================
cd "$ROOT"

if $SKIP_TYPECHECK; then
  warn "skipping typecheck (--skip-typecheck)"
else
  step 1 "$TOTAL: typecheck (L1)"
  run_step typecheck bun run typecheck || exit 1
fi

step 2 "$TOTAL: lint (L1 + AI guardrails)"
run_step lint bun run lint || exit 1

step 3 "$TOTAL: behavioural unit tests (L4)"
run_step test bun run test || exit 1

step 4 "$TOTAL: contract / schema tests (L4)"
run_step contract bun run test:contract || exit 1

if $WITH_COVERAGE; then
  step 5 "$TOTAL: coverage thresholds (L4)"
  run_step coverage bun run test:coverage || exit 1
else
  warn "skipping coverage (--no-coverage)"
fi

step 6 "$TOTAL: production build"
run_step build bun run build || exit 1

if $WITH_E2E; then
  # Stand up a Nitro preview on the conventional 4173 port so the e2e suite's
  # default BASE_URL works without manual overrides. The preview is killed
  # unconditionally at the end so it doesn't leak into the next CI run.
  if [ ! -d ".vercel/output/functions/__server.func" ]; then
    warn ".vercel/output not found — e2e needs a prior build. Building now."
    "$BUILD_COMMAND" >/dev/null 2>&1 || {
      fail "build required for e2e failed"
      exit 1
    }
  fi
  E2E_PORT="${E2E_PORT:-4173}"
  E2E_PID_FILE="${REPORT_DIR}/e2e-server.pid"
  (cd .vercel/output && export STATIC_DIR="$(pwd)/static" && nohup npx srvx serve --port "$E2E_PORT" --prod --static "$STATIC_DIR" ./functions/__server.func/index.mjs >"${REPORT_DIR}/e2e-server.log" 2>&1 &
   echo $! >"$E2E_PID_FILE")
  # Wait for the preview server to be reachable (max ~10s).
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -sI -o /dev/null "http://127.0.0.1:${E2E_PORT}/" 2>/dev/null; then
      ok "e2e preview server up on :${E2E_PORT}"
      break
    fi
    sleep 1
  done
  export BASE_URL="http://127.0.0.1:${E2E_PORT}"
  trap 'kill "$(cat "$E2E_PID_FILE" 2>/dev/null)" 2>/dev/null || true' EXIT

  step 7 "$TOTAL: e2e smoke (live HTTP)"
  run_step e2e_smoke bun run test:e2e:smoke || exit 1
  step 8 "$TOTAL: e2e deep check (live HTTP)"
  # Deep check writes its own structured report into e2e-reports/.
  BASE_URL="$BASE_URL" node scripts/e2e-deep-check.mjs >"${REPORT_DIR}/e2e_deep.log" 2>&1 || {
    fail "e2e deep check failed (full log: ${REPORT_DIR}/e2e_deep.log)"
    exit 1
  }
  ok "e2e_deep"
fi

# ---- summary -------------------------------------------------------------
{
  printf "{\n  \"timestamp\": \"%s\",\n  \"steps\": {\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  IFS=','
  printf "    %s\n" "${RESULTS[*]}"
  printf "  }\n}\n"
} >"${SUMMARY}"

echo
printf "${GREEN}=======================================${NC}\n"
printf "${GREEN}  All verification layers passed ✓${NC}\n"
printf "${GREEN}=======================================${NC}\n"
echo
echo "Report: ${SUMMARY}"
echo "Logs:   ${REPORT_DIR}/"