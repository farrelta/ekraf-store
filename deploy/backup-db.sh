#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${BACKUP_DEST:?Set BACKUP_DEST to a restricted off-server rclone remote, e.g. backups:ekraf/db}"
archive="ekraf-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
# Publish the final name only if both pg_dump and the upload succeed.
docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' |
  rclone rcat "${BACKUP_DEST%/}/$archive.partial"
rclone moveto "${BACKUP_DEST%/}/$archive.partial" "${BACKUP_DEST%/}/$archive"
