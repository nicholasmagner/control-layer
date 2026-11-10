import { SOC2 } from './soc2';
import { CMMC } from './cmmc';
import { PCI } from './pci';
import type { ControlDef, FrameworkDef, FrameworkId } from './types';

export type { ControlDef, FrameworkDef, FrameworkId } from './types';

/** Order here is the order shown in the UI. */
export const FRAMEWORKS: FrameworkDef[] = [SOC2, CMMC, PCI];

export const FRAMEWORK_IDS = FRAMEWORKS.map(f => f.id);

export function getFramework(id: string): FrameworkDef | undefined {
  return FRAMEWORKS.find(f => f.id === id);
}

export function getControlDef(framework: string, controlId: string): ControlDef | undefined {
  return getFramework(framework)?.controls.find(c => c.id === controlId);
}

export function isFrameworkId(value: unknown): value is FrameworkId {
  return typeof value === 'string' && FRAMEWORK_IDS.includes(value as FrameworkId);
}

export const DEFAULT_FRESHNESS_DAYS = 365;
