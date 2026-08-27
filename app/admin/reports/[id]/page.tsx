import { redirect } from 'next/navigation';
import { getStaffUser } from '../../../staff-auth';
import { ReportReview } from './report-review';

export const dynamic = 'force-dynamic';

export default async function ReportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') redirect('/');
  const { id } = await params;
  return <ReportReview reportId={id} />;
}
