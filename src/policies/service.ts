import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '@/auth/session';
import { recomputeAssessments } from '@/assessment/engine';
import { prisma } from '@/db/prisma';
import { anchorChain, appendEvidence } from '@/evidence/store';
import { sha256Hex } from '@/evidence/hash';
import { logEvent } from '@/lib/events';
import { getSettings } from '@/lib/settings';
import { policyHtmlDocument } from './markdown';
import { POLICY_TEMPLATES, renderTemplate } from './templates';

const DAY = 86_400_000;

export const hashSignToken = (token: string) => createHash('sha256').update(token).digest('hex');

export interface PolicyView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  draft: string;
  owner: string | null;
  reviewIntervalDays: number;
  requiresSignoff: boolean;
  controls: string[];
  updatedAt: string;
  latest: { id: string; version: number; publishedAt: string; publishedBy: string; sha256: string; evidenceId: string | null; content: string } | null;
  /** The draft differs from the latest published version. */
  unpublishedChanges: boolean;
  reviewDue: string | null;
  overdue: boolean;
  /** Active people who accepted the latest version / who need to. */
  accepted: number;
  required: number;
}

export interface PersonView {
  id: string;
  name: string;
  email: string;
  title: string | null;
  githubUsername: string | null;
  source: string;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  hasLink: boolean;
  /** Published policies needing sign-off that this person hasn't accepted (latest version). */
  pending: { policyId: string; title: string }[];
  accepted: number;
  lastAcceptedAt: string | null;
}

export interface PoliciesData {
  policies: PolicyView[];
  people: PersonView[];
  templates: { slug: string; title: string; summary: string; controls: string[]; adopted: boolean }[];
}

export async function policiesData(): Promise<PoliciesData> {
  const [policies, people] = await Promise.all([
    prisma.policy.findMany({
      orderBy: { title: 'asc' },
      include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { acknowledgments: { select: { personId: true } } } } },
    }),
    prisma.person.findMany({
      orderBy: [{ endDate: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
      include: { acknowledgments: { select: { versionId: true, acceptedAt: true } } },
    }),
  ]);
  const now = Date.now();
  const active = people.filter(p => isActive(p.endDate));
  const activeIds = new Set(active.map(p => p.id));

  const policyViews: PolicyView[] = policies.map(p => {
    const latest = p.versions[0];
    const signers = new Set(latest?.acknowledgments.map(a => a.personId) ?? []);
    const reviewDue = latest ? new Date(latest.publishedAt.getTime() + p.reviewIntervalDays * DAY) : null;
    return {
      id: p.id, slug: p.slug, title: p.title, summary: p.summary, draft: p.draft, owner: p.owner,
      reviewIntervalDays: p.reviewIntervalDays, requiresSignoff: p.requiresSignoff,
      controls: Array.isArray(p.controls) ? (p.controls as string[]) : [],
      updatedAt: p.updatedAt.toISOString(),
      latest: latest ? {
        id: latest.id, version: latest.version, publishedAt: latest.publishedAt.toISOString(), publishedBy: latest.publishedBy,
        sha256: latest.sha256, evidenceId: latest.evidenceId, content: latest.content,
      } : null,
      unpublishedChanges: !latest || publishedText(p.draft, latest.publishedAt) !== latest.content,
      reviewDue: reviewDue?.toISOString() ?? null,
      overdue: !!reviewDue && reviewDue.getTime() < now,
      accepted: [...signers].filter(id => activeIds.has(id)).length,
      required: latest && p.requiresSignoff ? active.length : 0,
    };
  });

  const needSignoff = policyViews.filter(p => p.latest && p.requiresSignoff);
  const personViews: PersonView[] = people.map(person => {
    const signed = new Set(person.acknowledgments.map(a => a.versionId));
    const last = person.acknowledgments.reduce<Date | null>((m, a) => (!m || a.acceptedAt > m ? a.acceptedAt : m), null);
    const isOn = isActive(person.endDate);
    return {
      id: person.id, name: person.name, email: person.email, title: person.title, githubUsername: person.githubUsername,
      source: person.source, startDate: person.startDate?.toISOString() ?? null, endDate: person.endDate?.toISOString() ?? null,
      active: isOn, hasLink: !!person.signTokenHash,
      pending: isOn ? needSignoff.filter(p => !signed.has(p.latest!.id)).map(p => ({ policyId: p.id, title: p.title })) : [],
      accepted: needSignoff.filter(p => signed.has(p.latest!.id)).length,
      lastAcceptedAt: last?.toISOString() ?? null,
    };
  });

  const adopted = new Set(policies.map(p => p.slug));
  return {
    policies: policyViews,
    people: personViews,
    templates: POLICY_TEMPLATES.map(t => ({ slug: t.slug, title: t.title, summary: t.summary, controls: t.controls, adopted: adopted.has(t.slug) })),
  };
}

