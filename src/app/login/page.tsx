import { redirect } from 'next/navigation';
import { getCurrentUser, userCount } from '@/auth/session';
import AuthForm from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');
  if ((await userCount()) === 0) redirect('/setup');
  return <AuthForm mode="login" />;
}
