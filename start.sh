#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
PORT="${1:-4173}"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "Python 3 was not found on PATH." >&2
  echo "Install Python 3, or run any static file server in this directory." >&2
  exit 1
fi

echo
echo "  HORNTYPE / local server"
echo "  http://127.0.0.1:${PORT}/"
echo "  Press Ctrl+C to stop."
echo

(
  sleep 1
  if command -v open >/dev/null 2>&1; then
    open "http://127.0.0.1:${PORT}/"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:${PORT}/" >/dev/null 2>&1
  fi
) >/dev/null 2>&1 &

exec "$PYTHON" -m http.server "$PORT" --bind 127.0.0.1
