import { redirect } from 'next/navigation';
import { getStaffUser } from '../../../../staff-auth';
import { OrderEditor } from './order-editor';

export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getStaffUser();
  if (user?.role !== 'admin') redirect(`/?mode=admin&next=${encodeURIComponent(`/admin/reports/${id}/order`)}`);
  return <OrderEditor reportId={id} />;
}
