export type FrameworkId = 'SOC2' | 'CMMC' | 'PCI';

export interface ControlDef {
  /** Identifier as auditors know it, e.g. "CC6.1". */
  id: string;
  title: string;
  /** Plain-language summary of what the control requires. */
  description: string;
  category: string;
  /** What an auditor typically asks to see for this control. */
  evidence: string[];
  /**
   * How long uploaded evidence counts as current. Policies are usually
   * reviewed yearly; access reviews quarterly. Defaults to 365 days.
   */
  freshnessDays?: number;
}

export interface FrameworkDef {
  id: FrameworkId;
  name: string;
  shortName: string;
  version: string;
  description: string;
  /** 'full' = every requirement is in the catalog; 'preview' = core subset. */
  coverage: 'full' | 'preview';
  controls: ControlDef[];
}
