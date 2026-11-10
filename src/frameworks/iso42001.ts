import type { ControlDef, FrameworkDef } from './types';

/**
 * ISO/IEC 42001:2023, artificial intelligence management system (AIMS):
 * the 38 Annex A controls, summarized in plain language. For companies that
 * build, provide or use AI systems.
 */

const c = (id: string, title: string, category: string, description: string, evidence: string[]): ControlDef => ({ id, title, category, description, evidence });

export const ISO42001: FrameworkDef = {
  id: 'ISO42001',
  name: 'ISO/IEC 42001:2023 (AI)',
  shortName: 'ISO 42001',
  version: '2023',
  description: 'The international standard for managing AI responsibly: policy, impact assessment, data, life cycle and third parties.',
  coverage: 'full',
  controls: [
    c('A.2.2', 'AI policy', 'Policies related to AI', 'Document a policy for developing and using AI systems.', ['Responsible AI policy']),
    c('A.2.3', 'Alignment with other organizational policies', 'Policies related to AI', 'Make sure other policies (security, privacy, quality) account for AI.', ['Policy cross-references']),
    c('A.2.4', 'Review of the AI policy', 'Policies related to AI', 'Review the AI policy at planned intervals.', ['Policy review records']),
    c('A.3.2', 'AI roles and responsibilities', 'Internal organization', 'Define and assign roles and responsibilities for AI.', ['AI owner per system', 'RACI']),
    c('A.3.3', 'Reporting of concerns', 'Internal organization', 'A way for people to report concerns about AI systems.', ['Reporting channel']),
    c('A.4.2', 'Resource documentation', 'Resources for AI systems', 'Identify and document the resources each AI system needs.', ['AI system inventory']),
    c('A.4.3', 'Data resources', 'Resources for AI systems', 'Document the data used by AI systems.', ['Data sources per AI system']),
    c('A.4.4', 'Tooling resources', 'Resources for AI systems', 'Document the tools used for AI systems.', ['AI tools and vendors list']),
    c('A.4.5', 'System and computing resources', 'Resources for AI systems', 'Document the computing resources used.', ['Infrastructure inventory']),
    c('A.4.6', 'Human resources', 'Resources for AI systems', 'Document the people and skills needed.', ['Roles and training']),
    c('A.5.2', 'AI system impact assessment process', 'Assessing impacts', 'A process to assess potential consequences of AI systems for people and society.', ['Impact assessment procedure']),
    c('A.5.3', 'Documentation of AI system impact assessments', 'Assessing impacts', 'Document and keep impact assessment results.', ['Completed impact assessments']),
    c('A.5.4', 'Assessing AI system impact on individuals or groups', 'Assessing impacts', 'Assess impacts on individuals and groups of individuals.', ['Impact assessments covering fairness, privacy, safety']),
    c('A.5.5', 'Assessing societal impacts of AI systems', 'Assessing impacts', 'Assess broader societal impacts.', ['Societal impact section in assessments']),
    c('A.6.1.2', 'Objectives for responsible development of AI system', 'AI system life cycle', 'Set objectives for responsible AI development and integrate them.', ['Development objectives']),
    c('A.6.1.3', 'Processes for responsible AI system design and development', 'AI system life cycle', 'Define processes for responsible design and development.', ['Development process with review gates']),
    c('A.6.2.2', 'AI system requirements and specification', 'AI system life cycle', 'Specify requirements for new AI systems or changes.', ['Requirements documents']),
    c('A.6.2.3', 'Documentation of AI system design and development', 'AI system life cycle', 'Document design and development decisions.', ['Design documents']),
    c('A.6.2.4', 'AI system verification and validation', 'AI system life cycle', 'Verify and validate AI systems against criteria before release.', ['Evaluation results', 'Test reports']),
    c('A.6.2.5', 'AI system deployment', 'AI system life cycle', 'Plan deployment and check requirements are met.', ['Deployment approval']),
    c('A.6.2.6', 'AI system operation and monitoring', 'AI system life cycle', 'Monitor AI systems in operation, including errors and failures.', ['Monitoring dashboards', 'Incident records']),
    c('A.6.2.7', 'AI system technical documentation', 'AI system life cycle', 'Provide technical documentation to relevant parties.', ['Model / system cards']),
    c('A.6.2.8', 'AI system recording of event logs', 'AI system life cycle', 'Keep event logs for AI systems.', ['Logging configuration']),
    c('A.7.2', 'Data for development and enhancement of AI system', 'Data for AI systems', 'Manage data used to develop and improve AI systems.', ['Data management procedure']),
    c('A.7.3', 'Acquisition of data', 'Data for AI systems', 'Record how data is obtained and selected.', ['Data acquisition records', 'Licenses / consent']),
    c('A.7.4', 'Quality of data for AI systems', 'Data for AI systems', 'Define and check data quality requirements.', ['Data quality checks']),
    c('A.7.5', 'Data provenance', 'Data for AI systems', 'Record where data comes from over its life cycle.', ['Provenance records']),
    c('A.7.6', 'Data preparation', 'Data for AI systems', 'Define and document how data is prepared.', ['Preparation steps']),
    c('A.8.2', 'System documentation and information for users', 'Information for interested parties', 'Give users the information they need about AI systems.', ['User documentation', 'AI disclosures']),
    c('A.8.3', 'External reporting', 'Information for interested parties', 'Let interested parties report adverse impacts.', ['External reporting channel']),
    c('A.8.4', 'Communication of incidents', 'Information for interested parties', 'Plan how to communicate AI incidents to users.', ['Incident communication plan']),
    c('A.8.5', 'Information for interested parties', 'Information for interested parties', 'Determine and meet obligations to report AI information to others.', ['Reporting obligations register']),
    c('A.9.2', 'Processes for responsible use of AI systems', 'Use of AI systems', 'Define processes for using AI systems responsibly.', ['AI acceptable use rules']),
    c('A.9.3', 'Objectives for responsible use of AI system', 'Use of AI systems', 'Set objectives for responsible use.', ['Use objectives']),
    c('A.9.4', 'Intended use of the AI system', 'Use of AI systems', 'Use AI systems as intended and documented.', ['Intended use documented per system']),
    c('A.10.2', 'Allocating responsibilities', 'Third-party and customer relationships', 'Allocate AI responsibilities between you, partners, suppliers and customers.', ['Contracts / responsibility matrix']),
    c('A.10.3', 'Suppliers', 'Third-party and customer relationships', 'Make sure AI suppliers\' services align with your approach to responsible AI.', ['AI vendor reviews']),
    c('A.10.4', 'Customers', 'Third-party and customer relationships', 'Consider customer expectations and needs for responsible AI.', ['Customer terms on AI use']),
  ],
};
