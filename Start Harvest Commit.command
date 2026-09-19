#!/bin/zsh
set -e
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if curl --silent --fail http://localhost:4173 | rg --quiet 'Harvest Commit'; then
  open http://localhost:4173
  exit 0
fi
if [[ ! -d node_modules ]]; then
  npm ci
fi
npm run build
npm start &
harvest_server_pid=$!
for attempt in {1..20}; do
  if curl --silent --fail http://localhost:4173 >/dev/null; then
    open http://localhost:4173
    break
  fi
  sleep 0.25
done
wait "$harvest_server_pid"
