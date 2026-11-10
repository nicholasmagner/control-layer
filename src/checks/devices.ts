import type { DeviceReport } from '@/devices/report';
import { CheckDef, DAY_MS, INACTIVE_DAYS, ResourceResult } from './types';

/**
 * Checks for servers and laptops that report with the ControlLayer agent
 * script (on-premises or in any cloud). Each device is one resource. A device
 * whose setting could not be read is left out of that check; if no device
 * reported it, the check is "not evaluated".
 */

export type DeviceEntry = Omit<DeviceReport, 'machineId'> & { id: string; lastSeenAt: string };

export interface DevicesInventory {
  collectedAt: string;
  devices?: DeviceEntry[];
}

export const MAX_SCREEN_LOCK_MINUTES = 15;
export const MAX_DAYS_SINCE_UPDATE = 35;
export const STALE_REPORT_DAYS = 7;
const OS_NAME: Record<string, string> = { linux: 'Linux', windows: 'Windows', macos: 'macOS' };

type Verdict = { pass: boolean; message: string } | null;

/** Builds a per-device check from a function that judges one device (null = not readable / not applicable). */
function perDevice(
  def: Omit<CheckDef<DevicesInventory>, 'provider' | 'evaluate'>,
  judge: (d: DeviceEntry) => Verdict,
): CheckDef<DevicesInventory> {
  return {
    ...def,
    provider: 'devices',
    evaluate: inv => {
      if (!inv.devices) return null;
      const results = inv.devices.flatMap<ResourceResult>(d => {
        const v = judge(d);
        return v ? [{
          resourceId: `device:${d.id}`, resourceName: d.hostname, status: v.pass ? 'pass' : 'fail', message: `${d.hostname}: ${v.message}`,
          details: { os: OS_NAME[d.os] ?? d.os, osVersion: d.osVersion, role: d.role, ...(d.owner ? { owner: d.owner } : {}), lastReport: d.lastSeenAt },
        }] : [];
      });
      return inv.devices.length && !results.length ? null : results;
    },
  };
}

const known = <T,>(v: T | null | undefined): v is T => v !== null && v !== undefined;

