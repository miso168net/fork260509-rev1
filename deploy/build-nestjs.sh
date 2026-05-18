#!/usr/bin/env bash
# W-FA3 — nestjs image build script(Track DESIGN-A transitional、F14 cutover 整支刪)
# Image ref = nestjs:${TAG};default rev1-admin-nestjs 對齊 W-FA1 compose `image: nestjs:rev1-admin-nestjs`
set -euo pipefail
TAG=rev1-admin-nestjs
usage() {
  cat <<EOF
Usage: bash deploy/build-nestjs.sh [--tag <name>] [--help]
  --tag <name>, -t <name>   Image tag (default: rev1-admin-nestjs)
  --help, -h                Show this help
Build context: fork260509-soybean-admin-nestjs/backend/
Image:         nestjs:<tag>
NODE_VERSION:  22.11.0 (built-in、per W-FA1 implement-time A-002)
EOF
}
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag|-t) [[ -n "${2:-}" ]] || { echo "[W-FA3 ERROR] --tag requires a value" >&2; exit 1; }; TAG="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "[W-FA3 ERROR] unknown arg: $1" >&2; usage >&2; exit 1 ;;
  esac
done
DOCKER_BUILDKIT=1 docker build \
  --build-arg NODE_VERSION=22.11.0 \
  -f fork260509-soybean-admin-nestjs/backend/Dockerfile \
  -t "nestjs:${TAG}" \
  fork260509-soybean-admin-nestjs/backend/
docker images "nestjs:${TAG}" --format "[W-FA3] Built {{.Repository}}:{{.Tag}} ({{.Size}})"
