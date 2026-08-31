#!/bin/sh
#
# Update this instance and restart it. Run it from anywhere:
#
#     /opt/FreeFamilyDisplay/update.sh
#
# Why this exists: the compose file lives in infra/ while .env lives in the
# project root, so `docker compose up -d` on its own cannot work from either
# directory. From the root there is no compose file to discover — Compose looks
# in the current directory and then walks UP through its parents, never down
# into a subdirectory. From infra/ it finds the file, but the project directory
# becomes infra/, so it looks for infra/.env, does not find the real one, and
# every `${VAR:?...}` in the compose file fails. Both flags are needed, every
# time. This wraps the pair so day-to-day operation is one command.
#
#   ./update.sh              fetch, fast-forward, rebuild, restart, show status
#   ./update.sh --no-pull    rebuild and restart what is already checked out
#
set -eu

cd "$(dirname "$0")"

COMPOSE_ARGS="-f infra/compose.yaml --env-file .env"

if [ ! -f .env ]; then
  echo "No .env in $(pwd)." >&2
  echo "Copy .env.example to .env and fill it in, then run this again." >&2
  exit 1
fi

if [ "${1-}" = "--no-pull" ]; then
  shift
elif [ -d .git ]; then
  echo "==> Updating from origin"
  # --ff-only rather than a merge or a hard reset: on a box that only ever
  # deploys, a divergence means something unexpected happened locally, and
  # stopping to say so beats silently merging or silently destroying it.
  git fetch --quiet origin
  if ! git merge --ff-only origin/master; then
    echo >&2
    echo "Local history has diverged from origin/master." >&2
    echo "If this box has no local work worth keeping, discard it with:" >&2
    echo "    git reset --hard origin/master" >&2
    echo "then run this script again." >&2
    exit 1
  fi
else
  echo "==> Not a git checkout, skipping the update step"
fi

echo "==> Building and starting"
# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS up -d --build

echo "==> Status"
# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS ps

echo
echo "Containers show 'health: starting' for the first minute or two; that is"
echo "normal. Logs: docker compose $COMPOSE_ARGS logs -f web"