export const DEVICE_CHECKS: CheckDef<DevicesInventory>[] = [
  perDevice({
    id: 'devices.disk_encryption',
    title: 'Disks are encrypted',
    description: 'Servers and laptops should encrypt their system disk (BitLocker, FileVault or LUKS), so data is safe if the device is lost or stolen.',
    severity: 'High',
    remediation: 'Windows: turn on BitLocker (Settings > Privacy & security > Device encryption, or Control Panel > BitLocker). macOS: turn on FileVault (System Settings > Privacy & Security). Linux: use LUKS full-disk encryption when installing, or encrypt data volumes.',
    controls: { SOC2: ['CC6.1', 'CC6.7', 'C1.1'], CMMC: ['MP.L1-3.8.3'], PCI: ['3.5.1'] },
  }, d => known(d.diskEncrypted) ? { pass: d.diskEncrypted, message: d.diskEncrypted ? 'system disk is encrypted.' : 'system disk is not encrypted.' } : null),

  perDevice({
    id: 'devices.firewall',
    title: 'Firewall is on',
    description: 'A host firewall should be enabled to block unexpected incoming connections.',
    severity: 'Medium',
    remediation: 'Windows: turn on Windows Defender Firewall for all profiles. macOS: System Settings > Network > Firewall. Linux: enable ufw, firewalld or nftables rules that drop unexpected traffic.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.1'], PCI: ['1.4.1'] },
  }, d => known(d.firewallEnabled) ? { pass: d.firewallEnabled, message: d.firewallEnabled ? 'firewall is on.' : 'firewall is off.' } : null),

  perDevice({
    id: 'devices.os_updates',
    title: 'Operating system is kept up to date',
    description: `Security updates should install automatically, or at least within ${MAX_DAYS_SINCE_UPDATE} days.`,
    severity: 'High',
    remediation: 'Windows: turn on automatic updates (or manage them with WSUS / Intune). macOS: System Settings > General > Software Update > Automatic updates. Linux: enable unattended-upgrades (Debian/Ubuntu) or dnf-automatic (RHEL/Fedora), and patch now.',
    controls: { SOC2: ['CC7.1', 'CC8.1'], CMMC: ['SI.L1-3.14.1'], PCI: ['6.3.3'] },
  }, d => {
    const recent = known(d.daysSinceUpdate) ? d.daysSinceUpdate <= MAX_DAYS_SINCE_UPDATE : null;
    if (recent === null && !known(d.autoUpdates)) return null;
    const pass = recent ?? d.autoUpdates === true;
    const parts = [
      known(d.daysSinceUpdate) ? `updates last installed ${d.daysSinceUpdate} day(s) ago` : null,
      known(d.autoUpdates) ? `automatic updates ${d.autoUpdates ? 'on' : 'off'}` : null,
    ].filter(Boolean);
    return { pass, message: `${parts.join(', ')}.` };
  }),

  perDevice({
    id: 'devices.malware_protection',
    title: 'Malware protection is running',
    description: 'Windows and Mac computers should run anti-malware with real-time protection (Microsoft Defender, XProtect with Gatekeeper, or another product).',
    severity: 'High',
    remediation: 'Windows: turn on Microsoft Defender real-time protection, or install your company antivirus. macOS: keep Gatekeeper on (spctl --master-enable) and updates current so XProtect stays up to date.',
    controls: { SOC2: ['CC6.8'], CMMC: ['SI.L1-3.14.2', 'SI.L1-3.14.4', 'SI.L1-3.14.5'], PCI: ['5.2.1'] },
  }, d => d.os === 'linux' || !known(d.malwareProtection) ? null
    : { pass: d.malwareProtection, message: d.malwareProtection ? 'malware protection is on.' : 'no active malware protection found.' }),

  perDevice({
    id: 'devices.screen_lock',
    title: 'Laptops lock automatically',
    description: `Workstations should lock the screen after at most ${MAX_SCREEN_LOCK_MINUTES} minutes of inactivity.`,
    severity: 'Medium',
    remediation: `Set the screen to lock after ${MAX_SCREEN_LOCK_MINUTES} minutes or less: Windows Group Policy / Intune "Interactive logon: Machine inactivity limit"; macOS System Settings > Lock Screen (or an MDM profile).`,
    controls: { SOC2: ['CC6.1'], CMMC: ['AC.L1-3.1.1'] },
  }, d => {
    if (d.role !== 'workstation' || d.screenLockMinutes === undefined) return null;
    if (d.screenLockMinutes === null) return { pass: false, message: 'no automatic screen lock is set or enforced.' };
    return { pass: d.screenLockMinutes > 0 && d.screenLockMinutes <= MAX_SCREEN_LOCK_MINUTES, message: `screen locks after ${d.screenLockMinutes} minute(s).` };
  }),

  perDevice({
    id: 'devices.remote_login',
    title: 'Remote logins are hardened',
    description: 'SSH should not allow root logins or passwords (keys only); Remote Desktop should require Network Level Authentication.',
    severity: 'High',
    remediation: 'SSH: set "PermitRootLogin no" and "PasswordAuthentication no" in /etc/ssh/sshd_config and restart sshd. Remote Desktop: turn on "Require computers to use Network Level Authentication", or turn Remote Desktop off when not needed.',
    controls: { SOC2: ['CC6.1', 'CC6.6'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.4.2'] },
  }, d => {
    const problems: string[] = [];
    const facts: boolean[] = [];
    if (known(d.sshRootLogin)) { facts.push(true); if (d.sshRootLogin) problems.push('SSH allows root login'); }
    if (known(d.sshPasswordAuth)) { facts.push(true); if (d.sshPasswordAuth) problems.push('SSH allows password logins'); }
    if (d.rdpEnabled === true && known(d.rdpNla)) { facts.push(true); if (!d.rdpNla) problems.push('Remote Desktop does not require Network Level Authentication'); }
    if (d.rdpEnabled === false) facts.push(true);
    if (!facts.length) return null;
    return problems.length ? { pass: false, message: `${problems.join('; ')}.` } : { pass: true, message: 'remote login settings are hardened.' };
  }),

  perDevice({
    id: 'devices.audit_logging',
    title: 'Servers keep security logs',
    description: 'Servers should record sign-ins and administrative actions (Linux auditd or persistent journal; Windows logon auditing).',
    severity: 'Medium',
    remediation: 'Linux: install and enable auditd (or make the systemd journal persistent) and forward logs centrally. Windows: enable "Audit Logon" success and failure (auditpol /set /subcategory:"Logon" /success:enable /failure:enable).',
    controls: { SOC2: ['CC7.2'], PCI: ['10.2.1'] },
  }, d => d.role !== 'server' || !known(d.auditLogging) ? null
    : { pass: d.auditLogging, message: d.auditLogging ? 'security logging is on.' : 'security logging is off.' }),

  perDevice({
    id: 'devices.password_policy',
    title: 'Local password rules are strong',
    description: 'Local accounts should require passwords of at least 12 characters and lock after at most 10 failed attempts.',
    severity: 'Medium',
    remediation: 'Windows: set "Minimum password length" to 12+ and "Account lockout threshold" to 10 or fewer (Local Security Policy or Group Policy). Linux: set minlen = 12 in /etc/security/pwquality.conf and configure pam_faillock.',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.3.6'] },
  }, d => {
    if (!known(d.passwordMinLength) && !known(d.lockoutThreshold)) return null;
    const problems: string[] = [];
    if (known(d.passwordMinLength) && d.passwordMinLength < 12) problems.push(`minimum password length is ${d.passwordMinLength}`);
    if (known(d.lockoutThreshold) && (d.lockoutThreshold === 0 || d.lockoutThreshold > 10)) problems.push(d.lockoutThreshold === 0 ? 'accounts never lock after failed attempts' : `accounts lock after ${d.lockoutThreshold} failed attempts`);
    return problems.length ? { pass: false, message: `${problems.join('; ')}.` } : { pass: true, message: 'password and lockout rules meet the baseline.' };
  }),

  {
    id: 'devices.inactive_accounts',
    provider: 'devices',
    title: 'Unused local accounts are disabled',
    description: `Enabled local accounts on servers that have not signed in for ${INACTIVE_DAYS} days should be disabled or removed.`,
    severity: 'Medium',
    remediation: 'Disable or delete the listed accounts (Linux: usermod -L / userdel; Windows: Disable-LocalUser), after checking they are not used by a service.',
    controls: { SOC2: ['CC6.2'], CMMC: ['AC.L1-3.1.1'], PCI: ['8.2.6'] },
    evaluate: inv => {
      if (!inv.devices) return null;
      const now = Date.parse(inv.collectedAt);
      const servers = inv.devices.filter(d => d.role === 'server' && d.localAccounts);
      if (inv.devices.length && !servers.length) return null;
      return servers.flatMap(d => d.localAccounts!.filter(a => a.enabled && a.lastLogin !== undefined).map<ResourceResult>(a => {
        const days = a.lastLogin ? Math.floor((now - Date.parse(a.lastLogin)) / DAY_MS) : null;
        const stale = days === null || days > INACTIVE_DAYS;
        return {
          resourceId: `device:${d.id}/${a.name}`, resourceName: `${a.name} on ${d.hostname}`, status: stale ? 'fail' : 'pass',
          message: days === null ? `${a.name} on ${d.hostname} has never signed in.` : `${a.name} on ${d.hostname} last signed in ${days} day(s) ago.`,
          details: { admin: a.admin },
        };
      }));
    },
  },

  {
    id: 'devices.reporting',
    provider: 'devices',
    title: 'Devices report regularly',
    description: `Each device should send a report at least every ${STALE_REPORT_DAYS} days, so its status is current. Schedule the agent to run daily.`,
    severity: 'Low',
    remediation: 'Run the agent again on the listed devices with the "schedule" option (see Devices > Add a device), or remove devices that were retired.',
    controls: { SOC2: ['CC4.1', 'CC2.1'] },
    evaluate: inv => {
      if (!inv.devices) return null;
      const now = Date.parse(inv.collectedAt);
      return inv.devices.map<ResourceResult>(d => {
        const days = Math.floor((now - Date.parse(d.lastSeenAt)) / DAY_MS);
        return {
          resourceId: `device:${d.id}`, resourceName: d.hostname, status: days > STALE_REPORT_DAYS ? 'fail' : 'pass',
          message: `${d.hostname} last reported ${days === 0 ? 'today' : `${days} day(s) ago`}.`,
        };
      });
    },
  },
];
