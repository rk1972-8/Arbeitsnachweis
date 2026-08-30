import { redirect } from 'next/navigation';
import { getStaffUser } from '../../../staff-auth';
import { ReportReview } from './report-review';

export const dynamic = 'force-dynamic';

export default async function ReportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getStaffUser();
  if (user?.role !== 'admin') redirect(`/?mode=admin&next=${encodeURIComponent(`/admin/reports/${id}`)}`);
  return <ReportReview reportId={id} />;
}
