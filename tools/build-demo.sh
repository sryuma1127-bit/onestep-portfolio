#!/usr/bin/env bash
# 公開デモを作り直す。本体リポジトリは「読むだけ」（git show）。
#   使い方: tools/build-demo.sh [本体リポジトリのパス] [コミット]
#   例:     tools/build-demo.sh ~/One-Step 88e191b
#   DEMO_TODAY=2026-09-14 を付けると日付の基準を固定できる（スクリーンショットの再現用）
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="${1:-$HOME/One-Step}"
COMMIT="${2:-88e191b}"
node tools/build-demo.js "$REPO" "$COMMIT"
