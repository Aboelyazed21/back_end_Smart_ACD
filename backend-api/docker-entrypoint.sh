#!/bin/sh
set -eu

# Migrations and the idempotent seed are opt-in so rolling deployments can run
# them as a separate job. Local compose enables both for a one-command start.
if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "running database migrations"
  npm run migrate:up
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "loading idempotent reference and demo seed data"
  npm run seed
fi

exec node dist/server.js
