import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
export const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (department_id, name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pens (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (room_id, name)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medicine_sow (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL UNIQUE,
      diagnosis VARCHAR(300) NOT NULL,
      dose_ml NUMERIC(12, 3) NOT NULL CHECK (dose_ml >= 0),
      dose_kg NUMERIC(12, 3) NOT NULL CHECK (dose_kg >= 0),
      course_days INTEGER NOT NULL CHECK (course_days >= 0),
      interval_hours INTEGER NOT NULL CHECK (interval_hours >= 0),
      symptoms TEXT NOT NULL,
      withdrawal_days INTEGER NOT NULL CHECK (withdrawal_days >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medicine_sow_storage (
      id BIGSERIAL PRIMARY KEY,
      medicine_sow_id BIGINT NOT NULL REFERENCES medicine_sow(id) ON DELETE RESTRICT,
      bottle_volume_ml NUMERIC(12, 3) NOT NULL CHECK (bottle_volume_ml >= 0),
      bottle_count INTEGER NOT NULL CHECK (bottle_count >= 0),
      total_volume_ml NUMERIC(14, 3) NOT NULL CHECK (total_volume_ml >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS done_sow_injections (
      id BIGSERIAL PRIMARY KEY,
      sow_number VARCHAR(100) NOT NULL,
      pen_id BIGINT NOT NULL REFERENCES pens(id) ON DELETE RESTRICT,
      injection_date DATE NOT NULL,
      medicine_sow_id BIGINT NOT NULL REFERENCES medicine_sow(id) ON DELETE RESTRICT,
      dose_ml NUMERIC(12,3) NOT NULL CHECK (dose_ml >= 0),
      given_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vet_questions (
      id BIGSERIAL PRIMARY KEY,
      question_date DATE NOT NULL,
      question TEXT NOT NULL,
      photo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stored_files (
      stored_name VARCHAR(255) PRIMARY KEY,
      original_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(255) NOT NULL,
      size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
      uploaded_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_remarks (
      id BIGSERIAL PRIMARY KEY,
      remark_date DATE NOT NULL,
      remark TEXT NOT NULL,
      photo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS repair_locations (
      id BIGSERIAL PRIMARY KEY,
      repair_date DATE NOT NULL,
      location VARCHAR(300) NOT NULL,
      comment TEXT,
      photo TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS todo_items (
      id BIGSERIAL PRIMARY KEY,
      task TEXT NOT NULL,
      due_date DATE NOT NULL,
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK ((is_completed AND completed_at IS NOT NULL) OR (NOT is_completed AND completed_at IS NULL))
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS planed_sow_injections (
      id BIGSERIAL PRIMARY KEY,
      sow_number VARCHAR(100) NOT NULL,
      pen_id BIGINT NOT NULL REFERENCES pens(id) ON DELETE RESTRICT,
      injection_date DATE NOT NULL,
      medicine_sow_id BIGINT NOT NULL,
      dose_ml NUMERIC(12, 3) NOT NULL CHECK (dose_ml >= 0),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    DO $$ BEGIN
      ALTER TABLE planed_sow_injections ADD CONSTRAINT planed_sow_injections_medicine_fk
        FOREIGN KEY (medicine_sow_id) REFERENCES medicine_sow(id) ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);

  const exists = await pool.query('SELECT id FROM users WHERE username = $1', ['Oleksii']);
  if (exists.rowCount === 0) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || '1111', 12);
    await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)',
      ['Oleksii', passwordHash, 'admin'],
    );
  }
}
