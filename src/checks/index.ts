import type { FrameworkId } from '@/frameworks';
import { AWS_CHECKS } from './aws';
import { AZURE_CHECKS } from './azure';
import { GCP_CHECKS } from './gcp';
import type { CheckDef, Provider } from './types';

export type { CheckDef, Provider, ResourceResult, Severity } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each provider list is typed against its own inventory
export const ALL_CHECKS: CheckDef<any>[] = [...AWS_CHECKS, ...GCP_CHECKS, ...AZURE_CHECKS];

export const PROVIDERS: { id: Provider; name: string }[] = [
  { id: 'aws', name: 'Amazon Web Services' },
  { id: 'gcp', name: 'Google Cloud' },
  { id: 'azure', name: 'Microsoft Azure' },
];

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
  return value === 'aws' || value === 'gcp' || value === 'azure';
}
