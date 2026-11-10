import type { DeviceEntry, DevicesInventory } from '@/checks/devices';
import { prisma } from '@/db/prisma';
import type { DeviceReport } from '@/devices/report';
import type { CollectResult } from './common';

/** Devices report on their own (agent script); a scan evaluates their latest reports. */
export async function collectDevices(): Promise<CollectResult<DevicesInventory>> {
  const rows = await prisma.device.findMany({ orderBy: { hostname: 'asc' } });
  if (!rows.length) throw new Error('No devices have reported yet. Open Devices and add one.');
  const devices = rows.map<DeviceEntry>(r => {
    const { machineId: _ignored, ...report } = r.report as unknown as DeviceReport;
    void _ignored;
    return { ...report, id: r.id, hostname: r.hostname, role: r.role as DeviceEntry['role'], owner: r.owner ?? undefined, lastSeenAt: r.lastSeenAt.toISOString() };
  });
  return { inventory: { collectedAt: new Date().toISOString(), devices }, errors: [], account: `${rows.length} device${rows.length === 1 ? '' : 's'}` };
}
