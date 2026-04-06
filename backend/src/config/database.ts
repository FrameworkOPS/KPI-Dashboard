import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'kpi_dashboard',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
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

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}
