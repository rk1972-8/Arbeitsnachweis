import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';
import { createCustomer, searchCustomers, searchCustomersAdvanced } from '../../../lib/plenty';
import type { NewCustomerInput } from '../../../lib/types';
import { getStaffUser } from '../../staff-auth';

export async function GET(request: Request) {
  if (!await getStaffUser()) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  const parameters = new URL(request.url).searchParams;
  const query = parameters.get('q')?.trim() ?? '';
  const advanced = parameters.get('advanced') === '1';
  if (!advanced && query.length < 2) return NextResponse.json({ customers: [] });

  try {
    const customers = advanced
      ? await searchCustomersAdvanced(env, {
        number: parameters.get('number') ?? '',
        company: parameters.get('company') ?? '',
        contact: parameters.get('contact') ?? '',
        email: parameters.get('email') ?? '',
        phone: parameters.get('phone') ?? '',
        zip: parameters.get('zip') ?? '',
        city: parameters.get('city') ?? '',
      })
      : await searchCustomers(env, query);
    return NextResponse.json({ customers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kundensuche fehlgeschlagen.' },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  if (!await getStaffUser()) return NextResponse.json({ error: 'Bitte zuerst anmelden.' }, { status: 401 });
  try {
    const input = await request.json() as { customer?: NewCustomerInput; force?: boolean };
    const result = await createCustomer(env, input.customer as NewCustomerInput, input.force === true);
    if (result.duplicates?.length) return NextResponse.json({ duplicates: result.duplicates }, { status: 409 });
    return NextResponse.json({ customer: result.customer }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunde konnte nicht angelegt werden.' },
      { status: 422 },
    );
  }
}