const isActive = (endDate: Date | null) => !endDate || endDate.getTime() > Date.now();

/** The text that gets published: the draft with the effective date filled in. */
export function publishedText(draft: string, effective: Date) {
  return draft.replaceAll('{{effective_date}}', effective.toISOString().slice(0, 10));
}

/** Creates policies from templates, filled in with the organization's details. */
export async function adoptTemplates(slugs: string[], actor: string) {
  const settings = await getSettings();
  const existing = new Set((await prisma.policy.findMany({ select: { slug: true } })).map(p => p.slug));
  const created: string[] = [];
  for (const slug of slugs) {
    const t = POLICY_TEMPLATES.find(x => x.slug === slug);
    if (!t) throw new HttpError(400, `Unknown policy template "${slug}".`);
    if (existing.has(slug)) continue;
    const owner = 'the Security Lead';
    await prisma.policy.create({
      data: {
        slug: t.slug, title: t.title, summary: t.summary, owner: null,
        reviewIntervalDays: t.reviewIntervalDays, requiresSignoff: t.requiresSignoff, controls: t.controls,
        draft: renderTemplate(t.body, { organization: settings.organizationName, owner, effectiveDate: '{{effective_date}}', reviewIntervalDays: t.reviewIntervalDays }),
      },
    });
    created.push(t.title);
  }
  if (created.length) {
    await logEvent({ action: 'Policies added from templates', actor, decision: 'Completed', resource: `${created.length} policies`, reason: created.join(', ').slice(0, 500) });
  }
  return created.length;
}

/** Control keys like "SOC2:CC2.2" to Control row ids. */
async function controlRowIds(keys: string[]) {
  const pairs = keys.map(k => k.split(':')).filter(p => p.length === 2);
  if (!pairs.length) return [];
  const rows = await prisma.control.findMany({
    where: { OR: pairs.map(([framework, controlId]) => ({ framework, controlId })) },
    select: { id: true },
  });
  return rows.map(r => r.id);
}

/**
 * Publishes the current draft as a new, immutable version. The version is also
 * stored as evidence (an HTML document) linked to the policy's controls.
 */
export async function publishPolicy(policyId: string, actor: string) {
  const policy = await prisma.policy.findUnique({ where: { id: policyId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
  if (!policy) throw new HttpError(404, 'Policy not found.');
  if (!policy.draft.trim()) throw new HttpError(400, 'The policy is empty.');
  const now = new Date();
  const content = publishedText(policy.draft, now);
  const previous = policy.versions[0];
  if (previous && previous.content === publishedText(policy.draft, previous.publishedAt)) {
    throw new HttpError(409, 'Nothing has changed since the last published version.');
  }
  const version = (previous?.version ?? 0) + 1;
  const sha256 = sha256Hex(content);
  const settings = await getSettings();
  const footer = `${settings.organizationName} · ${policy.title} · Version ${version} · Published ${now.toISOString().slice(0, 10)} by ${actor} · SHA-256 of policy text ${sha256}`;
  const html = policyHtmlDocument(policy.title, content, footer);
  const evidence = await appendEvidence({
    title: `${policy.title} (version ${version})`,
    description: `Published by ${actor}.${previous ? ` Replaces version ${previous.version}.` : ''}`,
    kind: 'upload',
    source: `policy:${policy.slug}`,
    file: { name: `${policy.slug}-v${version}.html`, mimeType: 'text/html', data: new TextEncoder().encode(html) },
    controlIds: await controlRowIds(Array.isArray(policy.controls) ? (policy.controls as string[]) : []),
    collectedBy: actor,
  });
  const created = await prisma.policyVersion.create({
    data: { policyId, version, content, sha256, publishedBy: actor, publishedAt: now, evidenceId: evidence.id },
  });
  await recomputeAssessments();
  void anchorChain(actor).catch(err => console.error('[timestamp]', err));
  await logEvent({ action: 'Policy published', actor, decision: 'Completed', resource: policy.title, reason: `Version ${version}` });
  return created;
}

/** New sign-off links for people. A new link replaces any earlier one. */
export async function createSignLinks(personIds: string[], origin: string) {
  const people = await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, name: true, email: true } });
  const links: { id: string; name: string; email: string; url: string }[] = [];
  for (const p of people) {
    const token = randomBytes(24).toString('base64url');
    await prisma.person.update({ where: { id: p.id }, data: { signTokenHash: hashSignToken(token) } });
    links.push({ ...p, url: `${origin}/sign/${token}` });
  }
  return links;
}

