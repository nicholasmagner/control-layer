export function organizationName(): string {
  return process.env.ORGANIZATION_NAME?.trim() || 'Your organization';
}

export function scanIntervalHours(): number | null {
  const n = Number(process.env.SCAN_INTERVAL_HOURS);
  return Number.isFinite(n) && n > 0 ? n : null;
}
