#!/usr/bin/env bash
# 격리 복원 검증 (T18): 암호화 백업을 로컬 DB 컨테이너의 임시 데이터베이스에 복원하고 행 수를 원본과 비교한다.
# Isolated restore check (T18): restore an encrypted backup into a scratch database in the local DB container
# and compare row counts against the source.
#
# 사용 / Usage: BACKUP_PASSPHRASE=... scripts/backup/db-restore-check.sh <backup.tar.gz.enc>
# 운영 DB 에는 절대 복원하지 않는다. 로컬 컨테이너 내부의 임시 DB 만 사용한다.
# Never restores into a live DB; only a scratch database inside the local container.
set -euo pipefail

ARCHIVE="${1:?backup file path required}"
SCRATCH_DB="restore_check"
# 비교할 핵심 테이블
# Core tables to compare
TABLES=(public.profiles public.spaces public.space_members public.routines public.routine_occurrences public.routine_events public.reactions auth.users)

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "BACKUP_PASSPHRASE is required" >&2
  exit 1
fi

CONTAINER="$(docker ps --filter name=supabase_db --format '{{.Names}}' | head -1)"
if [[ -z "$CONTAINER" ]]; then
  echo "local supabase_db container not running (npx supabase start)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
cleanup() {
  docker exec "$CONTAINER" psql -U supabase_admin -d postgres -q -c "drop database if exists $SCRATCH_DB" >/dev/null 2>&1 || echo "warn: scratch db cleanup failed" >&2
  rm -rf "$WORK"
}
trap cleanup EXIT

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_PASSPHRASE -in "$ARCHIVE" | tar -C "$WORK" -xzf -

docker exec "$CONTAINER" psql -U supabase_admin -d postgres -q -c "drop database if exists $SCRATCH_DB" -c "create database $SCRATCH_DB"
docker cp "$WORK/schema.sql" "$CONTAINER:/tmp/restore_schema.sql"
docker cp "$WORK/data.sql" "$CONTAINER:/tmp/restore_data.sql"

# 스키마 → 데이터 순서로 복원. 오류 즉시 중단.
# Restore schema then data; stop on first error.
docker exec "$CONTAINER" psql -U supabase_admin -d "$SCRATCH_DB" -q -v ON_ERROR_STOP=1 -f /tmp/restore_schema.sql >/dev/null
docker exec "$CONTAINER" psql -U supabase_admin -d "$SCRATCH_DB" -q -v ON_ERROR_STOP=1 -f /tmp/restore_data.sql >/dev/null
docker exec "$CONTAINER" rm -f /tmp/restore_schema.sql /tmp/restore_data.sql

status=0
for table in "${TABLES[@]}"; do
  source_count="$(docker exec "$CONTAINER" psql -U postgres -d postgres -tAc "select count(*) from $table")"
  restored_count="$(docker exec "$CONTAINER" psql -U postgres -d "$SCRATCH_DB" -tAc "select count(*) from $table")"
  mark="OK"
  if [[ "$source_count" != "$restored_count" ]]; then
    mark="MISMATCH"
    status=1
  fi
  printf '%-34s source=%-6s restored=%-6s %s\n' "$table" "$source_count" "$restored_count" "$mark"
done

if [[ $status -ne 0 ]]; then
  echo "RESTORE CHECK FAILED (source may have changed since the backup)" >&2
  exit 1
fi
echo "RESTORE CHECK PASSED"
echo "note: run reapply_account_deletions() after a real restore to re-scrub deleted accounts (D23)"
