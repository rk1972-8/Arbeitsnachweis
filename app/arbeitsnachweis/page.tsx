import { redirect } from 'next/navigation';
import { getStaffUser, listActiveStaff } from '../staff-auth';
import { WorkReportApp } from '../work-report';

export const dynamic = 'force-dynamic';

export default async function WorkReportPage() {
  const user = await getStaffUser();
  if (!user) redirect('/?next=%2Farbeitsnachweis');
  const personnelOptions = await listActiveStaff();
  if (user.role === 'admin' && !personnelOptions.some((item) => item.name === user.displayName)) {
    personnelOptions.unshift({ id: 'admin', name: user.displayName, role: user.jobRole });
  }
  const initials = user.displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'MA';
  return <WorkReportApp isAdmin={user.role === 'admin'} personnelOptions={personnelOptions} userInitials={initials} userName={user.displayName} userRole={user.jobRole} />;
}
