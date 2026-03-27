#!/usr/bin/env sh
# =============================================================================
# Qlicker Production — Backup Manager
# =============================================================================
# Runs inside Docker and triggers backup.sh when the configured schedule is due.
#
# Scheduling assumptions:
# - Daily backups run every day at backupTimeLocal.
# - Weekly backups run on Sundays at backupTimeLocal.
# - Monthly backups run on the first day of each month at backupTimeLocal.
# - The loop checks once per minute, so the effective trigger window is one minute.
# =============================================================================
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-$SCRIPT_DIR/backup.sh}"
MONGO_URI="${MONGO_URI:-mongodb://mongo:27017/qlicker}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_CHECK_INTERVAL_SECONDS="${BACKUP_CHECK_INTERVAL_SECONDS:-60}"

query_backup_state() {
  mongosh "$MONGO_URI" --quiet --eval '
    const settings = db.getSiblingDB("qlicker").settings.findOne({ _id: "settings" }) || {};
    print([
      settings.backupEnabled === true ? "true" : "false",
      settings.backupTimeLocal || "02:00",
      settings.backupLastDailyRunKey || "",
      settings.backupLastWeeklyRunKey || "",
      settings.backupLastMonthlyRunKey || ""
    ].join("\t"));
  '
}

run_backup() {
  label="$1"
  run_key="$2"
  BACKUP_RUNTIME=container MONGO_URI="$MONGO_URI" BACKUP_DIR="$BACKUP_DIR" BACKUP_LABEL="$label" BACKUP_RUN_KEY="$run_key" "$BACKUP_SCRIPT"
}

should_run_daily() {
  current_date="$1"
  last_daily_key="$2"
  [ "$last_daily_key" != "$current_date" ]
}

should_run_weekly() {
  current_week="$1"
  last_weekly_key="$2"
  [ "$last_weekly_key" != "$current_week" ]
}

should_run_monthly() {
  current_month="$1"
  last_monthly_key="$2"
  [ "$last_monthly_key" != "$current_month" ]
}

while :; do
  state="$(query_backup_state)"
  IFS="$(printf '\t')" read -r BACKUP_ENABLED BACKUP_TIME_LOCAL LAST_DAILY_KEY LAST_WEEKLY_KEY LAST_MONTHLY_KEY <<EOF_STATE
$state
EOF_STATE

  if [ "$BACKUP_ENABLED" = "true" ]; then
    current_time="$(date '+%H:%M')"
    current_date="$(date '+%F')"
    current_week="$(date '+%G-W%V')"
    current_month="$(date '+%Y-%m')"
    current_weekday="$(date '+%u')"

    if [ "$current_time" = "${BACKUP_TIME_LOCAL:-02:00}" ] || [ "$current_time" \> "${BACKUP_TIME_LOCAL:-02:00}" ]; then
      if should_run_daily "$current_date" "${LAST_DAILY_KEY:-}"; then
        run_backup daily "$current_date"
      fi

      if [ "$current_weekday" = "7" ] && should_run_weekly "$current_week" "${LAST_WEEKLY_KEY:-}"; then
        run_backup weekly "$current_week"
      fi

      if [ "$(date '+%d')" = "01" ] && should_run_monthly "$current_month" "${LAST_MONTHLY_KEY:-}"; then
        run_backup monthly "$current_month"
      fi
    fi
  fi

  sleep "$BACKUP_CHECK_INTERVAL_SECONDS"
done
