#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${BACKUP_DEST:?Set BACKUP_DEST to a private rclone bucket path}"
umask 077
work=$(mktemp -d)
trap 'rm -f "$work/database.dump" "$work/uploads.tar"; rmdir "$work"' EXIT
archive="ekraf-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
destination="${BACKUP_DEST%/}/$archive"

docker compose exec -T db sh -ec 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "$work/database.dump"
# Snapshot the database first so files referenced by committed rows are included.
docker compose exec -T api tar -cf - -C /app/api/storage . > "$work/uploads.tar"
tar -czf - -C "$work" database.dump uploads.tar | rclone rcat "$destination.partial"
rclone moveto "$destination.partial" "$destination"
printf 'Backup uploaded: %s\n' "$archive"
