#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

log() {
  printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"
}

fail() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

have_command() {
  command -v "$1" >/dev/null 2>&1
}

resolve_command() {
  local primary="$1"
  local fallback="$2"

  if have_command "$primary"; then
    printf '%s' "$primary"
    return 0
  fi

  if have_command "$fallback"; then
    printf '%s' "$fallback"
    return 0
  fi

  return 1
}

run() {
  log "$*"
  "$@"
}

NODE_BIN="${NODE_BIN:-node}"
NPM_BIN="${NPM_BIN:-}"
NPX_BIN="${NPX_BIN:-}"

have_command "$NODE_BIN" || fail "Node.js is required but was not found in PATH."
NPM_BIN="${NPM_BIN:-$(resolve_command npm npm.cmd || true)}"
NPX_BIN="${NPX_BIN:-$(resolve_command npx npx.cmd || true)}"

[ -n "$NPM_BIN" ] || fail "npm is required but was not found in PATH."
[ -n "$NPX_BIN" ] || fail "npx is required but was not found in PATH."
[ -f package.json ] || fail "package.json was not found in $ROOT_DIR."

needs_install=0
if [ ! -d node_modules ]; then
  needs_install=1
elif [ package.json -nt node_modules ] || [ package-lock.json -nt node_modules ]; then
  needs_install=1
fi

if [ "${FORCE_INSTALL:-0}" = "1" ]; then
  needs_install=1
fi

if [ "$needs_install" -eq 1 ]; then
  if [ -f package-lock.json ]; then
    run "$NPM_BIN" ci
  else
    run "$NPM_BIN" install
  fi
else
  log "Dependencies already present. Skipping npm install."
fi

if [ "${SKIP_PLAYWRIGHT_INSTALL:-0}" != "1" ]; then
  run "$NPX_BIN" playwright install chromium
else
  log "Skipping Playwright Chromium install because SKIP_PLAYWRIGHT_INSTALL=1."
fi

run "$NPM_BIN" run build

if [ "${BUILD_ONLY:-0}" = "1" ]; then
  log "Build completed. Exiting because BUILD_ONLY=1."
  exit 0
fi

log "Starting production server on port ${PORT:-8787}."
exec "$NPM_BIN" start
