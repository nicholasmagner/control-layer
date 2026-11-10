/**
 * Matches a customer's question to the closest answer: plain token overlap
 * with stemming and security synonyms, plus a bonus for topic keywords.
 * Deterministic and fast; no data leaves the server.
 */

const STOP = new Set(('a an and are as at be by can do does for from has have how if in is it its of on or our please provide '
  + 'the their there these this those to us we what when where which who will with you your yours describe explain any all '
  + 'company organization ensure ensured currently state confirm whether used use using').split(' '));

/** Phrases rewritten to one canonical term before tokenizing. */
const SYNONYMS: [RegExp, string][] = [
  [/\b(multi[- ]?factor|two[- ]?factor|2fa|mfa|second factor|2-step|two[- ]?step)\b/g, ' mfa '],
  [/\b(single sign[- ]?on|sso)\b/g, ' sso '],
  [/\b(pen[- ]?tests?|penetration tests?(ing)?)\b/g, ' pentest '],
  [/\b(anti[- ]?virus|anti[- ]?malware|edr|endpoint detection)\b/g, ' malware '],
  [/\b(encrypt(ed|ion|s)?)\b/g, ' encrypt '],
  [/\b(sub[- ]?processors?|third[- ]?part(y|ies)|suppliers?|vendors?)\b/g, ' vendor '],
  [/\b(disaster recovery|business continuity|bcp|drp|bc\/dr)\b/g, ' continuity '],
  [/\b(back[- ]?ups?)\b/g, ' backup '],
  [/\b(log(s|ging)?|audit trails?)\b/g, ' log '],
  [/\b(vulnerabilit(y|ies)|cves?|patch(es|ing)?)\b/g, ' vulnerability '],
  [/\b(off[- ]?boarding|terminat(ed|ion)|leavers?|de[- ]?provision(ing)?)\b/g, ' offboarding '],
  [/\b(artificial intelligence|machine learning|\bai\b|\bml\b|llms?|generative|gen ai)\b/g, ' ai '],
  [/\b(personally identifiable information|pii|personal data)\b/g, ' personaldata '],
  [/\b(protected health information|phi|ephi)\b/g, ' phi '],
  [/\b(soc ?2|soc ii)\b/g, ' soc2 '],
  [/\b(transport layer security|tls|ssl|https)\b/g, ' tls '],
  [/\b(data at rest|at rest)\b/g, ' atrest '],
  [/\b(in transit|in motion)\b/g, ' intransit '],
];

function stem(w: string) {
  return w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '').replace(/(ation)$/, 'ate');
}

export function normalize(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[’']/g, '')} `;
  for (const [re, to] of SYNONYMS) t = t.replace(re, to);
  return t.replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(stem).filter(w => w.length > 1));
}

function overlap(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  const p = n / a.size;
  const r = n / b.size;
  return p + r ? (2 * p * r) / (p + r) : 0;
}

/** 0-1 similarity of a question to a set of phrasings and topic keywords. */
export function similarity(question: string, phrasings: string[], keywords: string[] = []): number {
  const q = tokens(question);
  const base = Math.max(0, ...phrasings.map(p => overlap(q, tokens(p))));
  const norm = ` ${normalize(question)} `;
  const hits = keywords.filter(k => norm.includes(` ${normalize(k)} `)).length;
  const bonus = hits ? Math.min(0.45, 0.3 + 0.08 * (hits - 1)) : 0;
  return Math.min(1, base * 0.75 + bonus);
}

export const MATCH_THRESHOLD = 0.35;
