import { env } from 'cloudflare:workers';

let initialized = false;

export async function ensureDatabase() {
  if (initialized) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS work_reports (
      id TEXT PRIMARY KEY NOT NULL,
      report_number TEXT,
      owner_id TEXT NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      customer_id TEXT NOT NULL,
      customer_company TEXT DEFAULT '' NOT NULL,
      customer_name TEXT DEFAULT '' NOT NULL,
      customer_email TEXT DEFAULT '' NOT NULL,
      customer_address TEXT DEFAULT '' NOT NULL,
      work_date TEXT NOT NULL,
      work_address TEXT DEFAULT '' NOT NULL,
      work_minutes INTEGER DEFAULT 0 NOT NULL,
      drive_minutes INTEGER DEFAULT 0 NOT NULL,
      distance_km REAL DEFAULT 0 NOT NULL,
      work_description TEXT DEFAULT '' NOT NULL,
      findings TEXT DEFAULT '' NOT NULL,
      complaints TEXT DEFAULT '' NOT NULL,
      recommendations TEXT DEFAULT '' NOT NULL,
      internal_notes TEXT DEFAULT '' NOT NULL,
      personnel_json TEXT DEFAULT '[]' NOT NULL,
      positions_json TEXT DEFAULT '[]' NOT NULL,
      signer_name TEXT DEFAULT '' NOT NULL,
      signature_key TEXT,
      pdf_key TEXT,
      sent_to TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_work_reports_number ON work_reports(report_number)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_work_reports_owner_updated ON work_reports(owner_id, updated_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_work_reports_customer ON work_reports(customer_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_work_reports_status ON work_reports(status)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS personnel_preferences (
      owner_id TEXT PRIMARY KEY NOT NULL,
      employee_name TEXT DEFAULT '' NOT NULL,
      role TEXT DEFAULT 'Kältemechatroniker' NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL COLLATE NOCASE,
      job_role TEXT DEFAULT 'Kältemechatroniker' NOT NULL,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      active INTEGER DEFAULT 1 NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_name ON app_users(name COLLATE NOCASE)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_app_users_active_name ON app_users(active, name)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS auth_attempts (
      attempt_key TEXT PRIMARY KEY NOT NULL,
      attempts INTEGER DEFAULT 0 NOT NULL,
      window_started TEXT NOT NULL,
      locked_until TEXT
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS report_additions (
      id TEXT PRIMARY KEY NOT NULL,
      report_id TEXT NOT NULL,
      quantity REAL DEFAULT 1 NOT NULL,
      unit TEXT DEFAULT 'Stück' NOT NULL,
      title TEXT NOT NULL,
      item_id TEXT,
      variation_id TEXT,
      reason TEXT DEFAULT '' NOT NULL,
      added_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_report_additions_report ON report_additions(report_id, created_at)'),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS plenty_order_drafts (
      report_id TEXT PRIMARY KEY NOT NULL,
      status TEXT DEFAULT 'draft' NOT NULL,
      customer_reference TEXT DEFAULT '' NOT NULL,
      billing_address_json TEXT DEFAULT '{}' NOT NULL,
      delivery_same_as_billing INTEGER DEFAULT 1 NOT NULL,
      delivery_address_json TEXT DEFAULT '{}' NOT NULL,
      positions_json TEXT DEFAULT '[]' NOT NULL,
      plenty_order_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_plenty_order_drafts_status_updated ON plenty_order_drafts(status, updated_at)'),
    env.DB.prepare('PRAGMA optimize'),
  ]);
  initialized = true;
}
