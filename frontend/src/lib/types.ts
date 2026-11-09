export type Role = 'student' | 'advisor' | 'admin';
export type Program = 'CS' | 'IT' | 'AI' | 'DS';
export type Season = 'fall' | 'spring' | 'summer';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  status: 'active' | 'inactive' | 'suspended';
  fullName: string;
  phone: string | null;
  mustChangePassword: boolean;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeStudent {
  id: string;
  student_code: string;
  program: Program;
  level: number;
  advisor_id: string | null;
  current_cgpa: string | number | null;
  passed_credits: number;
}

export interface MeAdvisor {
  id: string;
  department_id: string | null;
  office_location: string | null;
  max_students: number;
}

export interface MeResponse {
  user: User;
  student: MeStudent | null;
  advisor: MeAdvisor | null;
}

export type DecisionStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN' | 'REVIEW_REQUIRED';
export type AnomalySeverity = 'blocking' | 'warning' | 'info';

export interface Decision {
  status: DecisionStatus;
  reason_ar: string;
  reason_en: string;
  rule_code: string;
  article: string;
  page: string;
  anomaly_ids: string[];
  flags: string[];
  details: Record<string, unknown>;
  course_code?: string;
}

export interface DecisionTrace {
  decision: Decision;
  loadDecision: Decision;
  escalation: EscalationSummary | null;
}

export interface EscalationSummary {
  id: string;
  ticketNo: string;
  status: string;
}

export interface TermInfo {
  value: string;
  season: Season;
  academicYear: string;
}

export interface TermEnvelope {
  term: string;
  season: Season;
  academicYear: string;
}

/* ---------------------------------- Auth --------------------------------- */

export interface LoginResponse {
  user: User;
  accessToken: string;
  expiresIn: number;
  csrfToken: string;
}

