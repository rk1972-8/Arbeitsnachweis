import { redirect } from 'next/navigation';
import { getStaffUser } from '../../../../staff-auth';
import { OrderEditor } from './order-editor';

export const dynamic = 'force-dynamic';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getStaffUser();
  if (user?.role !== 'admin') redirect('/');
  const { id } = await params;
  return <OrderEditor reportId={id} />;
}
