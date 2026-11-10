import { randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '@/db/prisma';
import { sha256Hex } from '@/evidence/hash';
import { decryptSecret, encryptSecret } from '@/lib/secrets';
import { runScan } from '@/scan/run';
import type { DeviceReport } from './report';

const KEY = 'deviceKey';

/** The workspace's device key, which agents use to send reports. Stored encrypted. */
export async function getDeviceKey(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    return decryptSecret(row.value) as string;
  } catch {
    return null;
  }
}

export async function rotateDeviceKey(updatedBy: string): Promise<string> {
  const key = `cld_${randomBytes(24).toString('base64url')}`;
  const value = encryptSecret(key);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy }, update: { value, updatedBy } });
  return key;
}

export async function deviceKeyMatches(presented: string | null): Promise<boolean> {
  const key = await getDeviceKey();
  if (!key || !presented) return false;
  const a = Buffer.from(sha256Hex(presented));
  const b = Buffer.from(sha256Hex(key));
  return timingSafeEqual(a, b);
}

export async function saveDeviceReport(report: DeviceReport, ip: string | null) {
  const machineHash = sha256Hex(`controllayer-device:${report.machineId}`);
  const existing = await prisma.device.findUnique({ where: { machineHash }, select: { id: true, role: true, owner: true } });
  const data = {
    hostname: report.hostname, os: report.os, osVersion: report.osVersion, agentVersion: report.agentVersion, ip,
    report: { ...report, machineId: undefined } as object, lastSeenAt: new Date(),
  };
  if (existing) {
    // Role and owner changed in the app win over what the script guesses.
    return prisma.device.update({ where: { id: existing.id }, data: { ...data, owner: existing.owner ?? report.owner ?? null } });
  }
  return prisma.device.create({ data: { ...data, machineHash, role: report.role, owner: report.owner ?? null } });
}

const SCAN_DEBOUNCE_MS = 10 * 60_000;
const state = globalThis as unknown as { __clDeviceScan?: { running: boolean; queued: boolean } };

/**
 * Re-evaluates device checks shortly after reports arrive, at most every
 * 10 minutes, so findings stay current without anyone pressing Scan.
 */
export function scheduleDeviceScan() {
  const s = (state.__clDeviceScan ??= { running: false, queued: false });
  if (s.running) { s.queued = true; return; }
  void (async () => {
    const last = await prisma.checkRun.findFirst({ where: { provider: 'devices', isSample: false }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } });
    const wait = last ? Math.max(0, SCAN_DEBOUNCE_MS - (Date.now() - last.startedAt.getTime())) : 5_000;
    s.running = true;
    setTimeout(async () => {
      try {
        await runScan('devices', { actor: 'device agent' });
      } catch (err) {
        console.error('[devices] scan failed', err);
      } finally {
        s.running = false;
        if (s.queued) { s.queued = false; scheduleDeviceScan(); }
      }
    }, wait).unref?.();
  })().catch(err => console.error('[devices]', err));
}