export interface AuthSessionRow {
  id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

/* --------------------------------- Student -------------------------------- */

export interface StudentProfile {
  student: {
    id: string;
    studentCode: string;
    program: Program;
    level: number;
    admissionTerm: string | null;
    cgpa: number;
    passedCredits: number;
    transferCredits: number;
    regularSemestersCompleted: number;
    advisorId: string | null;
  };
  advisor: {
    id: string;
    office_location: string | null;
    max_students: number;
    full_name: string;
    email: string;
  } | null;
  department: { id: string; code: string; name_ar: string; name_en: string } | null;
}

export interface StudentDashboard {
  profile: StudentProfile;
  term: TermInfo;
  standing: AcademicStandingRow | null;
  currentCourses: Array<{
    id: string;
    course_code: string;
    name_en: string;
    name_ar: string;
    credits: number;
    status: string;
    term: string;
  }>;
  recentPlans: StudyPlanListRow[];
  unreadNotifications: number;
  graduation: { requiredCredits: number; passedCredits: number; remainingCredits: number };
  advisoryOnly: true;
}

export interface Enrollment {
  id: string;
  courseCode: string;
  nameEn: string;
  nameAr: string;
  credits: number;
  term: string;
  academicYear: string;
  season: Season;
  gradeLetter: string | null;
  percentage: number | null;
  gradePoints: number | null;
  status: string;
  attemptNo: number;
  countsInGpa: boolean;
  isRepeat: boolean;
}

export interface RecommendedPlan {
  slot: string;
  level: number;
  term: string;
  program: Program;
  totalCredits: number;
  items: Array<{
    position: number;
    kind: 'course' | 'elective';
    courseCode: string | null;
    pool: string | null;
    credits: number;
    nameEn: string | null;
    nameAr: string | null;
  }>;
  advisoryOnly: true;
}

export interface ProgramInfo {
  program: Program;
  pools: Array<{
    code: string;
    name_en: string;
    name_ar: string;
    credits_required: number;
    source: string;
  }>;
}

export interface BulkEligibility {
  term: string;
  decisions: Decision[];
  plannedCredits: number;
  loadDecision: Decision;
  escalations: EscalationSummary[];
  advisoryOnly: true;
}

export interface CourseEligibility extends DecisionTrace {
  advisoryOnly: true;
}

export interface AcademicStandingRow {
  id?: string;
  student_id?: string;
  term: string;
  academic_year?: string;
  sgpa: number | string;
  cgpa: number | string;
  passed_credits: number;
  level: number;
  warning_no: number;
  consecutive_warnings: number;
  total_warnings: number;
  probation: boolean;
  dismissal_risk: boolean;
  final_chance: boolean;
  created_at?: string;
}

export interface StandingResult {
  student_id: string;
  program: Program;
  term: { season: Season; academic_year: string; week: number; is_first_semester: boolean };
  sgpa: number;
  cgpa: number;
  passed_credits: number;
  level: number;
  level_name: { ar?: string; en?: string } | string;
  probation: boolean;
  warning_no: number;
  consecutive_warnings: number;
  total_warnings: number;
  dismissal_risk: boolean;
  final_chance: boolean;
  max_regular_semesters: number;
  regular_semesters_completed: number;
  graduation_possible_this_semester: boolean;
  classification: string;
  classification_en: string;
  decision: Decision;
  dismissal_decision: Decision | null;
  suspension_decision: Decision;
  advisory_only: true;
}

export interface EarlyWarningResult {
  student_id: string;
  program: Program;
  term: { season: Season; academic_year: string; week: number; is_first_semester: boolean };
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number;
  cgpa: number;
  passed_credits: number;
  failed_course_codes: string[];
  current_load: number;
  max_load: number;
  indicators: Array<{
    code: string;
    severity: 'high' | 'medium' | 'low';
    message_en: string;
    message_ar: string;
    rule_code: string;
    article: string;
    page: string;
    anomaly_ids?: string[];
  }>;
  probation: boolean;
  dismissal_risk: boolean;
  recommended_actions: string[];
  advisory_only: true;
}

export interface GraduationResult {
  student_id: string;
  program: Program;
  term: { season: Season; academic_year: string; week: number; is_first_semester: boolean };
  passed_credits: number;
  required_credits: number;
  cgpa: number;
  eligible_to_graduate: boolean;
  missing: Array<{
    requirement: string;
    required?: number;
    actual?: number;
    remaining?: number;
    required_credits?: number;
    earned_credits?: number;
    course_code?: string;
    course_codes?: string[];
    rule_code: string;
    article: string;
    page: string;
    anomaly_ids?: string[];
    message_en: string;
    message_ar: string;
  }>;
  elective_pools: Array<{
    pool: string;
    required_credits: number;
    earned_credits: number;
    satisfied: boolean;
    mandatory_missing: string[];
  }>;
  honors: boolean;
  honors_decision: Decision;
  decision: Decision;
  advisory_only: true;
}

export interface GpaResult {
  sgpa: number;
  cgpa: number;
  total_credits: number;
  quality_points: number;
  courses: Array<Record<string, unknown>>;
  repeat_cap_applied: string[];
  classification: string;
  flags: string[];
}

export interface WhatIfResult {
  student_id: string;
  from_program: Program;
  target_program: Program;
  equivalent_codes: string[];
  non_equivalent_codes: string[];
  remaining_target_codes: string[];
  estimated_remaining_credits: number;
  decision: Decision;
  advisory_only: true;
}

/* ---------------------------------- Plans --------------------------------- */

export interface StudyPlanListRow {
  id: string;
  term: string;
  academic_year?: string;
  season?: Season;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'MODIFIED' | 'REJECTED';
  total_credits: number;
  planning_slot?: string | null;
  feedback?: string | null;
  created_at: string;
  updated_at?: string;
  submitted_at?: string | null;
  student_id?: string;
  student_code?: string;
  program?: Program;
  level?: number;
  full_name?: string;
}

export interface StudyPlanItem {
  id: string;
  position: number;
  credits: number;
  eligibility_status: DecisionStatus;
  rule_code: string;
  reason_ar: string;
  reason_en: string;
  article: string;
  page: string;
  anomaly_ids: string[];
  meeting_times: Array<Record<string, unknown>>;
  course_code: string;
  name_en: string;
  name_ar: string;
}

export interface StudyPlanDetail {
  plan: StudyPlanListRow & {
    student_id: string;
    generated_by: string;
    engine_version: string;
    engine_payload: Record<string, unknown>;
    load_flags: string[];
    notes: string;
    reviewed_by: string | null;
    reviewed_at: string | null;
  };
  items: StudyPlanItem[];
}

export interface GeneratedPlan {
  status: 'DRAFT';
  student_id: string;
  program: Program;
  term: Record<string, unknown>;
  total_credits: number;
  max_credits: number;
  items: Array<{
    course_code: string;
    credits: number;
    priority: number;
    source: string;
    decision: Decision;
    meeting_times: Array<Record<string, unknown>>;
  }>;
  excluded: Decision[];
  load_decision: Decision;
  id: string;
  escalations: EscalationSummary[];
  engine_version: string;
  advisory_only: true;
}

/* --------------------------------- Advisor -------------------------------- */

export interface AdvisorDashboard {
  students: number;
  atRisk: number;
  probations: number;
  pendingPlans: number;
  openCases: number;
  pendingOfficeHourRequests: number;
  officeHours: OfficeHourSlot[];
}

export interface AdvisorStudentRow {
  id: string;
  student_code: string;
  program: Program;
  level: number;
  current_cgpa: string | number;
  passed_credits: number;
  regular_semesters_completed: number;
  full_name: string;
  email: string;
  status?: string;
}

export interface AtRiskRow extends AdvisorStudentRow {
  warning_no: number | null;
  consecutive_warnings: number | null;
  total_warnings: number | null;
  probation: boolean | null;
  dismissal_risk: boolean | null;
  final_chance: boolean | null;
  sgpa: string | number | null;
  standing_term: string | null;
  risk_level: 'critical' | 'high' | 'medium';
}

export interface AdvisorStudentDetail {
  profile: StudentProfile;
  enrollments: Enrollment[];
  latestStanding: AcademicStandingRow | null;
  plans: StudyPlanListRow[];
}

export interface AdvisingNote {
  id: string;
  note: string;
  visibility: 'advisor_only' | 'student';
  created_at: string;
  updated_at: string;
  advisor_name: string;
}

export interface OfficeHourSlot {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  active?: boolean;
  created_at?: string;
}

export interface OfficeHourRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reason: string | null;
  created_at: string;
  updated_at?: string;
  student_id?: string;
  student_code?: string;
  student_name?: string;
  advisor_name?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
}

