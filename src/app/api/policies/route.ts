import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson, str } from '@/lib/http';
import { adoptTemplates } from '@/policies/service';
import { POLICY_TEMPLATES } from '@/policies/templates';

/**
 * Adds policies. Body: { templates: string[] } adopts templates ("all" for
 * every one not yet added), or { title } starts a blank policy.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  if (body.templates === 'all' || Array.isArray(body.templates)) {
    const slugs = body.templates === 'all' ? POLICY_TEMPLATES.map(t => t.slug) : (body.templates as unknown[]).map(String);
    const added = await adoptTemplates(slugs, user.email);
    return NextResponse.json({ added });
  }
  const title = str(body.title, 'title', { max: 150 });
  if (await prisma.policy.findFirst({ where: { title } })) throw new HttpError(409, 'A policy with that title already exists.');
  const policy = await prisma.policy.create({
    data: {
      slug: `custom-${randomBytes(4).toString('hex')}`, title, summary: '', controls: [],
      draft: `# ${title}\n\n| | |\n| :--- | :--- |\n| Effective date | {{effective_date}} |\n\n## Purpose\n\n## Scope\n\n## Policy\n`,
    },
  });
  await logEvent({ action: 'Policy created', actor: user.email, decision: 'Completed', resource: title });
  return NextResponse.json({ id: policy.id });
});
