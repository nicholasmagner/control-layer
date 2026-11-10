import type { ControlDef, FrameworkDef } from './types';

/** NIST AI Risk Management Framework 1.0 (AI 100-1): the 19 categories of Govern, Map, Measure and Manage. */

const c = (id: string, category: string, description: string, evidence: string[]): ControlDef =>
  ({ id, title: description.split(/[.:]/)[0], category, description, evidence });

export const NIST_AI_RMF: FrameworkDef = {
  id: 'NISTAIRMF',
  name: 'NIST AI Risk Management Framework',
  shortName: 'NIST AI RMF',
  version: '1.0',
  description: 'A voluntary US framework for identifying and managing the risks of AI systems: Govern, Map, Measure, Manage.',
  coverage: 'full',
  controls: [
    c('GOVERN 1', 'Govern', 'AI risk policies and processes are in place, transparent and followed.', ['Responsible AI policy', 'AI risk management process']),
    c('GOVERN 2', 'Govern', 'Accountability: the right people are empowered, responsible and trained for AI risk.', ['AI roles', 'Training records']),
    c('GOVERN 3', 'Govern', 'Diverse perspectives inform AI risk work.', ['Review participants', 'Stakeholder input']),
    c('GOVERN 4', 'Govern', 'The organization has a culture that considers and communicates AI risk.', ['Communications', 'Reporting channel']),
    c('GOVERN 5', 'Govern', 'Engagement with relevant AI actors and affected parties is in place.', ['Feedback processes']),
    c('GOVERN 6', 'Govern', 'Third-party AI risk: policies cover risks from third-party software, data and models.', ['AI vendor inventory', 'Vendor reviews']),
    c('MAP 1', 'Map', 'Context is established: intended purpose, users, settings and limits.', ['AI system inventory with intended use']),
    c('MAP 2', 'Map', 'AI systems are categorized by tasks, methods and risk.', ['Risk classification per AI system']),
    c('MAP 3', 'Map', 'Capabilities, benefits and costs are understood and compared with alternatives.', ['Business case / benefit analysis']),
    c('MAP 4', 'Map', 'Risks and benefits are mapped for every component, including third-party data and software.', ['Component risk mapping']),
    c('MAP 5', 'Map', 'Impacts on individuals, groups, communities and society are characterized.', ['Impact assessments']),
    c('MEASURE 1', 'Measure', 'Methods and metrics for AI risk are identified and applied.', ['Evaluation metrics']),
    c('MEASURE 2', 'Measure', 'AI systems are evaluated for trustworthiness (validity, safety, security, fairness, privacy, explainability).', ['Evaluation results']),
    c('MEASURE 3', 'Measure', 'AI risks are tracked over time.', ['Risk register entries for AI', 'Monitoring']),
    c('MEASURE 4', 'Measure', 'Feedback on how well measurement works is gathered and used.', ['Measurement reviews']),
    c('MANAGE 1', 'Manage', 'AI risks are prioritized and responded to based on assessments.', ['Risk treatment decisions']),
    c('MANAGE 2', 'Manage', 'Strategies to maximize benefits and minimize harms are planned and implemented.', ['Mitigation plans', 'Fallback / shutdown procedures']),
    c('MANAGE 3', 'Manage', 'Risks from third-party AI are managed.', ['AI vendor risk reviews']),
    c('MANAGE 4', 'Manage', 'Risk treatments, incident response and communication plans are documented and monitored.', ['Incident response plan for AI', 'Risk reviews']),
  ],
};
