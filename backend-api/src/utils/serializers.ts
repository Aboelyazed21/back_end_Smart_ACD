export interface UserRow {
  id: string;
  email: string;
  role: 'student' | 'advisor' | 'admin';
  status: string;
  full_name: string;
  phone?: string | null;
  must_change_password: boolean;
  is_demo: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Central serializer: password_hash and tokens can never leak through this. */
export function toSafeUser(row: UserRow) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    fullName: row.full_name,
    phone: row.phone ?? null,
    mustChangePassword: row.must_change_password,
    isDemo: row.is_demo,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toStudentProfile(row: Record<string, any>) {
  return {
    id: row.id,
    studentCode: row.student_code,
    program: row.program,
    level: row.level,
    admissionTerm: row.admission_term,
    cgpa: Number(row.current_cgpa ?? 0),
    passedCredits: row.passed_credits,
    transferCredits: row.transfer_credits,
    regularSemestersCompleted: row.regular_semesters_completed,
    advisorId: row.advisor_id ?? null,
    advisorName: row.advisor_name ?? null,
    user: row.user_id
      ? toSafeUser({
          id: row.user_id,
          email: row.email,
          role: 'student',
          status: row.user_status,
          full_name: row.full_name,
          phone: row.phone,
          must_change_password: row.must_change_password,
          is_demo: row.is_demo,
          created_at: row.user_created_at,
          updated_at: row.user_updated_at,
        })
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
