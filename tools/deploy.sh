#!/usr/bin/env bash
# Rebuild the hosted page and ship it.
#   ./tools/deploy.sh "what changed"
# Pages redeploys on push; the installed app picks it up next launch online.
set -euo pipefail
cd "$(dirname "$0")/.."

node tools/build.mjs

if git diff --quiet && git diff --cached --quiet; then
  echo "Nothing changed — not committing."
  exit 0
fi

git add -A
git commit -m "${1:-Update app}"
git push

echo
echo "Pushed. Live in about a minute:"
echo "  https://terry-zeng1134.github.io/feeling-wheel/"
