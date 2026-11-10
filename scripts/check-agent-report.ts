import { readFileSync } from 'node:fs';
import { parseDeviceReport } from '../src/devices/report';

/**
 * CI helper: validates a report printed by the agent script (--print / -Print)
 * with the same parser the server uses. Usage: tsx scripts/check-agent-report.ts report.json linux
 */
const [file, expectedOs] = process.argv.slice(2);
const text = readFileSync(file, 'utf8').replace(/^﻿/, '').trim();
const raw = JSON.parse(text);
const report = parseDeviceReport(raw);
if (typeof report === 'string') throw new Error(`Report rejected: ${report}`);
if (report.os !== expectedOs) throw new Error(`Expected os ${expectedOs}, got ${report.os}`);
const known = Object.entries(report).filter(([, v]) => v !== null && v !== undefined).map(([k]) => k);
for (const key of ['diskEncrypted', 'firewallEnabled']) {
  if (raw[key] !== null && typeof raw[key] !== 'boolean') throw new Error(`${key} should be true, false or null`);
}
console.log(`Valid ${report.os} report from ${report.hostname} (${report.osVersion}, ${report.role}).`);
console.log(`Settings read: ${known.join(', ')}`);
console.log(JSON.stringify(report, null, 2));
