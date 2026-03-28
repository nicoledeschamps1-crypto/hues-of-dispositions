#!/bin/bash
# Harness config for: BlobFX ("Hues of Dispositions")

PROJECT_NAME="BlobFX"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$PROJECT_DIR/sprint-contracts"
SERVER_PORT=8080

# URLs
HEALTH_CHECK_URL="http://localhost:$SERVER_PORT/blob-tracking.html"
EVAL_URL="http://localhost:$SERVER_PORT/blob-tracking.html"

# Budget
MAX_FIX_ROUNDS=3
MAX_BUDGET_PER_PHASE=25

# --- Hook Functions ---

# Sync all 9 files to ~/Downloads after each sprint
post_build_hook() {
  log "Syncing files to ~/Downloads..."
  for f in blob-tracking.html blob-core.js blob-fx.js blob-shader-fx.js \
           blob-overlay.js blob-audio.js blob-timeline.js blob-mask.js blob-tracking.js; do
    cp "$PROJECT_DIR/$f" ~/Downloads/"$f" 2>/dev/null || true
  done
  ok "Files synced"
}

# Git commit after all sprints pass
deploy_hook() {
  cd "$PROJECT_DIR"
  git add -A
  git commit -m "feat: $FEATURE_NAME (harness-built, $(date +%Y-%m-%d))"
  ok "Committed"
  post_build_hook
}
