import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workReports = sqliteTable(
  'work_reports',
  {
    id: text('id').primaryKey(),
    reportNumber: text('report_number'),
    ownerId: text('owner_id').notNull(),
    status: text('status', { enum: ['draft', 'pending_review', 'signed', 'sent'] }).notNull().default('draft'),
    customerId: text('customer_id').notNull(),
    customerCompany: text('customer_company').notNull().default(''),
    customerName: text('customer_name').notNull().default(''),
    customerEmail: text('customer_email').notNull().default(''),
    customerAddress: text('customer_address').notNull().default(''),
    workDate: text('work_date').notNull(),
    workAddress: text('work_address').notNull().default(''),
    workMinutes: integer('work_minutes').notNull().default(0),
    driveMinutes: integer('drive_minutes').notNull().default(0),
    distanceKm: real('distance_km').notNull().default(0),
    workDescription: text('work_description').notNull().default(''),
    findings: text('findings').notNull().default(''),
    complaints: text('complaints').notNull().default(''),
    recommendations: text('recommendations').notNull().default(''),
    internalNotes: text('internal_notes').notNull().default(''),
    personnelJson: text('personnel_json').notNull().default('[]'),
    positionsJson: text('positions_json').notNull().default('[]'),
    signerName: text('signer_name').notNull().default(''),
    signatureKey: text('signature_key'),
    pdfKey: text('pdf_key'),
    sentTo: text('sent_to'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_work_reports_number').on(table.reportNumber),
    index('idx_work_reports_owner_updated').on(table.ownerId, table.updatedAt),
    index('idx_work_reports_customer').on(table.customerId),
    index('idx_work_reports_status').on(table.status),
  ],
);

export const personnelPreferences = sqliteTable('personnel_preferences', {
  ownerId: text('owner_id').primaryKey(),
  employeeName: text('employee_name').notNull().default(''),
  role: text('role').notNull().default('Kältemechatroniker'),
  updatedAt: text('updated_at').notNull(),
});

export const appUsers = sqliteTable(
  'app_users',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    jobRole: text('job_role').notNull().default('Kältemechatroniker'),
    pinHash: text('pin_hash').notNull(),
    pinSalt: text('pin_salt').notNull(),
    active: integer('active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_app_users_name').on(table.name),
    index('idx_app_users_active_name').on(table.active, table.name),
  ],
);

export const authAttempts = sqliteTable('auth_attempts', {
  attemptKey: text('attempt_key').primaryKey(),
  attempts: integer('attempts').notNull().default(0),
  windowStarted: text('window_started').notNull(),
  lockedUntil: text('locked_until'),
});

export const reportAdditions = sqliteTable(
  'report_additions',
  {
    id: text('id').primaryKey(),
    reportId: text('report_id').notNull(),
    quantity: real('quantity').notNull().default(1),
    unit: text('unit').notNull().default('Stück'),
    title: text('title').notNull(),
    itemId: text('item_id'),
    variationId: text('variation_id'),
    reason: text('reason').notNull().default(''),
    addedBy: text('added_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_report_additions_report').on(table.reportId, table.createdAt)],
);

export const plentyOrderDrafts = sqliteTable(
  'plenty_order_drafts',
  {
    reportId: text('report_id').primaryKey(),
    status: text('status', { enum: ['draft', 'created'] }).notNull().default('draft'),
    customerReference: text('customer_reference').notNull().default(''),
    billingAddressJson: text('billing_address_json').notNull().default('{}'),
    deliverySameAsBilling: integer('delivery_same_as_billing').notNull().default(1),
    deliveryAddressJson: text('delivery_address_json').notNull().default('{}'),
    positionsJson: text('positions_json').notNull().default('[]'),
    plentyOrderId: text('plenty_order_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_plenty_order_drafts_status_updated').on(table.status, table.updatedAt)],
);

export const crmLeads = sqliteTable(
  'crm_leads',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull().default('Manuell'),
    sourceReference: text('source_reference'),
    incomingAt: text('incoming_at').notNull(),
    status: text('status').notNull().default('Neu'),
    priority: text('priority').notNull().default('Normal'),
    tagsJson: text('tags_json').notNull().default('[]'),
    internalNotes: text('internal_notes').notNull().default(''),
    appointmentAt: text('appointment_at'),
    assignee: text('assignee').notNull().default(''),
    firstName: text('first_name').notNull().default(''),
    lastName: text('last_name').notNull().default(''),
    company: text('company').notNull().default(''),
    phone: text('phone').notNull().default(''),
    phoneNormalized: text('phone_normalized').notNull().default(''),
    email: text('email').notNull().default(''),
    emailNormalized: text('email_normalized').notNull().default(''),
    nameNormalized: text('name_normalized').notNull().default(''),
    street: text('street').notNull().default(''),
    houseNumber: text('house_number').notNull().default(''),
    zip: text('zip').notNull().default(''),
    city: text('city').notNull().default(''),
    interest: text('interest').notNull().default(''),
    manufacturer: text('manufacturer').notNull().default(''),
    rooms: text('rooms').notNull().default(''),
    area: text('area').notNull().default(''),
    summary: text('summary').notNull().default(''),
    contactCount: integer('contact_count').notNull().default(1),
    lastContactAt: text('last_contact_at').notNull(),
    googleContactId: text('google_contact_id'),
    googleExportedAt: text('google_exported_at'),
    googleExportError: text('google_export_error'),
    plentyContactId: text('plenty_contact_id'),
    plentyAddressId: text('plenty_address_id'),
    plentyExportedAt: text('plenty_exported_at'),
    plentyExportError: text('plenty_export_error'),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_crm_leads_status_contact').on(table.status, table.lastContactAt),
    index('idx_crm_leads_phone').on(table.phoneNormalized),
    index('idx_crm_leads_email').on(table.emailNormalized),
    index('idx_crm_leads_name').on(table.nameNormalized),
    index('idx_crm_leads_assignee').on(table.assignee),
  ],
);

export const crmLeadEvents = sqliteTable(
  'crm_lead_events',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id').notNull(),
    occurredAt: text('occurred_at').notNull(),
    channel: text('channel').notNull().default('Notiz'),
    note: text('note').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => [index('idx_crm_lead_events_lead_time').on(table.leadId, table.occurredAt)],
);

export type WorkReportRow = typeof workReports.$inferSelect;
export type NewWorkReportRow = typeof workReports.$inferInsert;
