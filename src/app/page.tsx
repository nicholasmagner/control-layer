import { redirect } from 'next/navigation';
import { getCurrentUser, userCount } from '@/auth/session';
import AppShell from '@/components/AppShell';
import { getAppData } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect((await userCount()) === 0 ? '/setup' : '/login');
  const data = await getAppData(user);
  const params = await searchParams;
  const pick = (v: string | string[] | undefined) => (typeof v === 'string' ? v : undefined);
  return <AppShell data={data} initialTab={pick(params.tab)} initialFramework={pick(params.framework)} />;
}
