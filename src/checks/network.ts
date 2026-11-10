import { ADMIN_PORTS } from './types';

const OPEN_SOURCES = new Set(['0.0.0.0/0', '::/0', '0.0.0.0', '*', 'internet', 'any']);

/** True when a source address / CIDR means "anyone on the internet". */
export function isOpenSource(source: string | undefined | null): boolean {
  if (!source) return false;
  return OPEN_SOURCES.has(source.trim().toLowerCase());
}

/**
 * Parses a port spec ("22", "20-30", "*", "" or undefined for "all") and
 * returns the inclusive range it covers.
 */
export function parsePortRange(spec: string | number | undefined | null): [number, number] {
  if (spec === undefined || spec === null || spec === '' || spec === '*') return [0, 65535];
  if (typeof spec === 'number') return [spec, spec];
  const [a, b] = spec.split('-').map(s => Number.parseInt(s.trim(), 10));
  if (Number.isNaN(a)) return [0, 65535];
  return [a, b === undefined || Number.isNaN(b) ? a : b];
}

/** Which well-known administrative ports (SSH, RDP) fall inside the range. */
export function adminPortsInRange([from, to]: [number, number]): number[] {
  return ADMIN_PORTS.filter(p => p >= from && p <= to);
}

/** Protocol applies to TCP traffic ("all", "-1", "*", "tcp"). */
export function coversTcp(protocol: string | undefined | null): boolean {
  if (!protocol) return true;
  const p = protocol.toLowerCase();
  return p === 'tcp' || p === 'all' || p === '-1' || p === '*' || p === '6';
}
