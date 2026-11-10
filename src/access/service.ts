import { HttpError } from '@/auth/session';
import { controlIdsForKeys, recomputeAssessments } from '@/assessment/engine';
import { prisma } from '@/db/prisma';
import { csv } from '@/evidence/package';
import { anchorChain, appendEvidence } from '@/evidence/store';
import { logEvent } from '@/lib/events';
import { getSettings } from '@/lib/settings';
import { policyHtmlDocument } from '@/policies/markdown';
import { parseCsv } from '@/questionnaires/sheet';
import { accountFlags, FLAG_LABEL, SYSTEM_NAMES } from './accounts';

export const ACCESS_REVIEW_CONTROLS = ['SOC2:CC6.2', 'SOC2:CC6.3', 'CMMC:AC.L1-3.1.1', 'CMMC:AC.L1-3.1.2', 'PCI:7.2.4', 'PCI:8.2.6', 'ISO27001:5.18', 'ISO27001:8.2', 'HIPAA:164.308(a)(4)(ii)(C)'];
export const REVIEW_EVERY_DAYS = 90;
const DECISIONS = new Set(['keep', 'remove', 'change', 'pending']);
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');

/** Systems you can review, from the latest scans (or the sample company). */
export async function reviewableSystems() {
  const rows = await prisma.systemAccount.groupBy({ by: ['provider', 'isSample'], _count: true, _max: { seenAt: true }, where: { active: true } });
  const real = new Set(rows.filter(r => !r.isSample).map(r => r.provider));
  return rows.filter(r => !r.isSample || !real.has(r.provider)).map(r => ({
    provider: r.provider, name: SYSTEM_NAMES[r.provider] ?? r.provider, accounts: r._count, sample: r.isSample, seenAt: iso(r._max.seenAt),
  }));
}

export async function accessData() {
  const [systems, reviews, counts] = await Promise.all([
    reviewableSystems(),
    prisma.accessReview.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.accessReviewItem.groupBy({ by: ['reviewId', 'decision'], _count: true }),
  ]);
  const lastDone = reviews.find(r => r.status === 'completed' && r.completedAt);
  return {
    systems,
    nextDue: lastDone ? new Date(lastDone.completedAt!.getTime() + REVIEW_EVERY_DAYS * 86_400_000).toISOString() : null,
    reviews: reviews.map(r => {
      const c = counts.filter(x => x.reviewId === r.id);
      const n = (d?: string) => c.filter(x => !d || x.decision === d).reduce((t, x) => t + x._count, 0);
      return {
        id: r.id, name: r.name, status: r.status, dueDate: iso(r.dueDate), createdAt: r.createdAt.toISOString(), createdBy: r.createdBy,
        completedAt: iso(r.completedAt), completedBy: r.completedBy, total: n(), pending: n('pending'), remove: n('remove'), change: n('change'),
      };
    }),
  };
}

export async function createReview(input: { name: string; providers: string[]; dueDate: Date | null; extra?: { system: string; csv: string } }, actor: string) {
  const systems = await reviewableSystems();
  const chosen = systems.filter(s => input.providers.includes(s.provider));
  if (!chosen.length && !input.extra) throw new HttpError(400, 'Choose at least one system to review.');
  const [accounts, people] = await Promise.all([
    prisma.systemAccount.findMany({ where: { active: true, OR: chosen.map(s => ({ provider: s.provider, isSample: s.sample })) }, orderBy: [{ provider: 'asc' }, { name: 'asc' }] }),
    prisma.person.findMany({ select: { name: true, email: true, githubUsername: true, endDate: true } }),
  ]);
  const now = new Date();
  const items = accounts.map(a => {
    const { flags, person } = accountFlags(a, people, now);
    return {
      provider: a.provider, system: a.system, accountId: a.accountId, name: a.name, email: a.email, isAdmin: a.isAdmin,
      lastActivity: a.lastActivity, detail: a.detail, flags, personName: person?.name ?? null,
    };
  });
  if (input.extra) {
    const rows = parseCsv(input.extra.csv).filter(r => r.some(Boolean));
    const header = rows[0]?.map(h => h.toLowerCase()) ?? [];
    const col = (...n: string[]) => header.findIndex(h => n.some(x => h.includes(x)));
    const iName = col('name', 'user'), iEmail = col('email', 'mail'), iRole = col('role', 'admin', 'permission', 'group'), iLast = col('last', 'login', 'activity');
    if (iName < 0 && iEmail < 0) throw new HttpError(400, 'The CSV needs a header row with a name or email column.');
    for (const r of rows.slice(1, 5001)) {
      const email = iEmail >= 0 ? r[iEmail]?.toLowerCase() || null : null;
      const name = (iName >= 0 ? r[iName] : '') || email || '';
      if (!name) continue;
      const role = iRole >= 0 ? r[iRole] ?? '' : '';
      const last = iLast >= 0 && r[iLast] ? new Date(r[iLast]) : null;
      const lastActivity = last && !Number.isNaN(last.getTime()) ? last : null;
      const isAdmin = /admin|owner|super/i.test(role);
      const { flags, person } = accountFlags({ provider: 'csv', name, email, isAdmin, lastActivity, active: true }, people, now);
      items.push({
        provider: 'csv', system: input.extra.system.slice(0, 100) || 'Other system', accountId: email ?? name, name, email, isAdmin, lastActivity,
        detail: role || null, flags: email && people.length && !person ? [...new Set([...flags, 'unknown'])] : flags, personName: person?.name ?? null,
      });
    }
  }
  if (!items.length) throw new HttpError(400, 'No accounts were found in the chosen systems.');
  const review = await prisma.accessReview.create({
    data: {
      name: input.name, dueDate: input.dueDate, createdBy: actor,
      systems: [...chosen.map(s => s.name), ...(input.extra ? [input.extra.system] : [])],
      items: { create: items.map(i => ({ ...i, flags: i.flags })) },
    },
  });
  await logEvent({ action: 'Access review started', actor, decision: 'Started', resource: input.name, reason: `${items.length} accounts` });
  return review.id;
}

