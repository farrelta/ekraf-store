#!/usr/bin/env bash
set -euo pipefail
: "${DISK_ALERT_WEBHOOK:?Set DISK_ALERT_WEBHOOK to a private webhook accepting a text form field}"
for directory in / /var/lib/docker; do
  free_kib=$(df -Pk "$directory" | awk 'NR == 2 {print $4}')
  if (( free_kib < 5 * 1024 * 1024 )); then
    curl --fail --silent --show-error --max-time 10 --data-urlencode "text=EKRAF $(hostname): less than 5 GiB free on $directory" "$DISK_ALERT_WEBHOOK"
  fi
done
