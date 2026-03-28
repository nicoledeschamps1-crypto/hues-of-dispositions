#!/bin/bash
# BlobFX harness wrapper — delegates to generic harness
exec ~/.claude/harness/harness.sh --project "$(cd "$(dirname "$0")/.." && pwd)" "$@"