export async function getReview(id: string) {
  const r = await prisma.accessReview.findUnique({ where: { id }, include: { items: { orderBy: [{ system: 'asc' }, { name: 'asc' }] } } });
  if (!r) throw new HttpError(404, 'Access review not found.');
  // Removal follow-up: does the latest scan still see accounts marked for removal?
  const removing = r.items.filter(i => i.decision === 'remove' && i.provider !== 'csv');
  const current = removing.length
    ? await prisma.systemAccount.findMany({ where: { OR: removing.map(i => ({ provider: i.provider, accountId: i.accountId })) }, select: { provider: true, accountId: true, active: true, seenAt: true } })
    : [];
  const lastSeen = await prisma.systemAccount.groupBy({ by: ['provider'], _max: { seenAt: true } });
  return {
    id: r.id, name: r.name, status: r.status, dueDate: iso(r.dueDate), systems: r.systems as string[], createdAt: r.createdAt.toISOString(), createdBy: r.createdBy,
    completedAt: iso(r.completedAt), completedBy: r.completedBy, evidenceId: r.evidenceId,
    items: r.items.map(i => {
      let removal: 'removed' | 'still_active' | 'not_rescanned' | null = null;
      if (i.decision === 'remove') {
        if (i.provider === 'csv') removal = null;
        else {
          const scanned = lastSeen.find(x => x.provider === i.provider)?._max.seenAt;
          const seen = current.find(c => c.provider === i.provider && c.accountId === i.accountId);
          if (!scanned || !i.decidedAt || scanned < i.decidedAt) removal = 'not_rescanned';
          else removal = seen?.active ? 'still_active' : 'removed';
        }
      }
      return {
        id: i.id, provider: i.provider, system: i.system, accountId: i.accountId, name: i.name, email: i.email, isAdmin: i.isAdmin,
        lastActivity: iso(i.lastActivity), detail: i.detail, flags: i.flags as string[], personName: i.personName,
        decision: i.decision, note: i.note, decidedBy: i.decidedBy, decidedAt: iso(i.decidedAt), removal,
      };
    }),
  };
}

export async function decide(reviewId: string, itemIds: string[], decision: string, note: string | null, actor: string) {
  if (!DECISIONS.has(decision)) throw new HttpError(400, 'Unknown decision.');
  const review = await prisma.accessReview.findUnique({ where: { id: reviewId }, select: { status: true } });
  if (!review) throw new HttpError(404, 'Access review not found.');
  if (review.status === 'completed') throw new HttpError(409, 'This review is completed. Start a new one to change decisions.');
  if (decision === 'change' && !note) throw new HttpError(400, 'Say what should change (for example "remove admin rights").');
  const res = await prisma.accessReviewItem.updateMany({
    where: { reviewId, id: { in: itemIds.slice(0, 5000) } },
    data: { decision, note: note || undefined, decidedBy: decision === 'pending' ? null : actor, decidedAt: decision === 'pending' ? null : new Date() },
  });
  return res.count;
}

