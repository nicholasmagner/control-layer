/**
 * Fills a fresh workspace with a realistic demo program for the README
 * screenshots: people who signed policies, vendors with reviews, a risk
 * register, an access review in progress and a customer questionnaire.
 *
 * Run by scripts/screenshots.mjs after the sample data is loaded. Uses the
 * same DATABASE_URL as the running app. Never run it against real data.
 */
import { prisma } from '@/db/prisma';
import { createReview, decide, reviewableSystems } from '@/access/service';
import { adoptTemplates, createSignLinks, acceptPolicies, publishPolicy } from '@/policies/service';
import { POLICY_TEMPLATES } from '@/policies/templates';
import { autoAnswer } from '@/questionnaires/service';
import { questionsFromText } from '@/questionnaires/sheet';
import { acceptRisk, addFromLibrary, completeAssessment } from '@/risks/service';
import { loadTrustConfig, mergeTrustConfig, saveTrustConfig } from '@/trust/config';
import { VENDOR_CATALOG } from '@/vendors/catalog';
import { recordReview, vendorData } from '@/vendors/service';

const ACTOR = process.argv[2] ?? 'maria@acme.example';
const DAY = 86_400_000;

// The first four match accounts in the sample company, so access reviews and
// offboarding checks line up; Sam Rivera has left.
const PEOPLE: { name: string; email: string; title: string; github?: string; left?: number }[] = [
  { name: 'Maria Lopez', email: 'maria@acme.example', title: 'CEO', github: 'maria-lopez' },
  { name: 'Dev Chen', email: 'dev.chen@acme.example', title: 'Senior Engineer', github: 'devchen' },
  { name: 'Priya Natarajan', email: 'priya@acme.example', title: 'Engineering Manager', github: 'priya-n' },
  { name: 'Sam Rivera', email: 'sam.rivera@acme.example', title: 'Engineer', github: 'samr-dev', left: 21 },
  ...['Daniel Kim:CTO', 'Aisha Bello:Engineer', 'Lucas Moreau:Engineer', 'Hannah Weiss:Product Designer', 'Grace Liu:Head of Operations',
    'Noah Fischer:Sales', 'Emma Rossi:Customer Support', 'Owen Clarke:Contractor, Data'].map(x => {
    const [name, title] = x.split(':');
    return { name, title, email: `${name.split(' ')[0].toLowerCase()}@acme.example` };
  }),
];

const VENDORS = ['Amazon Web Services', 'Google Workspace', 'GitHub', 'Slack', 'Stripe', 'OpenAI', 'Datadog', 'Zoom', 'Notion', 'HubSpot', 'Gusto', '1Password'];

const QUESTIONS = `Do you encrypt customer data at rest?
Is data encrypted in transit using TLS 1.2 or higher?
Do you enforce multi-factor authentication for all employees?
Do you have a documented information security policy?
How often do you review user access to production systems?
Do you perform background checks on employees?
Do you have an incident response plan, and how often is it tested?
Do you maintain a business continuity and disaster recovery plan?
How are code changes reviewed before deployment?
Do you scan your code and dependencies for vulnerabilities?
Do you have a vendor risk management program?
Do you use subprocessors to process customer data? Please list them.
Is customer data retained after contract termination? For how long?
Do you log administrative activity, and how long are logs kept?
Do you conduct annual security awareness training?
Have you completed a SOC 2 audit? Please share the report.
Do you use AI or machine learning on customer data?
Are laptops protected with full-disk encryption?
Do you perform regular backups, and are restores tested?
Where is customer data hosted (region)?`;

