import type { FrameworkId } from './types';

/**
 * Crosswalk from SOC 2 criteria to the equivalent ISO 27001, HIPAA and GDPR
 * controls. Checks, policies and other evidence are mapped to SOC 2 once and
 * count toward these frameworks automatically. It is a practical mapping for
 * evidence reuse, not an official equivalence.
 */
export const SOC2_CROSSWALK: Record<string, Partial<Record<FrameworkId, string[]>>> = {
  'CC1.1': { ISO27001: ['5.4', '6.2', '6.4'], HIPAA: ['164.308(a)(1)(ii)(C)'] },
  'CC1.2': { ISO27001: ['5.4'] },
  'CC1.3': { ISO27001: ['5.2'], HIPAA: ['164.308(a)(2)'] },
  'CC1.4': { ISO27001: ['6.1', '6.3'], HIPAA: ['164.308(a)(3)(ii)(B)'] },
  'CC1.5': { ISO27001: ['5.4', '6.4'], HIPAA: ['164.308(a)(1)(ii)(C)'] },
  'CC2.1': { ISO27001: ['5.9', '5.37'] },
  'CC2.2': { ISO27001: ['5.1', '5.10', '6.3'], HIPAA: ['164.308(a)(5)(ii)(A)', '164.316(b)(1)'], GDPR: ['Art. 24'] },
  'CC2.3': { ISO27001: ['5.5', '6.8'], GDPR: ['Art. 12-14'] },
  'CC3.1': { ISO27001: ['5.31'] },
  'CC3.2': { ISO27001: ['5.7'], HIPAA: ['164.308(a)(1)(ii)(A)'], GDPR: ['Art. 32', 'Art. 35'] },
  'CC3.3': { HIPAA: ['164.308(a)(1)(ii)(A)'] },
  'CC3.4': { ISO27001: ['5.8'], HIPAA: ['164.308(a)(1)(ii)(A)'] },
  'CC4.1': { ISO27001: ['5.35', '5.36'], HIPAA: ['164.308(a)(8)'] },
  'CC4.2': { ISO27001: ['5.36'], HIPAA: ['164.308(a)(1)(ii)(B)'] },
  'CC5.1': { ISO27001: ['5.36'], HIPAA: ['164.308(a)(1)(ii)(B)'] },
  'CC5.2': { ISO27001: ['8.9'] },
  'CC5.3': { ISO27001: ['5.1', '5.37'], HIPAA: ['164.316(b)(1)'], GDPR: ['Art. 24'] },
  'CC6.1': { ISO27001: ['5.15', '5.17', '8.2', '8.3', '8.5', '8.24'], HIPAA: ['164.312(a)(2)(i)', '164.312(a)(2)(iv)', '164.312(d)', '164.308(a)(5)(ii)(D)'], GDPR: ['Art. 32'] },
  'CC6.2': { ISO27001: ['5.16', '5.18'], HIPAA: ['164.308(a)(3)(ii)(C)', '164.308(a)(4)(ii)(B)'] },
  'CC6.3': { ISO27001: ['5.18', '8.2'], HIPAA: ['164.308(a)(4)(ii)(C)'] },
  'CC6.4': { ISO27001: ['7.1', '7.2', '7.3'], HIPAA: ['164.310(a)(1)'] },
  'CC6.5': { ISO27001: ['7.10', '7.14', '8.10'], HIPAA: ['164.310(d)(1)'] },
  'CC6.6': { ISO27001: ['8.20', '8.21', '8.22'], GDPR: ['Art. 32'] },
  'CC6.7': { ISO27001: ['5.14', '8.24', '8.12'], HIPAA: ['164.312(e)(1)'], GDPR: ['Art. 32'] },
  'CC6.8': { ISO27001: ['8.1', '8.7', '8.19'], HIPAA: ['164.308(a)(5)(ii)(B)', '164.310(c)'] },
  'CC7.1': { ISO27001: ['8.8', '8.9'], HIPAA: ['164.308(a)(1)(ii)(B)'] },
  'CC7.2': { ISO27001: ['8.15', '8.16', '8.17'], HIPAA: ['164.312(b)', '164.308(a)(1)(ii)(D)', '164.308(a)(5)(ii)(C)'] },
  'CC7.3': { ISO27001: ['5.25', '5.28'], HIPAA: ['164.308(a)(6)(ii)'], GDPR: ['Art. 33'] },
  'CC7.4': { ISO27001: ['5.24', '5.26'], HIPAA: ['164.308(a)(6)(ii)'], GDPR: ['Art. 33', 'Art. 34'] },
  'CC7.5': { ISO27001: ['5.27'] },
  'CC8.1': { ISO27001: ['8.25', '8.29', '8.31', '8.32', '8.4'] },
  'CC9.1': { ISO27001: ['5.29', '5.30'], HIPAA: ['164.308(a)(7)(ii)(C)'] },
  'CC9.2': { ISO27001: ['5.19', '5.20', '5.21', '5.22', '5.23'], HIPAA: ['164.308(b)(1)'], GDPR: ['Art. 28', 'Art. 44-49'] },
  'A1.1': { ISO27001: ['8.6', '8.14'] },
  'A1.2': { ISO27001: ['8.13', '5.30'], HIPAA: ['164.308(a)(7)(ii)(A)', '164.308(a)(7)(ii)(B)'] },
  'A1.3': { ISO27001: ['5.30'], HIPAA: ['164.308(a)(7)(ii)(D)'] },
  'C1.1': { ISO27001: ['5.33'], HIPAA: ['164.312(a)(2)(iv)'], GDPR: ['Art. 5', 'Art. 32'] },
  'C1.2': { ISO27001: ['8.10', '7.14'], GDPR: ['Art. 5'] },
};

