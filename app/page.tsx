import { StaffLogin } from './staff-login';
import { getStaffUser } from './staff-auth';
import { HomePortal } from './home-portal';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ mode?: string; employee?: string }> }) {
  const parameters = await searchParams;
  const user = await getStaffUser();
  if (!user) return <StaffLogin initialMode={parameters.mode === 'admin' ? 'admin' : 'employee'} initialName={parameters.employee?.slice(0, 100) ?? ''} />;
  const initials = user.displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'MA';
  return <HomePortal isAdmin={user.role === 'admin'} userInitials={initials} userName={user.displayName} />;
}