/** Completes a review: every account decided, and the record saved as evidence. */
export async function completeReview(id: string, actor: string) {
  const r = await getReview(id);
  if (r.status === 'completed') throw new HttpError(409, 'Already completed.');
  const pending = r.items.filter(i => i.decision === 'pending').length;
  if (pending) throw new HttpError(400, `${pending} account${pending === 1 ? '' : 's'} still need a decision.`);
  const settings = await getSettings();
  const now = new Date();
  const label = (d: string) => ({ keep: 'Keep', remove: 'Remove', change: 'Change' } as Record<string, string>)[d] ?? d;
  const removals = r.items.filter(i => i.decision === 'remove');
  const changes = r.items.filter(i => i.decision === 'change');
  const bySystem = [...new Set(r.items.map(i => i.system))];
  const md = `# User access review: ${r.name}

| | |
| :--- | :--- |
| Organization | ${settings.organizationName} |
| Systems | ${bySystem.join(', ')} |
| Accounts reviewed | ${r.items.length} |
| Kept | ${r.items.filter(i => i.decision === 'keep').length} |
| To remove | ${removals.length} |
| To change | ${changes.length} |
| Started | ${r.createdAt.slice(0, 10)} by ${r.createdBy} |
| Completed | ${now.toISOString().slice(0, 10)} by ${actor} |

## Accounts to remove
${removals.length ? removals.map(i => `- ${i.name}${i.email && i.email !== i.name ? ` (${i.email})` : ''} in ${i.system}${i.note ? `: ${i.note}` : ''}`).join('\n') : '- None'}

## Access to change
${changes.length ? changes.map(i => `- ${i.name} in ${i.system}: ${i.note}`).join('\n') : '- None'}

## All decisions
| System | Account | Owner | Admin | Last activity | Flags | Decision | Decided by |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${r.items.map(i => `| ${cell(i.system)} | ${cell(i.email ?? i.name)} | ${cell(i.personName ?? '')} | ${i.isAdmin ? 'Yes' : ''} | ${i.lastActivity?.slice(0, 10) ?? 'never / unknown'} | ${i.flags.map(f => FLAG_LABEL[f] ?? f).join(', ')} | ${label(i.decision)}${i.note ? `: ${cell(i.note)}` : ''} | ${i.decidedBy ?? ''} |`).join('\n')}
`;
  const html = policyHtmlDocument(`Access review: ${r.name}`, md, `${settings.organizationName} · access review completed in ControlLayer by ${actor} on ${now.toISOString()}`);
  const evidence = await appendEvidence({
    title: `User access review: ${r.name}`,
    description: `${r.items.length} accounts in ${bySystem.length} system(s); ${removals.length} to remove, ${changes.length} to change.`,
    kind: 'upload', source: `access-review:${id}`,
    file: { name: `access-review-${now.toISOString().slice(0, 10)}.html`, mimeType: 'text/html', data: new TextEncoder().encode(html) },
    controlIds: await controlIdsForKeys(ACCESS_REVIEW_CONTROLS),
    collectedBy: actor,
  });
  await appendEvidence({
    title: `User access review decisions: ${r.name} (CSV)`, kind: 'upload', source: `access-review:${id}`,
    file: {
      name: `access-review-${now.toISOString().slice(0, 10)}.csv`, mimeType: 'text/csv',
      data: new TextEncoder().encode(csv([
        ['System', 'Account', 'Email', 'Owner', 'Admin', 'Last activity', 'Flags', 'Decision', 'Note', 'Decided by', 'Decided at'],
        ...r.items.map(i => [i.system, i.name, i.email, i.personName, i.isAdmin ? 'Yes' : 'No', i.lastActivity, i.flags.map(f => FLAG_LABEL[f] ?? f).join('; '), label(i.decision), i.note, i.decidedBy, i.decidedAt]),
      ])),
    },
    controlIds: await controlIdsForKeys(ACCESS_REVIEW_CONTROLS),
    collectedBy: actor,
  });
  await prisma.accessReview.update({ where: { id }, data: { status: 'completed', completedAt: now, completedBy: actor, evidenceId: evidence.id } });
  await recomputeAssessments();
  void anchorChain(actor).catch(err => console.error('[timestamp]', err));
  await logEvent({ action: 'Access review completed', actor, decision: 'Completed', resource: r.name, reason: `${r.items.length} accounts; ${removals.length} to remove` });
}
