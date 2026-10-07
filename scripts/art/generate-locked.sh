#!/bin/sh
# Runs scripts/art/generate.py on a job file under the shared .cache/mflux.lock, so two
# generations never share the GPU (two at once can exhaust the Mac's memory). Waits for the lock,
# releases it on exit or failure.
# usage: sh scripts/art/generate-locked.sh [jobs.jsonl]
cd "$(dirname "$0")/../.." || exit 1
until mkdir .cache/mflux.lock 2>/dev/null; do sleep 20; done
trap 'rmdir .cache/mflux.lock' EXIT INT TERM
.venv-art/bin/python scripts/art/generate.py "${1:-.cache/art/jobs.jsonl}" .cache/art/gen
