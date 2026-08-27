import { redirect } from 'next/navigation';
import { getStaffUser } from '../../../staff-auth';
import { PdfPreview } from './pdf-preview';

export const dynamic = 'force-dynamic';

export default async function ReportPreview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!await getStaffUser()) redirect('/');
  return <PdfPreview pdfUrl={`/api/reports/${encodeURIComponent(id)}/pdf`} />;
}
