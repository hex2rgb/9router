#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# 1. 先打镜像，此时旧容器仍在正常运行（构建过程零停机）；构建失败则直接退出，不影响服务
docker compose -f docker-compose-local.yml build --pull

# 2. 镜像构建成功后再替换容器：一步完成"停旧起新"，停机时间只有重启这几秒；
docker compose -f docker-compose-local.yml up -d --no-build --remove-orphans
