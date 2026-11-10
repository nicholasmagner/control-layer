import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '@/checks';
import { CHECK_CROSSWALK, SOC2_CROSSWALK, expandControlKeys } from './crosswalk';
import { FRAMEWORKS, getControlDef } from './index';

describe('framework catalogs', () => {
  it('have unique control ids and complete entries', () => {
    for (const fw of FRAMEWORKS) {
      const ids = fw.controls.map(c => c.id);
      expect(new Set(ids).size, fw.id).toBe(ids.length);
      for (const c of fw.controls) {
        expect(c.title.length, `${fw.id} ${c.id}`).toBeGreaterThan(3);
        expect(c.evidence.length, `${fw.id} ${c.id}`).toBeGreaterThan(0);
      }
    }
    expect(FRAMEWORKS.find(f => f.id === 'ISO27001')!.controls).toHaveLength(93);
    expect(FRAMEWORKS.find(f => f.id === 'ISO42001')!.controls).toHaveLength(38);
    expect(FRAMEWORKS.find(f => f.id === 'NISTAIRMF')!.controls).toHaveLength(19);
  });

  it('crosswalk only points at controls that exist', () => {
    for (const [soc2, targets] of [...Object.entries(SOC2_CROSSWALK), ...Object.entries(CHECK_CROSSWALK)]) {
      expect(getControlDef('SOC2', soc2), soc2).toBeDefined();
      for (const [fw, ids] of Object.entries(targets)) for (const id of ids ?? []) expect(getControlDef(fw, id), `${soc2} -> ${fw} ${id}`).toBeDefined();
    }
  });

  it('expands SOC 2 evidence to the other frameworks', () => {
    const keys = expandControlKeys(['SOC2:CC6.1', 'CMMC:IA.L1-3.5.2']);
    expect(keys).toContain('ISO27001:8.5');
    expect(keys).toContain('HIPAA:164.312(d)');
    expect(keys).toContain('CMMC:IA.L1-3.5.2');
    const mfa = ALL_CHECKS.find(c => c.id === 'aws.iam_user_mfa')!;
    expect(mfa.controls.ISO27001).toContain('8.5');
    const disk = ALL_CHECKS.find(c => c.id === 'devices.disk_encryption')!;
    expect(disk.controls.ISO27001).not.toContain('5.12');
  });
});
