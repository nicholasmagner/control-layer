export function organizationName(): string {
  return process.env.ORGANIZATION_NAME?.trim() || 'Your organization';
}

export function scanIntervalHours(): number | null {
  const n = Number(process.env.SCAN_INTERVAL_HOURS);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** How often an unchanged check gets a fresh evidence image (days). */
export function snapshotIntervalDays(): number {
  const n = Number(process.env.SNAPSHOT_INTERVAL_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}
