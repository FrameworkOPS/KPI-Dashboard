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

    // Seed default admin user
    const adminEmail = 'admin@company.com';
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rows.length === 0) {
      const passwordHash = await bcrypt.hash('Admin1234!', 12);
      await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role, team)
         VALUES ($1, $2, 'Admin', 'User', 'admin', 'all')`,
        [adminEmail, passwordHash]
      );
      console.log('Default admin user created: admin@company.com');
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
        ('leadership','2026-04-05'::DATE,'Weekly Sales',         120000::DECIMAL,   '$120,000',      15564::DECIMAL,       false, 'currency', false, 'hubspot',  'Weighted by the week'),
        ('leadership','2026-04-05'::DATE,'Total Sales (YTD)',    10000000::DECIMAL, '$10,000,000',   812648.45::DECIMAL,   true,  'currency', false, 'hubspot',  ''),
        ('leadership','2026-04-05'::DATE,'Closing Rate',         0.40::DECIMAL,     '40%',           0.18::DECIMAL,        false, 'percent',  false, 'hubspot',  ''),
        ('leadership','2026-04-05'::DATE,'Appointments',         12::DECIMAL,       '12',            21::DECIMAL,          true,  'number',   false, 'hubspot',  ''),
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
