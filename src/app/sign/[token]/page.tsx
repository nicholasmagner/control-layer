import type { Metadata } from 'next';
import SignPolicies from '@/components/SignPolicies';
import { signPageData } from '@/policies/service';
import { renderMarkdown } from '@/policies/markdown';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review and accept policies', robots: { index: false, follow: false } };

/** Public page a person opens from their personal link to accept policies. */
export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await signPageData(token);
  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-100">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-slate-400">Ask the person who sent it for a new link.</p>
      </main>
    );
  }
  return (
    <SignPolicies token={token} organization={data.organization} person={{ name: data.person.name, email: data.person.email }}
      policies={data.policies.map(p => ({ ...p, html: renderMarkdown(p.content), content: undefined }))} />
  );
}