export interface Escalation {
  id: string;
  ticket_no: string;
  student_id: string;
  created_by: string | null;
  assigned_to: string | null;
  type: 'RULE_ENGINE' | 'PLAN_REVIEW' | 'ACADEMIC' | 'ANOMALY' | 'IMPORT' | 'OTHER';
  status: 'open' | 'in_review' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  description: string;
  related_plan_id: string | null;
  related_course_code: string | null;
  anomaly_ids: string[];
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  student_code?: string;
  student_name?: string;
  assignee_name?: string | null;
}

/* ---------------------------------- Admin --------------------------------- */

export interface Department {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  created_at: string;
  student_count?: number;
}

export interface AdminStudentRow extends AdvisorStudentRow {
  transfer_credits: number;
  advisor_id: string | null;
  department_id: string | null;
  user_id: string;
  phone: string | null;
}

export interface AdminStudentDetail {
  student: AdminStudentRow & {
    admission_term: string | null;
    is_demo: boolean;
    status: string;
    full_name: string;
    email: string;
    phone: string | null;
  };
  advisor: { id: string; office_location: string | null; full_name: string; email: string } | null;
  enrollments: Array<{
    id: string;
    course_code: string;
    name_en: string;
    credits: number;
    term: string;
    status: string;
    grade_letter: string | null;
    percentage: number | null;
    attempt_no: number;
  }>;
  plans: StudyPlanListRow[];
  escalations: Array<{
    id: string;
    ticket_no: string;
    type: string;
    status: string;
    priority: string;
    subject: string;
    created_at: string;
  }>;
}

