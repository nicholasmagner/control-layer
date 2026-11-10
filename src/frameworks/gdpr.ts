import type { ControlDef, FrameworkDef } from './types';

/**
 * GDPR (Regulation (EU) 2016/679): the obligations a small company handling
 * personal data most often has to show, grouped by article.
 */

const c = (id: string, title: string, category: string, description: string, evidence: string[], freshnessDays?: number): ControlDef =>
  ({ id, title, category, description, evidence, ...(freshnessDays ? { freshnessDays } : {}) });

export const GDPR: FrameworkDef = {
  id: 'GDPR',
  name: 'GDPR',
  shortName: 'GDPR',
  version: '2016/679',
  description: 'The EU General Data Protection Regulation: what you must show when you process personal data of people in the EU.',
  coverage: 'preview',
  controls: [
    c('Art. 5', 'Principles of processing', 'Principles', 'Process personal data lawfully, fairly and transparently; for specific purposes; minimized; accurate; kept no longer than needed; secured.', ['Data inventory', 'Retention schedule']),
    c('Art. 6', 'Lawful basis', 'Principles', 'Have a lawful basis (consent, contract, legal obligation, vital interests, public task or legitimate interests) for each processing activity.', ['Records of processing with lawful basis']),
    c('Art. 7', 'Conditions for consent', 'Principles', 'Where you rely on consent, be able to show it was given and can be withdrawn.', ['Consent records', 'Consent withdrawal mechanism']),
    c('Art. 12-14', 'Transparency and privacy notices', 'Rights of individuals', 'Tell people clearly what you do with their data.', ['Privacy notice']),
    c('Art. 15-22', 'Data subject rights', 'Rights of individuals', 'Handle requests to access, correct, delete, restrict, port or object to processing, within one month.', ['Request handling procedure', 'Request log']),
    c('Art. 24', 'Responsibility of the controller', 'Accountability', 'Implement and be able to show appropriate measures, including policies.', ['Data protection policy', 'Published policies']),
    c('Art. 25', 'Data protection by design and by default', 'Accountability', 'Build privacy into systems and only process what is needed by default.', ['Privacy review in product development']),
    c('Art. 27', 'EU representative', 'Accountability', 'Companies outside the EU that serve people in the EU may need an EU representative.', ['Representative appointment, if required']),
    c('Art. 28', 'Processors', 'Third parties', 'Use only processors with sufficient guarantees, under a written data processing agreement.', ['Vendor inventory', 'Signed DPAs', 'Vendor reviews']),
    c('Art. 30', 'Records of processing activities', 'Accountability', 'Keep a record of processing activities.', ['Records of processing (ROPA)']),
    c('Art. 32', 'Security of processing', 'Security', 'Use appropriate technical and organizational security: encryption, confidentiality, resilience, restore ability, and regular testing.', ['Security controls status', 'Encryption settings', 'Backups', 'Access control']),
    c('Art. 33', 'Breach notification to the authority', 'Breaches', 'Notify the supervisory authority within 72 hours of becoming aware of a personal data breach, unless unlikely to result in risk.', ['Incident response plan with 72-hour notification', 'Breach log']),
    c('Art. 34', 'Communicating a breach to individuals', 'Breaches', 'Tell affected people without undue delay when a breach is likely to result in high risk.', ['Breach communication procedure']),
    c('Art. 35', 'Data protection impact assessment', 'Accountability', 'Assess impact before high-risk processing (for example large-scale sensitive data, profiling, or new technologies such as AI).', ['DPIAs for high-risk processing']),
    c('Art. 37-39', 'Data protection officer', 'Accountability', 'Appoint a DPO where required (core activities of large-scale monitoring or special category data).', ['DPO appointment or documented decision not to appoint']),
    c('Art. 44-49', 'International transfers', 'Third parties', 'Transfer personal data outside the EEA only with safeguards (adequacy, standard contractual clauses).', ['Transfer register', 'SCCs with vendors']),
  ],
};
