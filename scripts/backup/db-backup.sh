#!/usr/bin/env bash
# DB 논리 백업 + 암호화 + 보존 기간 정리 (D24 권장 초안: 일 1회, 14일 보존)
# Logical DB backup + encryption + retention cleanup (D24 draft: daily, 14-day retention)
#
# 사용 / Usage:
#   BACKUP_PASSPHRASE=... scripts/backup/db-backup.sh            # 로컬 DB / local DB
#   BACKUP_PASSPHRASE=... SUPABASE_DB_URL=... scripts/backup/db-backup.sh   # 원격 / remote (승인된 대상만)
# 백업 원문은 저장소 밖(BACKUP_DIR)에만 둔다. Git 업로드 금지 (08 문서).
# Backups live only outside the repo (BACKUP_DIR). Never commit them (doc 08).
set -euo pipefail

RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/living-routine-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SCHEMAS="public,auth"

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "BACKUP_PASSPHRASE is required" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
case "$BACKUP_DIR" in
  "$REPO_ROOT"*) echo "BACKUP_DIR must be outside the repository" >&2; exit 1 ;;
esac

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ -n "${SUPABASE_DB_URL:-}" ]]; then
  TARGET=(--db-url "$SUPABASE_DB_URL")
else
  TARGET=(--local)
fi

cd "$REPO_ROOT"
npx supabase db dump "${TARGET[@]}" -s "$SCHEMAS" -f "$WORK/schema.sql"
npx supabase db dump "${TARGET[@]}" -s "$SCHEMAS" --data-only -f "$WORK/data.sql"

ARCHIVE="$BACKUP_DIR/living-routine-$STAMP.tar.gz.enc"
tar -C "$WORK" -czf - schema.sql data.sql \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_PASSPHRASE -out "$ARCHIVE"
chmod 600 "$ARCHIVE"
echo "backup written: $ARCHIVE"

# 보존 기간이 지난 백업 정리 (이 스크립트가 만든 파일 패턴만)
# Prune backups past retention (only files matching this script's pattern)
find "$BACKUP_DIR" -maxdepth 1 -name 'living-routine-*.tar.gz.enc' -mtime "+$RETENTION_DAYS" -print -delete
