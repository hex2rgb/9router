#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

docker compose -f docker-compose-local.yml down --remove-orphans
docker compose -f docker-compose-local.yml up -d --build
