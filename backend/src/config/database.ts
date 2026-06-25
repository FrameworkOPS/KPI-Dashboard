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

    // Roster-only people: tracked on the org chart but never log in. No email
    // / password required. Login query already filters active=true so these
    // rows are excluded from authentication.
    await client.query(`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`);
    await client.query(`ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS roster_only BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS job_duties JSONB NOT NULL DEFAULT '[]'`);

    // Multi-team membership. `team` stays as the primary team (back-compat
    // with the JWT and the canAccessTeam helper); `teams` is the source of
    // truth when set. Existing rows are back-filled with their single team.
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS teams JSONB NOT NULL DEFAULT '[]'`);
    await client.query(`
      UPDATE users
         SET teams = jsonb_build_array(team)
       WHERE (teams = '[]'::jsonb OR teams IS NULL) AND team IS NOT NULL
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

    // seat_documents table — files attached to a seat (stored in object storage)
    await client.query(`
      CREATE TABLE IF NOT EXISTS seat_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        seat_id UUID NOT NULL REFERENCES accountability_seats(id) ON DELETE CASCADE,
        file_name VARCHAR(500) NOT NULL,
        mime_type VARCHAR(200),
        file_size BIGINT,
        storage_key TEXT NOT NULL,
        uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_seat_documents_seat ON seat_documents(seat_id)`);

    // Inline-storage fallback: when no object storage is configured, the file
    // bytes are written straight into the row. storage_key is nullable in that
    // mode. file_data is BYTEA and gets streamed out by the download endpoint.
    await client.query(`ALTER TABLE seat_documents ADD COLUMN IF NOT EXISTS file_data BYTEA`);
    await client.query(`ALTER TABLE seat_documents ALTER COLUMN storage_key DROP NOT NULL`);

    // Allow a free-text seat holder name when the holder isn't a User row
    // (vendors, contractors, placeholder names, etc.). owner_id still wins
    // when both are set.
    await client.query(`ALTER TABLE accountability_seats ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255)`);

    // Seed the org-chart scaffold (CEO → COO → Sales / Marketing / Production / Finance).
    // Idempotent and additive: inserts any seat from the scaffold that doesn't
    // already exist by name, parents departments under COO when COO exists.
    // Existing custom seats are left alone.
    {
      const ensureSeat = async (
        name: string,
        desc: string,
        parentId: string | null,
        duties: string[],
        sortOrder: number,
      ): Promise<string> => {
        const found = await client.query(
          'SELECT id FROM accountability_seats WHERE seat_name = $1 LIMIT 1',
          [name],
        );
        if (found.rows[0]) return found.rows[0].id;
        const inserted = await client.query(
          `INSERT INTO accountability_seats (seat_name, seat_description, parent_seat_id, responsibilities, sort_order)
           VALUES ($1, $2, $3, $4::jsonb, $5)
           RETURNING id`,
          [name, desc, parentId, JSON.stringify(duties), sortOrder],
        );
        console.log(`Seeded accountability seat: ${name}`);
        return inserted.rows[0].id;
      };

      const ceoId = await ensureSeat('CEO', 'Chief Executive Officer', null, [
        'Set vision and strategic direction',
        'Drive company culture and core values',
        'Make final decisions on major investments',
        'Build and lead the leadership team',
        'Own profitability and growth',
      ], 0);
      const cooId = await ensureSeat('COO', 'Chief Operating Officer', ceoId, [
        'Run day-to-day operations',
        'Integrate leadership team output',
        'Remove obstacles for departments',
        'Hold leaders accountable to numbers',
        'Drive operational excellence',
      ], 0);
      const departments: { name: string; desc: string; duties: string[] }[] = [
        {
          name: 'Sales', desc: 'Owns revenue and the sales engine',
          duties: [
            'Hit weekly and monthly sales targets',
            'Manage and coach the sales team',
            'Own the close rate and pipeline health',
            'Refine the sales process and playbook',
            'Partner with marketing on lead quality',
          ],
        },
        {
          name: 'Marketing', desc: 'Owns lead generation and brand',
          duties: [
            'Generate qualified leads at target CPL',
            'Manage paid and organic channels',
            'Own brand, website, and creative',
            'Measure marketing-sourced revenue',
            'Plan and execute campaigns',
          ],
        },
        {
          name: 'Production', desc: 'Owns project delivery and quality',
          duties: [
            'Deliver every project on schedule',
            'Hold quality, safety, and warranty standards',
            'Manage crews, vendors, and materials',
            'Own gross margin on installed jobs',
            'Resolve callbacks and customer issues',
          ],
        },
        {
          name: 'Finance', desc: 'Owns accounting, cash, and reporting',
          duties: [
            'Maintain accurate books and clean P&L',
            'Manage AR, AP, and cash flow',
            'Produce weekly and monthly reporting',
            'Own budgeting and forecasting',
            'Ensure tax and compliance hygiene',
          ],
        },
      ];
      for (let i = 0; i < departments.length; i++) {
        const d = departments[i];
        await ensureSeat(d.name, d.desc, cooId, d.duties, i);
      }
    }

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
    // Recurring weekly meetings: lazily upserted by the meetings list endpoint.
    // `is_recurring` flags rows generated from a weekly rule (vs. one-off);
    // `started_at` / `completed_at` capture the actual run times for the runner.
    await client.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS started_at TIMESTAMP`);
    await client.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
    // Non-unique index to keep recurring-meeting upsert lookups fast.
    await client.query(`CREATE INDEX IF NOT EXISTS idx_meetings_team_date ON meetings(team, meeting_date)`);

    // Meeting stages — the EOS Level 10 agenda steps as runtime state, so the
    // in-meeting wizard can track which step is active and how long it took.
    await client.query(`
      CREATE TABLE IF NOT EXISTS meeting_stages (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        stage_key VARCHAR(50) NOT NULL,
        label VARCHAR(100) NOT NULL,
        planned_minutes INT NOT NULL,
        sort_order INT NOT NULL,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(meeting_id, stage_key)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_meeting_stages_meeting ON meeting_stages(meeting_id)`);

    // Meeting attendance — one row per (meeting, user). Captures present/absent
    // and the post-meeting 1–10 rating from each attendee.
    await client.query(`
      CREATE TABLE IF NOT EXISTS meeting_attendance (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'present',
        rating INT CHECK (rating BETWEEN 1 AND 10),
        comments TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(meeting_id, user_id)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_meeting_attendance_meeting ON meeting_attendance(meeting_id)`);

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

    // Seed leadership scorecard templates. Metrics that JobNimbus auto-fills
    // (Weekly Sales → "$ Sold (JobNimbus)", Closing Rate → "Closing Rate
    // (JobNimbus)", Appointments → "New Leads (JobNimbus)") are intentionally
    // omitted here so they don't get re-created on every boot after the JN
    // dedup migration deletes them.
    await client.query(`
      INSERT INTO scorecard_templates (team, metric_name, goal, goal_text, display_format, lower_is_better, sort_order)
      SELECT * FROM (VALUES
        ('leadership', 'Total Sales (YTD)',     10000000::DECIMAL,  '$10,000,000',        'currency', false,  2),
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
      ON CONFLICT (team, metric_name) DO NOTHING
    `);

    // Belt-and-suspenders: if a previous boot seeded the dedup'd manual
    // metrics, drop them now. JN sync also does this, but doing it here keeps
    // the scorecard clean even if a JN sync hasn't run yet.
    await client.query(`
      DELETE FROM scorecard_entries
       WHERE team = 'leadership' AND metric_name IN ('Weekly Sales','Closing Rate','Appointments')
    `);
    await client.query(`
      DELETE FROM scorecard_templates
       WHERE team = 'leadership' AND metric_name IN ('Weekly Sales','Closing Rate','Appointments')
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

    // Seed production scorecard templates (idempotent per metric_name).
    await client.query(`
      INSERT INTO scorecard_templates (team, metric_name, goal, goal_text, display_format, lower_is_better, sort_order)
      VALUES
        ('production', '$ Invoiced',               150000::DECIMAL, '$150K / week', 'currency', false, 1),
        ('production', '# Scheduled',              NULL::DECIMAL,   NULL,           'number',   false, 2),
        ('production', '# Completed',              NULL::DECIMAL,   NULL,           'number',   false, 3),
        ('production', 'Job Profitability % GP',   NULL::DECIMAL,   '% GP Goal',    'percent',  false, 4),
        ('production', 'LF Mat Scheduled vs Ran',  NULL::DECIMAL,   NULL,           'number',   false, 5)
      ON CONFLICT (team, metric_name) DO NOTHING
    `);

    // Seed current week production scorecard entries (blank actuals).
    await client.query(`
      INSERT INTO scorecard_entries (team, week_of, metric_name, goal, goal_text, actual, is_on_track, display_format, lower_is_better, data_source, notes)
      SELECT 'production', date_trunc('week', CURRENT_DATE)::DATE, metric_name, goal, goal_text, NULL, NULL, display_format, lower_is_better, 'manual', NULL
      FROM scorecard_templates
      WHERE team = 'production' AND is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM scorecard_entries
          WHERE team = 'production' AND week_of = date_trunc('week', CURRENT_DATE)::DATE
            AND metric_name = scorecard_templates.metric_name
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

    // ── People Analyzer (EOS quarterly review) ────────────────────────────────
    // core_values: the company-wide values each person is scored against.
    // people_analyzer_entries: one row per (subject, quarter, year). Stores
    //   value_scores as { core_value_id -> '+' | '-' | '+/-' } and gwc as
    //   { get, want, capacity } booleans. Notes are free text.
    await client.query(`
      CREATE TABLE IF NOT EXISTS core_values (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(120) NOT NULL,
        description TEXT,
        sort_order INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS people_analyzer_entries (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        subject_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        quarter INT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
        year INT NOT NULL,
        value_scores JSONB NOT NULL DEFAULT '{}',
        gwc_get BOOLEAN,
        gwc_want BOOLEAN,
        gwc_capacity BOOLEAN,
        notes TEXT,
        evaluated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(subject_user_id, quarter, year)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pae_subject ON people_analyzer_entries(subject_user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pae_quarter_year ON people_analyzer_entries(quarter, year)`);

    // Seed default SkyRight core values (idempotent — only adds them if the
    // table is empty so admins can edit/replace without them coming back).
    await client.query(`
      INSERT INTO core_values (name, description, sort_order)
      SELECT * FROM (VALUES
        ('Do the Right Thing',    'Integrity in every job, every quote, every conversation.', 0),
        ('Own the Outcome',       'Take responsibility — no excuses, no finger-pointing.',     1),
        ('Move with Urgency',     'Roof leaks don''t wait. We don''t either.',                 2),
        ('Be Coachable',          'Stay humble, seek feedback, get better every week.',        3),
        ('Customer for Life',     'Every interaction earns the next referral.',                4)
      ) AS v(name, description, sort_order)
      WHERE NOT EXISTS (SELECT 1 FROM core_values)
    `);

    // ── Production Forecaster tables ────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS crews (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        crew_name VARCHAR(255) NOT NULL,
        crew_type VARCHAR(50) NOT NULL,
        team_members INTEGER NOT NULL,
        training_period_days INTEGER NOT NULL,
        start_date DATE NOT NULL,
        terminate_date DATE,
        revenue_per_sq DECIMAL(10,2),
        weekly_sq_capacity DECIMAL(10,2),
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crews_type ON crews(crew_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crews_active ON crews(is_active)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS crew_staff (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
        lead_count INTEGER NOT NULL DEFAULT 0,
        super_count INTEGER NOT NULL DEFAULT 0,
        added_date DATE NOT NULL,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crew_staff_crew_id ON crew_staff(crew_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS custom_projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        crew_id UUID NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
        project_name VARCHAR(255) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_custom_projects_crew_id ON custom_projects(crew_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_custom_projects_dates ON custom_projects(start_date, end_date)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS production_parameters (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        current_production_rate DECIMAL(10,2) NOT NULL,
        ramp_up_time_days INTEGER NOT NULL,
        crew_capacity INTEGER NOT NULL,
        max_concurrent_jobs INTEGER NOT NULL,
        seasonal_adjustment DECIMAL(5,2) DEFAULT 1.0,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pipeline_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_type VARCHAR(50) NOT NULL,
        square_footage DECIMAL(10,2) NOT NULL,
        estimated_days_to_completion INTEGER NOT NULL,
        revenue_per_sq DECIMAL(10,2) NOT NULL,
        total_revenue DECIMAL(12,2) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        added_date DATE NOT NULL,
        target_start_date DATE,
        notes TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pipeline_type ON pipeline_items(job_type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pipeline_status ON pipeline_items(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pipeline_dates ON pipeline_items(added_date, target_start_date)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sales_forecast (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        forecast_week DATE NOT NULL,
        job_type VARCHAR(50) NOT NULL,
        projected_square_footage DECIMAL(10,2) NOT NULL,
        projected_job_count INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        UNIQUE(forecast_week, job_type)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sales_forecast_week_type ON sales_forecast(forecast_week, job_type)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS production_actuals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        production_week DATE NOT NULL,
        job_type VARCHAR(50) NOT NULL,
        crew_id UUID REFERENCES crews(id) ON DELETE SET NULL,
        square_footage_completed DECIMAL(10,2) NOT NULL,
        jobs_completed INTEGER NOT NULL DEFAULT 0,
        hours_worked DECIMAL(8,2),
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_production_actuals_week_type ON production_actuals(production_week, job_type)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS metrics_snapshots (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        metric_week DATE NOT NULL,
        job_type VARCHAR(50) NOT NULL,
        pipeline_sqs DECIMAL(12,2) NOT NULL,
        pipeline_jobs INTEGER NOT NULL DEFAULT 0,
        sales_forecast_sqs DECIMAL(12,2) NOT NULL,
        production_rate_sqs DECIMAL(12,2) NOT NULL,
        revenue_projected DECIMAL(14,2) NOT NULL,
        revenue_produced DECIMAL(14,2) NOT NULL,
        queue_growth DECIMAL(12,2) NOT NULL,
        avg_lead_time_days INTEGER NOT NULL,
        capacity_utilization DECIMAL(5,4) NOT NULL,
        bottleneck_detected BOOLEAN DEFAULT false,
        bottleneck_reason TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_metrics_snapshots_week_type ON metrics_snapshots(metric_week, job_type)`);

    // Estimating tool tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS estimate_projects (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        project_address VARCHAR(500),
        gc_name VARCHAR(255),
        bid_date DATE,
        project_type VARCHAR(50) DEFAULT 'roofing',
        status VARCHAR(50) DEFAULT 'draft',
        stage VARCHAR(50) DEFAULT 'new',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS estimate_documents (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES estimate_projects(id) ON DELETE CASCADE,
        file_name VARCHAR(500) NOT NULL,
        file_path VARCHAR(1000) NOT NULL DEFAULT '',
        doc_type VARCHAR(50),
        parsed BOOLEAN DEFAULT false,
        parsed_data JSONB,
        parsed_at TIMESTAMP,
        file_bytes BYTEA,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimate_docs_project ON estimate_documents(project_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS estimate_specs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES estimate_projects(id) ON DELETE CASCADE,
        section VARCHAR(255),
        spec_type VARCHAR(100),
        description TEXT,
        value TEXT,
        source_doc_id UUID REFERENCES estimate_documents(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimate_specs_project ON estimate_specs(project_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS estimate_line_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES estimate_projects(id) ON DELETE CASCADE,
        category VARCHAR(100),
        description VARCHAR(500) NOT NULL,
        quantity DECIMAL(12,2),
        unit VARCHAR(50),
        unit_price DECIMAL(10,2),
        waste_factor DECIMAL(5,2) DEFAULT 0,
        notes TEXT,
        sort_order INTEGER DEFAULT 0,
        material_key VARCHAR(150),
        price_flagged BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimate_line_items_project ON estimate_line_items(project_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS material_prices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        material_key VARCHAR(150) NOT NULL UNIQUE,
        category VARCHAR(100) NOT NULL,
        description VARCHAR(500) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        unit_cost DECIMAL(10,2) NOT NULL,
        vendor VARCHAR(255),
        notes TEXT,
        last_updated TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_material_prices_key ON material_prices(material_key)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS labor_prices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        material_key VARCHAR(150) NOT NULL UNIQUE,
        category VARCHAR(100) NOT NULL,
        description VARCHAR(500) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        unit_cost DECIMAL(10,2) NOT NULL,
        notes TEXT,
        last_updated TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_labor_prices_key ON labor_prices(material_key)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS estimate_concerns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES estimate_projects(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        severity VARCHAR(50) DEFAULT 'medium',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimate_concerns_project ON estimate_concerns(project_id)`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS estimate_takeoffs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        project_id UUID REFERENCES estimate_projects(id) ON DELETE CASCADE,
        label VARCHAR(255) NOT NULL,
        value DECIMAL(12,2),
        unit VARCHAR(50),
        category VARCHAR(100),
        source VARCHAR(100),
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_estimate_takeoffs_project ON estimate_takeoffs(project_id)`);

    // Seed default production parameters if none exist
    await client.query(`
      INSERT INTO production_parameters (current_production_rate, ramp_up_time_days, crew_capacity, max_concurrent_jobs, seasonal_adjustment, notes)
      SELECT 100, 30, 5, 10, 1.0, 'Default parameters — update as needed'
      WHERE NOT EXISTS (SELECT 1 FROM production_parameters)
    `);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}
