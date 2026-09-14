#!/usr/bin/env bash
# 公開前検査。Git に入る（入っている）ファイル全部を sanitize.py で調べ、
# 置いてはいけないファイル名が無いことも確かめる。1件でも当たれば失敗（終了コード 1）。
#   使い方: tools/check-public.sh
set -uo pipefail
cd "$(dirname "$0")/.."
status=0

list_files() {
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git ls-files --cached --others --exclude-standard
  else
    find . -type f -not -path './node_modules/*' -not -path './.git/*' | sed 's#^\./##'
  fi
}

echo "■ 置いてはいけないファイル"
bad=$(list_files | grep -E '(^|/)(\.clasp[^/]*\.json|\.clasprc\.json|LOCAL-[^/]*\.md|Code\.gs|test\.js|local-blocklist\.txt|blocklist\.sha256|local-replacements\.json)$' || true)
if [ -n "$bad" ]; then echo "$bad" | sed 's/^/  NG /'; status=1; else echo "  なし"; fi
if [ -d demo/.git ] || [ -d assets/.git ]; then echo "  NG 本体の .git が混入"; status=1; fi

echo "■ 内容の検査（Git 管理下＋未追跡の全テキストファイル）"
files=$(list_files)
[ -n "$files" ] || { echo "  NG 検査対象のファイルが無い"; status=1; }
# shellcheck disable=SC2086
python3 tools/sanitize.py check $files || status=1
if [ ! -f tools/local-blocklist.txt ] && [ ! -f tools/blocklist.sha256 ]; then
  echo "  NG 実在名の照合リストが無い（tools/local-blocklist.txt を用意して sanitize.py hash-blocklist を実行）"; status=1
fi

if [ "$status" = 0 ]; then echo "✅ check-public: 問題なし"; else echo "❌ check-public: 上の NG を直してください"; fi
exit $status
