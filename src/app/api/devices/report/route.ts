import { NextResponse } from 'next/server';
import { handle, HttpError, tooManyAttempts } from '@/auth/session';
import { parseDeviceReport } from '@/devices/report';
import { deviceKeyMatches, saveDeviceReport, scheduleDeviceScan } from '@/devices/service';
import { clientIp } from '@/lib/http';

/**
 * Where the ControlLayer agent script sends a device's report.
 * Authorization: Bearer <device key>. Body: JSON report (see src/devices/report.ts).
 */
export const POST = handle(async (req: Request) => {
  const ip = clientIp(req);
  if (tooManyAttempts(`device:${ip ?? 'unknown'}`, 120, 60 * 60_000)) throw new HttpError(429, 'Too many reports from this address. Try again later.');
  const key = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? null;
  if (!(await deviceKeyMatches(key))) throw new HttpError(401, 'Unknown device key. Copy the current command from Devices in ControlLayer.');
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > 512 * 1024) throw new HttpError(413, 'Report is too large.');
  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    throw new HttpError(400, 'The report is not valid JSON.');
  }
  const report = parseDeviceReport(body);
  if (typeof report === 'string') throw new HttpError(400, report);
  const device = await saveDeviceReport(report, ip);
  scheduleDeviceScan();
  return NextResponse.json({ ok: true, device: device.id, hostname: device.hostname, role: device.role });
});
