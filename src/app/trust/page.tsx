import type { Metadata } from 'next';
import TrustPublic from '@/components/TrustPublic';
import { trustPageData } from '@/trust/public';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const data = await trustPageData();
  return data
    ? { title: `${data.organization} Trust Center`, description: data.description.slice(0, 200) }
    : { title: 'Trust Center', robots: { index: false } };
}

/** Public Trust Center. Shown only when an admin has published it. */
export default async function TrustPage() {
  const data = await trustPageData();
  if (!data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-100">Trust Center not published</h1>
        <p className="mt-2 text-sm text-slate-400">This page is not available right now.</p>
      </main>
    );
  }
  return <TrustPublic data={data} />;
}
