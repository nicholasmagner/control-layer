import type { Metadata } from 'next';
import VendorReviewForm from '@/components/VendorReviewForm';
import { getSettings } from '@/lib/settings';
import { VENDOR_QUESTIONS } from '@/vendors/risk';
import { vendorQuestionnaireForToken } from '@/vendors/service';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Security questionnaire', robots: { index: false, follow: false } };

/** Public page a vendor opens from the link they were sent. */
export default async function VendorReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const q = await vendorQuestionnaireForToken(token);
  const org = (await getSettings()).organizationName;
  if (!q) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-100">This link is no longer valid</h1>
        <p className="mt-2 text-sm text-slate-400">Ask {org} for a new link.</p>
      </main>
    );
  }
  return <VendorReviewForm token={token} organization={org} vendor={q.vendor.name} sentTo={q.sentTo} done={q.status === 'completed'} questions={VENDOR_QUESTIONS} />;
}
