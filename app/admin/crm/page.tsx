import { redirect } from 'next/navigation';
import { getStaffUser } from '../../staff-auth';
import { CrmPanel } from './crm-panel';

export const dynamic = 'force-dynamic';

export default async function CrmPage() {
  const user = await getStaffUser();
  if (user?.role !== 'admin') redirect('/');
  return <CrmPanel adminName={user.displayName} />;
}
