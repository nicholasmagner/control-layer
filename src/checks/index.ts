import type { FrameworkId } from '@/frameworks';
import { expandControlMap } from '@/frameworks/crosswalk';
import { AWS_CHECKS } from './aws';
import { AZURE_CHECKS } from './azure';
import { GCP_CHECKS } from './gcp';
import { GITHUB_CHECKS } from './github';
import { DEVICE_CHECKS } from './devices';
import { AD_CHECKS, GWORKSPACE_CHECKS, M365_CHECKS } from './identity';
import type { CheckDef, Provider } from './types';

export type { CheckDef, Provider, ResourceResult, Severity } from './types';

// Each check is mapped to SOC 2, CMMC and PCI; ISO 27001, HIPAA and GDPR come from the crosswalk.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each provider list is typed against its own inventory
export const ALL_CHECKS: CheckDef<any>[] = [...AWS_CHECKS, ...GCP_CHECKS, ...AZURE_CHECKS, ...GWORKSPACE_CHECKS, ...M365_CHECKS, ...GITHUB_CHECKS, ...AD_CHECKS, ...DEVICE_CHECKS]
  .map(c => ({ ...c, controls: expandControlMap(c.controls) }));

export const PROVIDERS: { id: Provider; name: string; kind: 'cloud' | 'identity' | 'code' | 'onprem' }[] = [
  { id: 'aws', name: 'Amazon Web Services', kind: 'cloud' },
  { id: 'gcp', name: 'Google Cloud', kind: 'cloud' },
  { id: 'azure', name: 'Microsoft Azure', kind: 'cloud' },
  { id: 'gworkspace', name: 'Google Workspace', kind: 'identity' },
  { id: 'm365', name: 'Microsoft 365', kind: 'identity' },
  { id: 'github', name: 'GitHub', kind: 'code' },
  { id: 'devices', name: 'Servers and laptops', kind: 'onprem' },
  { id: 'ad', name: 'Active Directory', kind: 'onprem' },
];

export const PROVIDER_IDS = PROVIDERS.map(p => p.id);

export function checksFor(provider: Provider) {
  return ALL_CHECKS.filter(c => c.provider === provider);
}

export function getCheck(id: string) {
  return ALL_CHECKS.find(c => c.id === id);
}

/** Checks that provide evidence for a given framework control. */
export function checksForControl(framework: FrameworkId, controlId: string) {
  return ALL_CHECKS.filter(c => c.controls[framework]?.includes(controlId));
}

export function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && PROVIDER_IDS.includes(value as Provider);
}
