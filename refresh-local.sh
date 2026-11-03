#!/bin/bash
# Monthly data refresh, run on Lee's Mac by launchd
# (launchd/org.ledwards.swccg-data.refresh.plist). The PC website blocks
# GitHub's runners, so the scrape has to run from a home connection. Pulls
# main, runs bootstrap.sh, and pushes public/ when anything changed.
set -euo pipefail

cd "$(dirname "$0")"
export PATH="$HOME/.nvm/versions/node/v20.19.6/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

echo "=== $(date) ==="

# Never run over someone's work in progress.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Working tree has local changes; skipping this month's refresh."
  exit 1
fi

git checkout -q main
git pull -q --ff-only
npm install --no-audit --no-fund --silent

before=$(node -p 'require("./public/decklists.json").decklists.length')
sh bootstrap.sh
after=$(node -p 'require("./public/decklists.json").decklists.length')
echo "decklists: $before -> $after"

# A blocked or broken scrape tends to produce fewer decklists, not an error;
# never publish a shrunken archive.
if [ "$after" -lt "$before" ]; then
  echo "decklists.json shrank from $before to $after; not publishing."
  git checkout -q -- public
  exit 1
fi

git add public
if git diff --cached --quiet; then
  echo "No changes."
  exit 0
fi
git commit -q -m "Monthly data refresh $(date -u +%Y-%m-%d)"
git push -q
echo "Pushed $(git log --oneline -1)"