/**
 * Narrower crosswalk for automated checks: a configuration check proves a
 * technical control, not the policy or process controls around it.
 */
export const CHECK_CROSSWALK: Record<string, Partial<Record<FrameworkId, string[]>>> = {
  'CC6.1': { ISO27001: ['8.2', '8.3', '8.5', '8.24'], HIPAA: ['164.312(a)(2)(i)', '164.312(a)(2)(iv)', '164.312(d)'], GDPR: ['Art. 32'] },
  'CC6.2': { ISO27001: ['5.16', '5.18'], HIPAA: ['164.308(a)(3)(ii)(C)'] },
  'CC6.3': { ISO27001: ['5.18', '8.2'], HIPAA: ['164.308(a)(4)(ii)(C)'] },
  'CC6.6': { ISO27001: ['8.20', '8.21', '8.22'], GDPR: ['Art. 32'] },
  'CC6.7': { ISO27001: ['8.12', '8.24'], HIPAA: ['164.312(e)(1)'], GDPR: ['Art. 32'] },
  'CC6.8': { ISO27001: ['8.1', '8.7'], HIPAA: ['164.308(a)(5)(ii)(B)', '164.310(c)'] },
  'CC7.1': { ISO27001: ['8.8', '8.9'] },
  'CC7.2': { ISO27001: ['8.15', '8.16', '8.17'], HIPAA: ['164.312(b)'] },
  'CC8.1': { ISO27001: ['8.4', '8.32'] },
  'A1.2': { ISO27001: ['8.13'], HIPAA: ['164.308(a)(7)(ii)(A)'] },
  'C1.1': { ISO27001: ['8.24'], HIPAA: ['164.312(a)(2)(iv)'], GDPR: ['Art. 32'] },
};

/** Expands control keys ("SOC2:CC6.1") with their crosswalked equivalents. */
export function expandControlKeys(keys: string[], table = SOC2_CROSSWALK): string[] {
  const out = new Set(keys);
  for (const key of keys) {
    const [fw, id] = key.split(':');
    if (fw !== 'SOC2') continue;
    for (const [other, ids] of Object.entries(table[id] ?? {})) for (const x of ids ?? []) out.add(`${other}:${x}`);
  }
  return [...out];
}

/** Adds crosswalked controls to a check's per-framework mapping. */
export function expandControlMap(controls: Partial<Record<FrameworkId, string[]>>): Partial<Record<FrameworkId, string[]>> {
  const keys = Object.entries(controls).flatMap(([fw, ids]) => (ids ?? []).map(id => `${fw}:${id}`));
  const out: Partial<Record<FrameworkId, string[]>> = {};
  for (const key of expandControlKeys(keys, CHECK_CROSSWALK)) {
    const i = key.indexOf(':');
    const fw = key.slice(0, i) as FrameworkId;
    (out[fw] ??= []).push(key.slice(i + 1));
  }
  return out;
}
