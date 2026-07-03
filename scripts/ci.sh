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
#   7. e2e:smoke    (scripts/e2e-smoke)   — live HTTP smoke (only when --e2e)
#
# Usage:
#   ./scripts/ci.sh           # local quick gate (no e2e)
#   ./scripts/ci.sh --full    # include e2e smoke
#   ./scripts/ci.sh --no-coverage   # skip slow coverage step
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
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if $WITH_E2E; then
  TOTAL=7
else
  TOTAL=6
fi

# ---- result accumulator --------------------------------------------------
RESULTS=()
pass()  { RESULTS+=("\"$1\":{\"status\":\"pass\",\"durationMs\":$2}"); }
failc() { RESULTS+=("\"$1\":{\"status\":\"fail\",\"durationMs\":$2,\"error\":\"$(echo "$3" | tr '\n' ' ' | head -c 400)\"}"); }

run_step() {
  local name="$1"; shift
  local start_ms end_ms
  start_ms=$(python3 -c 'import time;print(int(time.time()*1000))')
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
  step 7 "$TOTAL: e2e smoke (live HTTP)"
  run_step e2e_smoke bun run test:e2e:smoke || exit 1
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