export async function initializeFarestald(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS farestald_farrowing_batches (
    id UUID PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`
CREATE TABLE IF NOT EXISTS farestald_medicine_sow (
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
    );
CREATE TABLE IF NOT EXISTS farestald_medicine_sow_storage (
      id BIGSERIAL PRIMARY KEY,
      medicine_sow_id BIGINT NOT NULL REFERENCES farestald_medicine_sow(id) ON DELETE RESTRICT,
      bottle_volume_ml NUMERIC(12, 3) NOT NULL CHECK (bottle_volume_ml >= 0),
      bottle_count INTEGER NOT NULL CHECK (bottle_count >= 0),
      total_volume_ml NUMERIC(14, 3) NOT NULL CHECK (total_volume_ml >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
CREATE TABLE IF NOT EXISTS farestald_planed_sow_injections (
      id BIGSERIAL PRIMARY KEY,
      sow_number VARCHAR(100) NOT NULL,
      pen_id BIGINT NOT NULL REFERENCES pens(id) ON DELETE RESTRICT,
      injection_date DATE NOT NULL,
      weight_kg INTEGER CHECK (weight_kg > 0),
      medicine_sow_id BIGINT NOT NULL REFERENCES farestald_medicine_sow(id) ON DELETE RESTRICT,
      dose_ml NUMERIC(12, 3) NOT NULL CHECK (dose_ml >= 0),
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
CREATE TABLE IF NOT EXISTS farestald_done_sow_injections (
      id BIGSERIAL PRIMARY KEY,
      sow_number VARCHAR(100) NOT NULL,
      pen_id BIGINT NOT NULL REFERENCES pens(id) ON DELETE RESTRICT,
      injection_date DATE NOT NULL,
      weight_kg INTEGER CHECK (weight_kg > 0),
      medicine_sow_id BIGINT NOT NULL REFERENCES farestald_medicine_sow(id) ON DELETE RESTRICT,
      dose_ml NUMERIC(12,3) NOT NULL CHECK (dose_ml >= 0),
      given_by_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      comment TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
