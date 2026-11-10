import { draftQuestionnaireAnswers } from '@/assistant/engine';
import { prisma } from '@/db/prisma';
import { ANSWER_BANK, type BankEntry } from './bank';
import { loadFacts, type Facts } from './facts';
import { MATCH_THRESHOLD, similarity } from './match';

export interface Suggestion {
  answer: string;
  status: 'suggested' | 'needs_input';
  confidence: number;
  source: { type: 'builtin' | 'library' | 'assistant' | 'none'; key?: string; id?: string; title?: string; sources?: string[]; match?: number };
}

type LibraryEntry = { id: string; question: string; answer: string; builtinKey: string | null };

/** The answer a built-in entry gives now, or the admin's override of it. */
export function builtinText(entry: BankEntry, facts: Facts, overrides: Map<string, LibraryEntry>) {
  const override = overrides.get(entry.key);
  if (override) return { text: override.answer, confidence: 0.9, sources: ['Your saved answer (overrides the generated one)'] };
  const a = entry.answer(facts);
  return { text: a.text, confidence: a.confidence, sources: a.sources };
}

/** Best answer for one question from the library and the built-in bank. */
export function suggest(question: string, facts: Facts, library: LibraryEntry[]): Suggestion {
  const overrides = new Map(library.filter(l => l.builtinKey).map(l => [l.builtinKey!, l]));
  const custom = library.filter(l => !l.builtinKey);

  let best: Suggestion | null = null;
  let bestScore = 0;
  for (const l of custom) {
    const s = similarity(question, [l.question]);
    // Your own saved answers win ties: they were written for questions like this.
    if (s + 0.05 > bestScore) {
      bestScore = s + 0.05;
      best = { answer: l.answer, status: 'suggested', confidence: Number(Math.min(0.95, 0.5 + s * 0.6).toFixed(2)), source: { type: 'library', id: l.id, title: l.question, sources: ['Your answer library'], match: s } };
    }
  }
  for (const e of ANSWER_BANK) {
    const s = similarity(question, e.questions, e.keywords);
    if (s > bestScore) {
      const a = builtinText(e, facts, overrides);
      bestScore = s;
      best = {
        // A clear wording match (about 0.55+) fully trusts the answer; weaker matches discount it.
        answer: a.text, status: 'suggested', confidence: Number((a.confidence * Math.min(1, 0.6 + s * 0.75)).toFixed(2)),
        source: { type: 'builtin', key: e.key, title: e.questions[0], sources: a.sources, match: Number(s.toFixed(2)) },
      };
    }
  }
  if (!best || bestScore < MATCH_THRESHOLD) return { answer: '', status: 'needs_input', confidence: 0, source: { type: 'none' } };
  // Answers with placeholders, or weak support, need a person.
  if (/\[[^\]]+\]/.test(best.answer) || best.confidence < 0.35) best.status = 'needs_input';
  return best;
}

/** (Re)answers every item that isn't approved yet. */
export async function autoAnswer(questionnaireId: string) {
  const [facts, library, items] = await Promise.all([
    loadFacts(),
    prisma.answerLibraryEntry.findMany({ select: { id: true, question: true, answer: true, builtinKey: true } }),
    prisma.questionnaireItem.findMany({ where: { questionnaireId, status: { not: 'approved' } } }),
  ]);
  let answered = 0;
  for (const it of items) {
    const s = suggest(it.question, facts, library);
    if (s.answer) answered++;
    await prisma.questionnaireItem.update({
      where: { id: it.id },
      data: { answer: s.answer || it.answer, status: s.status, confidence: s.confidence, source: s.source as object },
    });
  }
  return { total: items.length, answered };
}

/** Asks the assistant (if configured) to draft answers for questions nothing matched. */
export async function draftWithAssistant(questionnaireId: string) {
  const [facts, library, items] = await Promise.all([
    loadFacts(),
    prisma.answerLibraryEntry.findMany({ select: { question: true, answer: true } }),
    prisma.questionnaireItem.findMany({ where: { questionnaireId, status: 'needs_input', answer: '' }, orderBy: { position: 'asc' }, take: 60 }),
  ]);
  if (!items.length) return 0;
  const knowledge = {
    organization: facts.org,
    approvedAnswers: [
      ...ANSWER_BANK.map(e => ({ question: e.questions[0], answer: e.answer(facts).text })).filter(a => !/\[/.test(a.answer)),
      ...library,
    ].slice(0, 120),
    frameworks: facts.frameworks.map(f => ({ name: f.name, readiness: `${f.score}%`, status: f.status })),
    integrations: [...facts.connected],
    policies: [...facts.policies.values()].map(p => p.title),
  };
  const drafts = await draftQuestionnaireAnswers(items.map((it, i) => ({ i, question: it.question })), knowledge);
  for (const [i, answer] of drafts) {
    await prisma.questionnaireItem.update({
      where: { id: items[i].id },
      data: { answer, status: 'needs_input', confidence: 0.3, source: { type: 'assistant', sources: ['Drafted by the assistant from your answers and setup; check before approving'] } },
    });
  }
  return drafts.size;
}

/** Library view: built-in answers as they read right now, plus your own. */
export async function libraryView() {
  const [facts, library] = await Promise.all([loadFacts(), prisma.answerLibraryEntry.findMany({ orderBy: { updatedAt: 'desc' } })]);
  const overrides = new Map(library.filter(l => l.builtinKey).map(l => [l.builtinKey!, l]));
  return {
    sample: facts.sample,
    builtin: ANSWER_BANK.map(e => {
      const generated = e.answer(facts);
      const o = overrides.get(e.key);
      return {
        key: e.key, topic: e.topic, question: e.questions[0], answer: o?.answer ?? generated.text, generated: generated.text,
        short: generated.answer, confidence: o ? 0.9 : generated.confidence, sources: generated.sources,
        overrideId: o?.id ?? null, isPublic: o?.isPublic ?? false, needsInput: !o && (/\[[^\]]+\]/.test(generated.text) || generated.confidence < 0.35),
      };
    }),
    custom: library.filter(l => !l.builtinKey).map(l => ({ id: l.id, question: l.question, answer: l.answer, isPublic: l.isPublic, usageCount: l.usageCount, updatedAt: l.updatedAt.toISOString(), updatedBy: l.updatedBy })),
  };
}