/** What a person sees on their sign-off page. */
export async function signPageData(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const person = await prisma.person.findUnique({
    where: { signTokenHash: hashSignToken(token) },
    include: { acknowledgments: { select: { versionId: true, acceptedAt: true } } },
  });
  if (!person || !isActive(person.endDate)) return null;
  const policies = await prisma.policy.findMany({
    where: { requiresSignoff: true, versions: { some: {} } },
    orderBy: { title: 'asc' },
    include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  const signed = new Map(person.acknowledgments.map(a => [a.versionId, a.acceptedAt]));
  const settings = await getSettings();
  return {
    organization: settings.organizationName,
    person: { id: person.id, name: person.name, email: person.email },
    policies: policies.map(p => {
      const v = p.versions[0];
      return {
        versionId: v.id, title: p.title, summary: p.summary, version: v.version, content: v.content,
        publishedAt: v.publishedAt.toISOString(), acceptedAt: signed.get(v.id)?.toISOString() ?? null,
      };
    }),
  };
}

export async function acceptPolicies(token: string, versionIds: string[], signedName: string, ip: string | null) {
  const data = await signPageData(token);
  if (!data) throw new HttpError(404, 'This link is no longer valid. Ask for a new one.');
  const allowed = new Set(data.policies.map(p => p.versionId));
  const ids = [...new Set(versionIds)].filter(id => allowed.has(id));
  if (!ids.length) throw new HttpError(400, 'Choose at least one policy to accept.');
  await prisma.policyAcknowledgment.createMany({
    data: ids.map(versionId => ({ versionId, personId: data.person.id, signedName, ip })),
    skipDuplicates: true,
  });
  await logEvent({ action: 'Policies accepted', actor: data.person.email, decision: 'Completed', resource: `${ids.length} ${ids.length === 1 ? 'policy' : 'policies'}`, reason: `Signed as "${signedName}"` });
  return ids.length;
}

/** All acceptances, for the audit package and CSV download. */
export async function acceptanceRows() {
  const rows = await prisma.policyAcknowledgment.findMany({
    orderBy: [{ acceptedAt: 'asc' }],
    include: {
      person: { select: { name: true, email: true } },
      version: { select: { version: true, sha256: true, policy: { select: { title: true } } } },
    },
  });
  return rows.map(r => ({
    policy: r.version.policy.title, version: r.version.version, policySha256: r.version.sha256,
    name: r.person.name, email: r.person.email, signedName: r.signedName, acceptedAt: r.acceptedAt.toISOString(), ip: r.ip ?? '',
  }));
}

/** People and their sign-off status for every published policy, for auditors. */
export async function acceptanceStatusRows() {
  const { policies, people } = await policiesData();
  const acks = await prisma.policyAcknowledgment.findMany({ select: { versionId: true, personId: true, acceptedAt: true } });
  const at = new Map(acks.map(a => [`${a.versionId}:${a.personId}`, a.acceptedAt.toISOString()]));
  const rows: Record<string, string>[] = [];
  for (const person of people.filter(p => p.active)) {
    for (const policy of policies.filter(p => p.latest && p.requiresSignoff)) {
      const when = at.get(`${policy.latest!.id}:${person.id}`);
      rows.push({
        person: person.name, email: person.email, policy: policy.title, version: String(policy.latest!.version),
        status: when ? 'Accepted' : 'Pending', acceptedAt: when ?? '',
      });
    }
  }
  return rows;
}

/** Parses a people CSV: header row with name and email, optional title, github, start date. */
export function parsePeopleCsv(text: string) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new HttpError(400, 'The CSV needs a header row and at least one person.');
  const split = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = split(lines[0]).map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names: string[]) => header.findIndex(h => names.includes(h));
  const iName = col('name', 'fullname');
  const iEmail = col('email', 'emailaddress', 'workemail');
  if (iName < 0 || iEmail < 0) throw new HttpError(400, 'The CSV header must include "name" and "email" columns.');
  const iTitle = col('title', 'jobtitle', 'role');
  const iGithub = col('github', 'githubusername');
  const iStart = col('startdate', 'start', 'hiredate');
  const people: { name: string; email: string; title?: string; githubUsername?: string; startDate?: Date }[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, n) => {
    const c = split(line);
    const name = c[iName]?.slice(0, 100);
    const email = c[iEmail]?.toLowerCase();
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push(`Row ${n + 2}: needs a name and a valid email.`); return; }
    const start = iStart >= 0 && c[iStart] ? new Date(c[iStart]) : undefined;
    people.push({
      name, email,
      title: iTitle >= 0 ? c[iTitle]?.slice(0, 100) || undefined : undefined,
      githubUsername: iGithub >= 0 ? c[iGithub]?.replace(/^@/, '').slice(0, 39) || undefined : undefined,
      startDate: start && !Number.isNaN(start.getTime()) ? start : undefined,
    });
  });
  return { people, errors };
}