async function main() {
  // People and policy sign-off
  const people = [];
  for (const [i, p] of PEOPLE.entries()) {
    people.push(await prisma.person.upsert({ where: { email: p.email }, update: {}, create: {
      name: p.name, email: p.email, title: p.title, githubUsername: p.github ?? null,
      startDate: new Date(Date.now() - (500 - i * 30) * DAY), endDate: p.left ? new Date(Date.now() - p.left * DAY) : null,
    } }));
  }
  await adoptTemplates(POLICY_TEMPLATES.map(t => t.slug), ACTOR);
  const policies = await prisma.policy.findMany({ orderBy: { title: 'asc' } });
  for (const p of policies.slice(0, policies.length - 3)) await publishPolicy(p.id, ACTOR);
  const versions = await prisma.policyVersion.findMany({ where: { policy: { requiresSignoff: true } }, select: { id: true } });
  const links = await createSignLinks(people.filter(p => !p.endDate).slice(0, 9).map(p => p.id), 'http://localhost');
  for (const l of links) await acceptPolicies(l.url.split('/sign/')[1], versions.map(v => v.id), l.name, null);

  // Vendors, a few of them reviewed
  for (const name of VENDORS) {
    const c = VENDOR_CATALOG.find(x => x.name === name);
    if (!c || await prisma.vendor.findFirst({ where: { name } })) continue;
    await prisma.vendor.create({ data: vendorData({ name: c.name, website: c.website, category: c.category, dataAccess: c.dataAccess, usesAi: !!c.usesAi, subprocessor: !!c.subprocessor, businessCritical: !!c.critical, owner: ACTOR }) as never });
  }
  const reviewed: [string, string, string][] = [
    ['Amazon Web Services', 'approved', 'low'], ['GitHub', 'approved', 'low'], ['Stripe', 'approved', 'low'],
    ['Slack', 'approved_with_conditions', 'medium'], ['Google Workspace', 'approved', 'low'],
  ];
  // Most vendors have their security report and data processing agreement on file.
  const documented = ['Amazon Web Services', 'Google Workspace', 'GitHub', 'Slack', 'Stripe', 'Datadog', 'Zoom', 'Notion', '1Password', 'Gusto'];
  for (const name of documented) {
    const v = await prisma.vendor.findFirst({ where: { name } });
    if (!v) continue;
    const pdf = Buffer.from('%PDF-1.4\n% Demo document for screenshots\n');
    await prisma.vendorDocument.create({ data: { vendorId: v.id, kind: 'soc2', title: `${name} SOC 2 Type II report`, fileName: 'soc2-report.pdf', mimeType: 'application/pdf', fileSize: pdf.length, fileData: pdf, validUntil: new Date(Date.now() + 240 * DAY), uploadedBy: ACTOR } });
    await prisma.vendor.update({ where: { id: v.id }, data: { dpaSigned: true, baaSigned: ['Amazon Web Services', 'Google Workspace'].includes(name), ...(v.usesAi ? { aiTrainsOnData: false } : {}) } });
  }
  for (const [name, outcome, residualRisk] of reviewed) {
    const v = await prisma.vendor.findFirst({ where: { name } });
    if (v) await recordReview(v.id, { outcome, residualRisk, notes: 'Reviewed the latest SOC 2 Type II report and bridge letter. No exceptions relevant to our use.', checklist: { report: true, dpa: true, mfa: true } }, ACTOR);
  }

  // Risk register
  await addFromLibrary(['account_takeover', 'ransomware', 'vendor_breach', 'cloud_misconfiguration', 'insider_misuse', 'data_loss', 'ai_data_leakage', 'key_person', 'payment_fraud', 'lost_device'], ACTOR);
  const lowRisk = await prisma.risk.findFirst({ where: { libraryKey: 'key_person' } });
  if (lowRisk) await acceptRisk(lowRisk.id, 'Small team; documented runbooks and cross-training planned for next quarter.', new Date(Date.now() + 180 * DAY), ACTOR);
  const controls = await prisma.control.findMany({ include: { scores: { orderBy: { evaluatedAt: 'desc' }, take: 1 } } });
  await completeAssessment(ACTOR, new Map(controls.map(c => [`${c.framework}:${c.controlId}`, !c.applicable ? 'Not Applicable' : c.scores[0]?.status ?? 'Needs Evidence'])));

  // Access review in progress, most accounts already decided
  const systems = await reviewableSystems();
  const review = await createReview({ name: `Q4 ${new Date().getFullYear()} access review`, providers: systems.map(s => s.provider), dueDate: new Date(Date.now() + 14 * DAY) }, ACTOR);
  const reviewId = review;
  const items = await prisma.accessReviewItem.findMany({ where: { reviewId }, orderBy: { name: 'asc' } });
  const flagged = items.filter(i => Array.isArray(i.flags) && (i.flags as string[]).some(f => f === 'left' || f === 'unknown'));
  const rest = items.filter(i => !flagged.includes(i));
  if (flagged.length) await decide(reviewId, flagged.slice(0, 2).map(i => i.id), 'remove', 'No longer with the company.', ACTOR);
  const keep = rest.slice(0, Math.floor(rest.length * 0.7)).map(i => i.id);
  if (keep.length) await decide(reviewId, keep, 'keep', null, ACTOR);

  // A customer security questionnaire, answered from live data
  const questions = questionsFromText(QUESTIONS);
  const q = await prisma.questionnaire.create({
    data: {
      name: 'Vendor security assessment', customer: 'Brightside Clinics', createdBy: ACTOR, dueDate: new Date(Date.now() + 7 * DAY),
      items: { create: questions.map((x, i) => ({ position: i, row: x.row, section: x.section, question: x.question })) },
    },
  });
  await autoAnswer(q.id);

  // Public Trust Center
  const trust = mergeTrustConfig(await loadTrustConfig(), {
    enabled: true, headline: 'Security at Northwind Health', contactEmail: 'security@acme.example',
    description: 'We protect our customers’ health data with continuous monitoring, encryption everywhere, and an independent annual audit.',
    showPractices: true, showPolicies: true, showSubprocessors: true,
    frameworks: [{ id: 'SOC2', status: 'SOC 2 Type II audit in progress' }, { id: 'HIPAA', status: 'HIPAA Security Rule aligned' }],
  });
  await saveTrustConfig(trust, ACTOR);
  console.log('Demo program loaded.');
}

main().then(() => process.exit(0), err => { console.error(err); process.exit(1); });
