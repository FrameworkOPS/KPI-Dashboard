import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'kpi_dashboard',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

// Convenience wrapper so callers don't need to import pool directly
export const query = (text: string, params?: unknown[]) => pool.query(text, params);

export async function initializeDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    // Enable UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'manager',
        team VARCHAR(50) DEFAULT 'all',
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Invitation flow: invited users get a token + are inactive until they set a password.
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_token VARCHAR(255)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_expires TIMESTAMP`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token)`);

    // scorecard_entries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scorecard_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team VARCHAR(50) NOT NULL,
        week_of DATE NOT NULL,
        metric_name VARCHAR(255) NOT NULL,
        goal DECIMAL(14,2),
        actual DECIMAL(14,2),
        is_on_track BOOLEAN,
        data_source VARCHAR(50) DEFAULT 'manual',
        notes TEXT,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(team, week_of, metric_name)
      )
    `);

    // rocks table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rocks (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team VARCHAR(50) NOT NULL,
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        quarter INT CHECK (quarter BETWEEN 1 AND 4),
        year INT,
        status VARCHAR(50) DEFAULT 'on_track',
        completion_percentage INT DEFAULT 0,
        due_date DATE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // issues table
    await client.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team VARCHAR(50) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        priority VARCHAR(50) DEFAULT 'medium',
        status VARCHAR(50) DEFAULT 'open',
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // todos table
    await client.query(`
      CREATE TABLE IF NOT EXISTS todos (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team VARCHAR(50) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        due_date DATE,
        status VARCHAR(50) DEFAULT 'pending',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // vto_sections table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vto_sections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        section_key VARCHAR(100) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        content JSONB DEFAULT '{}',
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // accountability_seats table
    await client.query(`
      CREATE TABLE IF NOT EXISTS accountability_seats (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        seat_name VARCHAR(255) NOT NULL,
        seat_description TEXT,
        owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
        parent_seat_id UUID REFERENCES accountability_seats(id) ON DELETE SET NULL,
        responsibilities JSONB DEFAULT '[]',
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // meetings table
    await client.query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        team VARCHAR(50) NOT NULL,
        meeting_date DATE NOT NULL,
        segue TEXT,
        scorecard_notes TEXT,
        rocks_notes TEXT,
        headlines TEXT,
        todos_notes TEXT,
        ids_issues TEXT,
        conclude_notes TEXT,
        rating INT CHECK (rating BETWEEN 1 AND 10),
        status VARCHAR(50) DEFAULT 'scheduled',
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add new meeting columns if they don't exist (safe for existing deploys)
    await client.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_time VARCHAR(10)`);
    await client.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_link TEXT`);
    await client.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS attendee_emails JSONB DEFAULT '[]'`);
    await client.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false`);

    // Seed VTO sections
    const vtoSections = [
      { key: 'core_values', title: 'Core Values' },
      { key: 'core_focus', title: 'Core Focus' },
      { key: 'ten_year_target', title: '10-Year Target' },
      { key: 'marketing_strategy', title: 'Marketing Strategy' },
      { key: 'three_year_picture', title: '3-Year Picture' },
      { key: 'one_year_plan', title: '1-Year Plan' },
    ];

    for (const section of vtoSections) {
      await client.query(
        `INSERT INTO vto_sections (section_key, title, content)
         VALUES ($1, $2, '{}')
         ON CONFLICT (section_key) DO NOTHING`,
        [section.key, section.title]
      );
    }

    // Seed known users — only inserts if email doesn't already exist
    const seedUsers = [
      { email: 'chance@skyright.com', password: process.env.SEED_CHANCE_PW || 'Redroad7318',  first: 'Chance', last: 'Peare',     role: 'admin',      team: 'all'        },
      { email: 'jorn@skyright.com',   password: process.env.SEED_JORN_PW   || 'Bielefeld1',   first: 'Jorn',   last: 'Bielefeld', role: 'leadership', team: 'leadership' },
      { email: 'pete@skyright.com',   password: process.env.SEED_PETE_PW   || 'Password',     first: 'Pete',   last: 'Hicks',     role: 'leadership', team: 'leadership' },
    ];

    for (const u of seedUsers) {
      const exists = await client.query('SELECT id FROM users WHERE email = $1', [u.email]);
      if (exists.rows.length === 0) {
        const hash = await bcrypt.hash(u.password, 12);
        await client.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, role, team)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [u.email, hash, u.first, u.last, u.role, u.team]
        );
        console.log(`Seeded user: ${u.email} (${u.role})`);
      }
    }

    // One-time correction: Pete Hicks should be a leadership user with password "Password"
    // (he was previously seeded as admin with no last name). Idempotent — only updates if needed.
    {
      const peteHash = await bcrypt.hash('Password', 12);
      await client.query(
        `UPDATE users
            SET first_name = 'Pete',
                last_name  = 'Hicks',
                role       = 'leadership',
                team       = 'leadership',
                password_hash = $1,
                active     = true,
                updated_at = NOW()
          WHERE LOWER(email) = 'pete@skyright.com'`,
        [peteHash]
      );
    }

    // oauth_tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS oauth_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        provider VARCHAR(50) NOT NULL UNIQUE,
        realm_id VARCHAR(255),
        access_token TEXT,
        refresh_token TEXT,
        token_expiry TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider)
    `);

    // app_settings table — generic key/value for integration credentials etc.
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // jobnimbus_jobs table — populated by Zapier webhook pushes
    await client.query(`
      CREATE TABLE IF NOT EXISTS jobnimbus_jobs (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        jnid        VARCHAR(100) UNIQUE NOT NULL,
        name        TEXT,
        status      VARCHAR(100),
        status_type INT,
        value       DECIMAL(14,2),
        date_created TIMESTAMP,
        date_updated TIMESTAMP,
        raw         JSONB,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_jn_jobs_status_type ON jobnimbus_jobs(status_type)`);

    // Analytical columns populated from the JobNimbus API (denormalized for clean
    // grouping + value/date math). Safe to re-run on every boot.
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS is_lead BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS sales_rep_name TEXT`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS source_name TEXT`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS record_type_name TEXT`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS estimate_value DECIMAL(14,2)`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS invoice_value DECIMAL(14,2)`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS signed_date TIMESTAMP`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS billed_date TIMESTAMP`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS contract_sent BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE jobnimbus_jobs ADD COLUMN IF NOT EXISTS contract_sent_date TIMESTAMP`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_jn_jobs_is_lead ON jobnimbus_jobs(is_lead)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_jn_jobs_signed_date ON jobnimbus_jobs(signed_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_jn_jobs_billed_date ON jobnimbus_jobs(billed_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_jn_jobs_contract_sent_date ON jobnimbus_jobs(contract_sent_date)`);

    // scorecard_templates table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scorecard_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team VARCHAR(50) NOT NULL,
        metric_name VARCHAR(255) NOT NULL,
        goal DECIMAL(14,2),
        goal_text VARCHAR(100),
        display_format VARCHAR(20) NOT NULL DEFAULT 'number',
        lower_is_better BOOLEAN NOT NULL DEFAULT false,
        sort_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(team, metric_name)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scorecard_templates_team ON scorecard_templates(team)
    `);

    // Add new columns to scorecard_entries if they don't exist
    await client.query(`
      ALTER TABLE scorecard_entries ADD COLUMN IF NOT EXISTS display_format VARCHAR(20) NOT NULL DEFAULT 'number'
    `);
    await client.query(`
      ALTER TABLE scorecard_entries ADD COLUMN IF NOT EXISTS lower_is_better BOOLEAN NOT NULL DEFAULT false
    `);
    await client.query(`
      ALTER TABLE scorecard_entries ADD COLUMN IF NOT EXISTS goal_text VARCHAR(100)
    `);

    // ── Deduplication migrations ──────────────────────────────────────────────
    // Safe to run on every boot: CTE + DELETE only removes true duplicates.

    // 1. Remove duplicate scorecard_templates (keep lowest sort_order row per team+metric)
    await client.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY team, metric_name
                 ORDER BY sort_order, created_at
               ) AS rn
        FROM scorecard_templates
      )
      DELETE FROM scorecard_templates WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `);

    // 2. Ensure unique index exists on templates (idempotent)
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_sc_templates_team_metric
      ON scorecard_templates(team, metric_name)
    `);

    // 3. Remove duplicate scorecard_entries (keep row with non-null actual, then oldest)
    await client.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY team, week_of, metric_name
                 ORDER BY (CASE WHEN actual IS NOT NULL THEN 0 ELSE 1 END), created_at
               ) AS rn
        FROM scorecard_entries
      )
      DELETE FROM scorecard_entries WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
    `);

    // 4. Add sort_order column to entries if missing (for manual entries without a template)
    await client.query(`
      ALTER TABLE scorecard_entries ADD COLUMN IF NOT EXISTS sort_order INT
    `);

    // 5. Migrate any legacy hubspot-sourced rows to manual (HubSpot integration removed)
    await client.query(`
      UPDATE scorecard_entries SET data_source = 'manual' WHERE data_source = 'hubspot'
    `);

    // Seed leadership scorecard templates
    await client.query(`
      INSERT INTO scorecard_templates (team, metric_name, goal, goal_text, display_format, lower_is_better, sort_order)
      SELECT * FROM (VALUES
        ('leadership', 'Weekly Sales',          120000::DECIMAL,    '$120,000',           'currency', false,  1),
        ('leadership', 'Total Sales (YTD)',     10000000::DECIMAL,  '$10,000,000',        'currency', false,  2),
        ('leadership', 'Closing Rate',          0.40::DECIMAL,      '40%',                'percent',  false,  3),
        ('leadership', 'Appointments',          12::DECIMAL,        '12',                 'number',   false,  4),
        ('leadership', 'Weekly Invoiced',       120000::DECIMAL,    '$120K / $230K',      'currency', false,  5),
        ('leadership', 'Total Invoiced (YTD)',  9000000::DECIMAL,   '$9,000,000',         'currency', false,  6),
        ('leadership', 'Backlog (Weeks)',        4::DECIMAL,        '4 weeks',            'number',   true,   7),
        ('leadership', 'Callbacks (Weeks)',      1::DECIMAL,        '1 week',             'number',   true,   8),
        ('leadership', 'COGS % (YTD)',           0.59::DECIMAL,     '59%',                'percent',  true,   9),
        ('leadership', 'Net % (YTD)',            0.175::DECIMAL,    '17.5%',              'percent',  false,  10),
        ('leadership', 'Cash Balance',          100000::DECIMAL,    'Min $100,000',       'currency', false,  11),
        ('leadership', 'AR',                    500000::DECIMAL,    '$500,000',           'currency', false,  12),
        ('leadership', 'DSO (Days)',             20::DECIMAL,       '20 days',            'number',   true,   13)
      ) AS v(team, metric_name, goal, goal_text, display_format, lower_is_better, sort_order)
      WHERE NOT EXISTS (SELECT 1 FROM scorecard_templates WHERE team = 'leadership')
    `);

    // Seed current week (2026-04-05) leadership scorecard entries
    await client.query(`
      INSERT INTO scorecard_entries (team, week_of, metric_name, goal, goal_text, actual, is_on_track, display_format, lower_is_better, data_source, notes)
      SELECT * FROM (VALUES
        ('leadership','2026-04-05'::DATE,'Weekly Sales',         120000::DECIMAL,   '$120,000',      15564::DECIMAL,       false, 'currency', false, 'manual',   'Weighted by the week'),
        ('leadership','2026-04-05'::DATE,'Total Sales (YTD)',    10000000::DECIMAL, '$10,000,000',   812648.45::DECIMAL,   true,  'currency', false, 'manual',   ''),
        ('leadership','2026-04-05'::DATE,'Closing Rate',         0.40::DECIMAL,     '40%',           0.18::DECIMAL,        false, 'percent',  false, 'manual',   ''),
        ('leadership','2026-04-05'::DATE,'Appointments',         12::DECIMAL,       '12',            21::DECIMAL,          true,  'number',   false, 'manual',   ''),
        ('leadership','2026-04-05'::DATE,'Weekly Invoiced',      120000::DECIMAL,   '$120K / $230K', 17646::DECIMAL,       false, 'currency', false, 'qbo',      ''),
        ('leadership','2026-04-05'::DATE,'Total Invoiced (YTD)', 9000000::DECIMAL,  '$9,000,000',    898129.49::DECIMAL,   true,  'currency', false, 'qbo',      ''),
        ('leadership','2026-04-05'::DATE,'Backlog (Weeks)',       4::DECIMAL,       '4 weeks',       8::DECIMAL,           false, 'number',   true,  'manual',   ''),
        ('leadership','2026-04-05'::DATE,'Callbacks (Weeks)',     1::DECIMAL,       '1 week',        3::DECIMAL,           true,  'number',   true,  'manual',   ''),
        ('leadership','2026-04-05'::DATE,'COGS % (YTD)',          0.59::DECIMAL,    '59%',           0.76::DECIMAL,        false, 'percent',  true,  'qbo',      'Big delivery billed this week for Charter Academy. Will balance with end of month billing.'),
        ('leadership','2026-04-05'::DATE,'Net % (YTD)',           0.175::DECIMAL,   '17.5%',         -0.1775::DECIMAL,     false, 'percent',  false, 'qbo',      ''),
        ('leadership','2026-04-05'::DATE,'Cash Balance',          100000::DECIMAL,  'Min $100,000',  168855::DECIMAL,      true,  'currency', false, 'qbo',      ''),
        ('leadership','2026-04-05'::DATE,'AR',                    500000::DECIMAL,  '$500,000',      500000::DECIMAL,      true,  'currency', false, 'qbo',      ''),
        ('leadership','2026-04-05'::DATE,'DSO (Days)',            20::DECIMAL,      '20 days',       37.4::DECIMAL,        false, 'number',   true,  'qbo',      '')
      ) AS v(team, week_of, metric_name, goal, goal_text, actual, is_on_track, display_format, lower_is_better, data_source, notes)
      WHERE NOT EXISTS (SELECT 1 FROM scorecard_entries WHERE team='leadership' AND week_of='2026-04-05')
    `);

    // Seed sales scorecard templates
    // Per-rep rows + a Total row for each metric. Goal on the Total row matches
    // per-rep target (user-configured aggregation: sum for currency/count, avg for rate).
    await client.query(`
      INSERT INTO scorecard_templates (team, metric_name, goal, goal_text, display_format, lower_is_better, sort_order)
      SELECT * FROM (VALUES
        ('sales', 'Pete — Weekly Sales',                          77000::DECIMAL, '$77,000', 'currency', false, 1),
        ('sales', 'Peter — Weekly Sales',                         77000::DECIMAL, '$77,000', 'currency', false, 2),
        ('sales', 'Total — Weekly Sales',                         77000::DECIMAL, '$77,000', 'currency', false, 3),
        ('sales', 'Pete — Close Rate',                            0.45::DECIMAL,  '45%',     'percent',  false, 4),
        ('sales', 'Peter — Close Rate',                           0.45::DECIMAL,  '45%',     'percent',  false, 5),
        ('sales', 'Total — Close Rate',                           0.45::DECIMAL,  '45%',     'percent',  false, 6),
        ('sales', 'Pete — Total Leads (Prev Week Thu–Wed)',       NULL::DECIMAL,  NULL,      'number',   false, 7),
        ('sales', 'Peter — Total Leads (Prev Week Thu–Wed)',      NULL::DECIMAL,  NULL,      'number',   false, 8),
        ('sales', 'Total — Total Leads (Prev Week Thu–Wed)',      NULL::DECIMAL,  NULL,      'number',   false, 9),
        ('sales', 'Pete — Appointments (Last 7 Days Thu–Wed)',    NULL::DECIMAL,  NULL,      'number',   false, 10),
        ('sales', 'Peter — Appointments (Last 7 Days Thu–Wed)',   NULL::DECIMAL,  NULL,      'number',   false, 11),
        ('sales', 'Total — Appointments (Last 7 Days Thu–Wed)',   NULL::DECIMAL,  NULL,      'number',   false, 12),
        ('sales', 'Pete — Self-Generated Leads (Last 7 Days)',    2::DECIMAL,     '2',       'number',   false, 13),
        ('sales', 'Peter — Self-Generated Leads (Last 7 Days)',   2::DECIMAL,     '2',       'number',   false, 14),
        ('sales', 'Total — Self-Generated Leads (Last 7 Days)',   2::DECIMAL,     '2',       'number',   false, 15)
      ) AS v(team, metric_name, goal, goal_text, display_format, lower_is_better, sort_order)
      WHERE NOT EXISTS (SELECT 1 FROM scorecard_templates WHERE team = 'sales')
    `);

    // Seed current week sales scorecard entries (blank actuals — to be filled weekly)
    await client.query(`
      INSERT INTO scorecard_entries (team, week_of, metric_name, goal, goal_text, actual, is_on_track, display_format, lower_is_better, data_source, notes)
      SELECT 'sales', date_trunc('week', CURRENT_DATE)::DATE, metric_name, goal, goal_text, NULL, NULL, display_format, lower_is_better, 'manual', NULL
      FROM scorecard_templates
      WHERE team = 'sales' AND is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM scorecard_entries
          WHERE team = 'sales' AND week_of = date_trunc('week', CURRENT_DATE)::DATE
        )
    `);

    // Seed recurring IDS issues for leadership
    await client.query(`
      INSERT INTO issues (team, title, description, priority, status)
      SELECT * FROM (VALUES
        ('leadership', 'People',                 'Weekly people update: hiring, performance, org changes', 'medium', 'open'),
        ('leadership', 'Cash Flow',              'Weekly cash flow review: AR, AP, runway',                'medium', 'open'),
        ('leadership', 'Capital Purchases',      'Equipment, vehicles, and capital expenditure decisions', 'medium', 'open'),
        ('leadership', 'Marketing / Comm. Eng.', 'Marketing campaigns, truck wraps, community engagement', 'medium', 'open'),
        ('leadership', 'Sales',                  'Sales team updates, pipeline, new business development', 'medium', 'open')
      ) AS v(team, title, description, priority, status)
      WHERE NOT EXISTS (SELECT 1 FROM issues WHERE team='leadership' AND title='People')
    `);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}
