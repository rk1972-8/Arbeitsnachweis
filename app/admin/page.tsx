import { redirect } from 'next/navigation';
import { getStaffUser } from '../staff-auth';
import { AdminPanel } from './admin-panel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getStaffUser();
  if (user?.role !== 'admin') redirect('/?mode=admin&next=%2Fadmin');
  return <AdminPanel adminName={user.displayName} />;
}
