import { redirect } from 'next/navigation';
import { userCount } from '@/auth/session';
import AuthForm from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  if ((await userCount()) > 0) redirect('/login');
  return <AuthForm mode="setup" />;
}
