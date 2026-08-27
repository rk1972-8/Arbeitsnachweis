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

export type WorkReportRow = typeof workReports.$inferSelect;
export type NewWorkReportRow = typeof workReports.$inferInsert;