export interface AdvisorAdminRow {
  id: string;
  user_id: string;
  department_id: string | null;
  office_location: string | null;
  max_students: number;
  full_name: string;
  email: string;
  status: string;
  student_count: number;
}

export interface Course {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  credits: number;
  category: string;
  counts_in_gpa: boolean;
  level_hint: number;
  term_hint: number;
  anomaly_ids: string[];
  active: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface CourseDetail {
  course: Course;
  prerequisites: Array<{
    id: string;
    type: 'prerequisite' | 'corequisite' | 'hours_required';
    required_course_id: string | null;
    required_course_code: string | null;
    min_passed_credit_hours: number | null;
  }>;
  requirements: Array<{
    id: string;
    program: Program;
    role: string;
    pool_id: string | null;
    pool_code: string | null;
  }>;
  offerings: Array<{
    id: string;
    academic_year: string;
    season: Season;
    capacity: number;
    enrolled_count: number;
    status: 'open' | 'closed' | 'cancelled';
  }>;
}

export interface DataAnomaly {
  id: string;
  severity: AnomalySeverity;
  type: string;
  title_ar: string;
  title_en: string | null;
  description_ar: string;
  description_en: string | null;
  sources: Array<Record<string, unknown>>;
  affected_courses: string[];
  affected_rules: string[];
  working_value: string | null;
  resolved_value: string | null;
  engine_behavior: string | null;
  suggested_resolution: string | null;
  status: 'open' | 'resolved';
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegulationRule {
  rule_code: string;
  article_no: string;
  clause_no: string | null;
  page_no: string;
  title_ar: string;
  title_en: string;
  summary_ar: string;
  summary_en: string;
  status: string;
}

export interface RegulationRuleDetail extends RegulationRule {
  id?: string;
  condition?: Record<string, unknown>;
  decision?: string;
  anomalies?: string[];
  source?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  correlation_id: string | null;
  created_at: string;
}

export interface AnalyticsOverview {
  students: { count: number; averageCgpa: number };
  advisors: number;
  courses: number;
  users: { total: string; active: string };
  plans: { total: string; draft: string; submitted: string; approved: string };
  escalations: { total: string; open: string; critical: string };
  imports: { total: string; failed: string };
  anomalies: { open: string; blocking: string; total: string };
}

export interface BottleneckRow {
  code: string;
  name_en: string;
  name_ar: string;
  credits: number;
  level_hint: number;
  failure_count: number;
  attempts: number;
  failure_rate_pct: number;
  downstream_unlocks: number;
}

export interface EnrollmentStatRow {
  program: Program;
  level: number;
  students: number;
  average_cgpa: string | number | null;
  enrollments: number;
  failures: number;
}

export interface EscalationStatRow {
  type: string;
  status: string;
  priority: string;
  count: number;
}

export interface PlanStatRow {
  status: string;
  count: number;
  average_credits: string | number | null;
}

export interface ImportJob {
  id: string;
  type: 'students' | 'transcripts';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  filename: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  error_message: string | null;
  created_by: string;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface ImportRowError {
  id: string;
  row_no: number;
  code: string | null;
  message: string;
  raw: Record<string, string>;
  created_at: string;
}

/* ---------------------------------- Chat ---------------------------------- */

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatCitation {
  article: string;
  clause?: string;
  page: number | string;
  source?: string;
  title?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[] | null;
  confidence?: number | null;
  escalated?: boolean | null;
  rule_code?: string | null;
  created_at: string;
}

export interface ChatAskResult {
  userMessage: ChatMessage;
  assistant: ChatMessage;
  answer: string;
  citations: ChatCitation[];
  confidence: number;
  escalate: boolean;
  escalateReason: string | null;
  anomalyIds: string[];
  escalation: { id: string; ticketNo: string; status: string } | null;
  advisoryOnly: true;
}

/* ------------------------------- Notifications ---------------------------- */

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  channel: string;
  read_at: string | null;
  created_at: string;
}
