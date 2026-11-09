/* eslint-disable */
/**
 * Initial schema for the Smart Academic Advisor.
 * UUID PKs, CHECK constraints, UTC timestamps, FK indexes and append-only audit log.
 */
exports.up = (pgm) => {
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
  if (isProduction && !process.env.DB_APP_PASSWORD) {
    throw new Error('DB_APP_PASSWORD is required when migrating in production');
  }
  const appPassword = (process.env.DB_APP_PASSWORD || 'dev_app_password_change_me').replace(/'/g, "''");
  pgm.sql(`
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- pgvector is required in production. Some development machines cannot install
-- the extension; if the "vector" type already exists (loaded manually or by a
-- previous migration) we reuse it, otherwise fail with an actionable message.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'vector' AND n.nspname = 'public'
  ) THEN
    BEGIN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS vector';
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'pgvector is required: use the pgvector/pgvector PostgreSQL image or install the vector extension';
    END;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2,8}$'),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('student','advisor','admin')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  full_name text NOT NULL,
  phone text,
  must_change_password boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  failed_login_attempts integer NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX users_role_idx ON users(role) WHERE deleted_at IS NULL;
CREATE INDEX users_status_idx ON users(status) WHERE deleted_at IS NULL;

CREATE TABLE advisors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  office_location text,
  max_students integer NOT NULL DEFAULT 60 CHECK (max_students BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX advisors_department_idx ON advisors(department_id);

CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  student_code text NOT NULL UNIQUE CHECK (student_code ~ '^[0-9]{6,15}$'),
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  advisor_id uuid REFERENCES advisors(id) ON DELETE SET NULL,
  program text NOT NULL CHECK (program IN ('CS','IT','AI','DS')),
  level integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
  admission_term text,
  current_cgpa numeric(3,2) NOT NULL DEFAULT 0 CHECK (current_cgpa BETWEEN 0 AND 4),
  passed_credits integer NOT NULL DEFAULT 0 CHECK (passed_credits BETWEEN 0 AND 300),
  transfer_credits integer NOT NULL DEFAULT 0 CHECK (transfer_credits BETWEEN 0 AND 54),
  regular_semesters_completed integer NOT NULL DEFAULT 0 CHECK (regular_semesters_completed BETWEEN 0 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX students_program_idx ON students(program);
CREATE INDEX students_advisor_idx ON students(advisor_id);
CREATE INDEX students_department_idx ON students(department_id);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{3}[0-9]{4}$'),
  name_ar text NOT NULL,
  name_en text NOT NULL,
  credits integer NOT NULL CHECK (credits BETWEEN 0 AND 12),
  category text NOT NULL,
  counts_in_gpa boolean NOT NULL DEFAULT true,
  level_hint integer NOT NULL CHECK (level_hint BETWEEN 1 AND 4),
  term_hint integer NOT NULL CHECK (term_hint BETWEEN 1 AND 2),
  anomaly_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX courses_active_idx ON courses(active) WHERE deleted_at IS NULL;
CREATE INDEX courses_search_idx ON courses USING gin (to_tsvector('simple', code || ' ' || name_ar || ' ' || name_en));

CREATE TABLE elective_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text NOT NULL,
  credits_required integer NOT NULL CHECK (credits_required BETWEEN 0 AND 30),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE elective_pool_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES elective_pools(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  is_mandatory boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, course_id)
);
CREATE INDEX elective_pool_courses_course_idx ON elective_pool_courses(course_id);

CREATE TABLE course_prerequisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('prerequisite','corequisite','hours_required')),
  required_course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  min_passed_credit_hours integer CHECK (min_passed_credit_hours IS NULL OR min_passed_credit_hours BETWEEN 0 AND 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (type IN ('prerequisite','corequisite') AND required_course_id IS NOT NULL)
    OR (type = 'hours_required' AND min_passed_credit_hours IS NOT NULL)
  ),
  UNIQUE (course_id, type, required_course_id)
);
CREATE INDEX course_prerequisites_course_idx ON course_prerequisites(course_id);
CREATE INDEX course_prerequisites_required_idx ON course_prerequisites(required_course_id);

CREATE TABLE program_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program text NOT NULL CHECK (program IN ('CS','IT','AI','DS')),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('compulsory','lab','project','field_training','selected_topic','elective')),
  pool_id uuid REFERENCES elective_pools(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program, course_id, role)
);
CREATE INDEX program_requirements_program_idx ON program_requirements(program);
CREATE INDEX program_requirements_course_idx ON program_requirements(course_id);

CREATE TABLE recommended_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program text NOT NULL,
  level integer NOT NULL CHECK (level BETWEEN 1 AND 4),
  term integer NOT NULL CHECK (term IN (1,2)),
  position integer NOT NULL CHECK (position >= 0),
  course_id uuid REFERENCES courses(id) ON DELETE CASCADE,
  pool_id uuid REFERENCES elective_pools(id) ON DELETE CASCADE,
  credits integer NOT NULL CHECK (credits BETWEEN 0 AND 12),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (course_id IS NOT NULL OR pool_id IS NOT NULL),
  UNIQUE (program, level, term, position)
);
CREATE INDEX recommended_plans_program_idx ON recommended_plans(program, level, term);

CREATE TABLE course_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  academic_year text NOT NULL CHECK (academic_year ~ '^[0-9]{4}-[0-9]{4}$'),
  season text NOT NULL CHECK (season IN ('fall','spring','summer')),
  capacity integer NOT NULL DEFAULT 50 CHECK (capacity BETWEEN 0 AND 1000),
  enrolled_count integer NOT NULL DEFAULT 0 CHECK (enrolled_count BETWEEN 0 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, academic_year, season)
);
CREATE INDEX course_offerings_term_idx ON course_offerings(academic_year, season);
CREATE INDEX course_offerings_course_idx ON course_offerings(course_id);

CREATE TABLE meeting_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  day text NOT NULL CHECK (day IN ('sat','sun','mon','tue','wed','thu','fri')),
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX meeting_times_offering_idx ON meeting_times(offering_id);

CREATE TABLE exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id uuid NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  exam_type text NOT NULL CHECK (exam_type IN ('midterm','final','oral','practical')),
  exam_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  room text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX exams_offering_idx ON exams(offering_id);

CREATE TABLE enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  offering_id uuid REFERENCES course_offerings(id) ON DELETE SET NULL,
  term text NOT NULL,
  academic_year text NOT NULL,
  season text NOT NULL CHECK (season IN ('fall','spring','summer')),
  grade_letter text,
  percentage numeric(5,2) CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  grade_points numeric(3,2) CHECK (grade_points IS NULL OR (grade_points >= 0 AND grade_points <= 4)),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('passed','failed','in_progress','withdrawn','incomplete','continued','absent')),
  attempt_no integer NOT NULL DEFAULT 1 CHECK (attempt_no BETWEEN 1 AND 20),
  counts_in_gpa boolean NOT NULL DEFAULT true,
  is_repeat boolean NOT NULL DEFAULT false,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id, term, attempt_no)
);
CREATE INDEX enrollments_student_idx ON enrollments(student_id);
CREATE INDEX enrollments_course_idx ON enrollments(course_id);
CREATE INDEX enrollments_offering_idx ON enrollments(offering_id);
CREATE INDEX enrollments_status_idx ON enrollments(status);
CREATE INDEX enrollments_term_idx ON enrollments(term);

CREATE TABLE grade_scale (
  letter text PRIMARY KEY,
  min_pct numeric(5,2) NOT NULL CHECK (min_pct BETWEEN 0 AND 100),
  max_pct_exclusive numeric(5,2),
  points numeric(3,2) NOT NULL CHECK (points BETWEEN 0 AND 4),
  counts_in_gpa boolean NOT NULL DEFAULT true,
  passed boolean NOT NULL
);

CREATE TABLE regulation_rules (
  rule_code text PRIMARY KEY,
  article_no text NOT NULL,
  clause_no text,
  page_no text NOT NULL,
  title_ar text NOT NULL,
  title_en text,
  summary_ar text NOT NULL,
  summary_en text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE data_anomalies (
  id text PRIMARY KEY CHECK (id ~ '^A-[A-Z]+-[0-9]{2}$'),
  severity text NOT NULL CHECK (severity IN ('blocking','warning','info')),
  type text NOT NULL,
  title_ar text NOT NULL,
  title_en text,
  description_ar text NOT NULL,
  description_en text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_courses jsonb NOT NULL DEFAULT '[]'::jsonb,
  affected_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  working_value text,
  resolved_value text,
  engine_behavior text,
  suggested_resolution text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX data_anomalies_status_idx ON data_anomalies(status, severity);

CREATE TABLE study_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term text NOT NULL,
  academic_year text NOT NULL,
  season text NOT NULL CHECK (season IN ('fall','spring','summer')),
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','MODIFIED','REJECTED')),
  total_credits integer NOT NULL DEFAULT 0 CHECK (total_credits BETWEEN 0 AND 21),
  generated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  engine_version text,
  planning_slot text,
  load_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  engine_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  feedback text,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX study_plans_student_idx ON study_plans(student_id);
CREATE INDEX study_plans_status_idx ON study_plans(status);

CREATE TABLE study_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position >= 0),
  credits integer NOT NULL CHECK (credits BETWEEN 0 AND 12),
  eligibility_status text NOT NULL CHECK (eligibility_status IN ('ELIGIBLE','NOT_ELIGIBLE','UNKNOWN','REVIEW_REQUIRED')),
  rule_code text NOT NULL,
  reason_ar text NOT NULL,
  reason_en text NOT NULL,
  article text NOT NULL,
  page text NOT NULL,
  anomaly_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  meeting_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, course_id)
);
CREATE INDEX study_plan_items_plan_idx ON study_plan_items(plan_id);
CREATE INDEX study_plan_items_course_idx ON study_plan_items(course_id);

CREATE TABLE eligibility_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  course_code text NOT NULL,
  term text NOT NULL,
  status text NOT NULL CHECK (status IN ('ELIGIBLE','NOT_ELIGIBLE','UNKNOWN','REVIEW_REQUIRED')),
  rule_code text NOT NULL,
  article text NOT NULL,
  page text NOT NULL,
  reason_ar text NOT NULL,
  reason_en text NOT NULL,
  anomaly_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX eligibility_checks_student_idx ON eligibility_checks(student_id, term);
CREATE INDEX eligibility_checks_status_idx ON eligibility_checks(status);

CREATE TABLE academic_standing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  term text NOT NULL,
  academic_year text NOT NULL,
  sgpa numeric(3,2) NOT NULL CHECK (sgpa BETWEEN 0 AND 4),
  cgpa numeric(3,2) NOT NULL CHECK (cgpa BETWEEN 0 AND 4),
  passed_credits integer NOT NULL CHECK (passed_credits >= 0),
  level integer NOT NULL CHECK (level BETWEEN 1 AND 4),
  warning_no integer NOT NULL DEFAULT 0 CHECK (warning_no >= 0),
  consecutive_warnings integer NOT NULL DEFAULT 0 CHECK (consecutive_warnings >= 0),
  total_warnings integer NOT NULL DEFAULT 0 CHECK (total_warnings >= 0),
  probation boolean NOT NULL DEFAULT false,
  dismissal_risk boolean NOT NULL DEFAULT false,
  final_chance boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, term)
);
CREATE INDEX academic_standing_student_idx ON academic_standing(student_id);

CREATE TABLE escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_no text NOT NULL UNIQUE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('RULE_ENGINE','PLAN_REVIEW','ACADEMIC','ANOMALY','IMPORT','OTHER')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','closed')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  subject text NOT NULL,
  description text NOT NULL,
  related_plan_id uuid REFERENCES study_plans(id) ON DELETE SET NULL,
  related_course_code text,
  anomaly_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX escalations_student_idx ON escalations(student_id);
CREATE INDEX escalations_assigned_idx ON escalations(assigned_to);
CREATE INDEX escalations_status_idx ON escalations(status);
CREATE INDEX escalations_ticket_idx ON escalations(ticket_no);

CREATE TABLE escalation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  escalation_id uuid NOT NULL REFERENCES escalations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX escalation_events_escalation_idx ON escalation_events(escalation_id);

CREATE TABLE advising_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  note text NOT NULL,
  visibility text NOT NULL DEFAULT 'advisor_only' CHECK (visibility IN ('advisor_only','student')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX advising_notes_student_idx ON advising_notes(student_id);

CREATE TABLE office_hour_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_id uuid NOT NULL REFERENCES advisors(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  location text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_time < end_time)
);
CREATE INDEX office_hour_slots_advisor_idx ON office_hour_slots(advisor_id);

CREATE TABLE office_hour_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES office_hour_slots(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX office_hour_requests_slot_idx ON office_hour_requests(slot_id);
CREATE INDEX office_hour_requests_student_idx ON office_hour_requests(student_id);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','email')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, read_at);

CREATE TABLE policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_file text NOT NULL,
  checksum text NOT NULL UNIQUE,
  page_count integer NOT NULL DEFAULT 0,
  language text NOT NULL DEFAULT 'ar',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE policy_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
  article_no text NOT NULL,
  clause_no text NOT NULL DEFAULT '',
  page_no integer NOT NULL CHECK (page_no >= 1),
  language text NOT NULL DEFAULT 'ar',
  title text,
  text text NOT NULL,
  text_normalized text NOT NULL,
  source_ref text NOT NULL,
  chunk_hash text NOT NULL UNIQUE,
  embedding vector(384) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX policy_chunks_document_idx ON policy_chunks(document_id);
CREATE INDEX policy_chunks_embedding_idx ON policy_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Advising chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_sessions_student_idx ON chat_sessions(student_id);

CREATE TABLE chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(4,3) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  escalated boolean NOT NULL DEFAULT false,
  rule_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_session_idx ON chat_messages(session_id);

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('students','transcripts')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  filename text NOT NULL,
  stored_path text,
  total_rows integer NOT NULL DEFAULT 0,
  success_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_jobs_status_idx ON import_jobs(status);

CREATE TABLE import_row_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_no integer NOT NULL,
  code text,
  message text NOT NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX import_row_errors_job_idx ON import_row_errors(job_id);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid,
  user_agent text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens(family_id);

CREATE TABLE password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX password_resets_user_idx ON password_resets(user_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at);

CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

-- updated_at triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['departments','users','advisors','students','courses','elective_pools',
    'course_offerings','enrollments','regulation_rules','data_anomalies','study_plans','escalations',
    'advising_notes','office_hour_slots','office_hour_requests','chat_sessions']
  LOOP
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- Least-privilege application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'smart_advisor_app') THEN
    CREATE ROLE smart_advisor_app LOGIN PASSWORD '${appPassword}';
  ELSE
    ALTER ROLE smart_advisor_app WITH LOGIN PASSWORD '${appPassword}';
  END IF;
END $$;
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO smart_advisor_app', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO smart_advisor_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smart_advisor_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smart_advisor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smart_advisor_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO smart_advisor_app;
REVOKE UPDATE, DELETE ON audit_logs FROM smart_advisor_app;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS import_row_errors CASCADE;
DROP TABLE IF EXISTS import_jobs CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
DROP TABLE IF EXISTS policy_chunks CASCADE;
DROP TABLE IF EXISTS policy_documents CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS office_hour_requests CASCADE;
DROP TABLE IF EXISTS office_hour_slots CASCADE;
DROP TABLE IF EXISTS advising_notes CASCADE;
DROP TABLE IF EXISTS escalation_events CASCADE;
DROP TABLE IF EXISTS escalations CASCADE;
DROP TABLE IF EXISTS academic_standing CASCADE;
DROP TABLE IF EXISTS eligibility_checks CASCADE;
DROP TABLE IF EXISTS study_plan_items CASCADE;
DROP TABLE IF EXISTS study_plans CASCADE;
DROP TABLE IF EXISTS data_anomalies CASCADE;
DROP TABLE IF EXISTS regulation_rules CASCADE;
DROP TABLE IF EXISTS grade_scale CASCADE;
DROP TABLE IF EXISTS enrollments CASCADE;
DROP TABLE IF EXISTS exams CASCADE;
DROP TABLE IF EXISTS meeting_times CASCADE;
DROP TABLE IF EXISTS course_offerings CASCADE;
DROP TABLE IF EXISTS recommended_plans CASCADE;
DROP TABLE IF EXISTS program_requirements CASCADE;
DROP TABLE IF EXISTS course_prerequisites CASCADE;
DROP TABLE IF EXISTS elective_pool_courses CASCADE;
DROP TABLE IF EXISTS elective_pools CASCADE;
DROP TABLE IF EXISTS courses CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP TABLE IF EXISTS advisors CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP FUNCTION IF EXISTS forbid_audit_mutation() CASCADE;
DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
  `);
};
