import type { DecisionStatus, Program, Season, Role } from './types';

export const PROGRAM_LABELS: Record<Program, { ar: string; en: string; short: string }> = {
  CS: { ar: 'علوم الحاسب', en: 'Computer Science', short: 'CS' },
  IT: { ar: 'تكنولوجيا المعلومات', en: 'Information Technology', short: 'IT' },
  AI: { ar: 'الذكاء الاصطناعي', en: 'Artificial Intelligence', short: 'AI' },
  DS: { ar: 'علوم البيانات', en: 'Data Science', short: 'DS' },
};

export const ROLE_LABELS: Record<Role, string> = {
  student: 'طالب',
  advisor: 'مرشد أكاديمي',
  admin: 'مسؤول النظام',
};

export const DECISION_LABELS: Record<
  DecisionStatus,
  { ar: string; en: string; tone: 'success' | 'danger' | 'warning' | 'neutral' }
> = {
  ELIGIBLE: { ar: 'مؤهل', en: 'Eligible', tone: 'success' },
  NOT_ELIGIBLE: { ar: 'غير مؤهل', en: 'Not eligible', tone: 'danger' },
  UNKNOWN: { ar: 'غير معروف', en: 'Unknown', tone: 'neutral' },
  REVIEW_REQUIRED: { ar: 'يحتاج مراجعة', en: 'Review required', tone: 'warning' },
};

export const PLAN_STATUS_LABELS: Record<string, { ar: string; tone: string }> = {
  DRAFT: { ar: 'مسودة', tone: 'neutral' },
  SUBMITTED: { ar: 'مُقدّمة', tone: 'info' },
  APPROVED: { ar: 'معتمدة', tone: 'success' },
  MODIFIED: { ar: 'معدّلة', tone: 'warning' },
  REJECTED: { ar: 'مرفوضة', tone: 'danger' },
};

export const SEVERITY_LABELS: Record<string, { ar: string; tone: string }> = {
  blocking: { ar: 'مانع', tone: 'danger' },
  warning: { ar: 'تحذير', tone: 'warning' },
  info: { ar: 'معلوماتي', tone: 'info' },
};

export const ESCALATION_STATUS_LABELS: Record<string, { ar: string; tone: string }> = {
  open: { ar: 'مفتوحة', tone: 'danger' },
  in_review: { ar: 'قيد المراجعة', tone: 'warning' },
  resolved: { ar: 'محلولة', tone: 'success' },
  closed: { ar: 'مغلقة', tone: 'neutral' },
};

export const PRIORITY_LABELS: Record<string, { ar: string; tone: string }> = {
  low: { ar: 'منخفضة', tone: 'neutral' },
  medium: { ar: 'متوسطة', tone: 'info' },
  high: { ar: 'عالية', tone: 'warning' },
  critical: { ar: 'حرجة', tone: 'danger' },
};

export const ESCALATION_TYPE_LABELS: Record<string, string> = {
  RULE_ENGINE: 'محرك القواعد',
  PLAN_REVIEW: 'مراجعة خطة',
  ACADEMIC: 'أكاديمية',
  ANOMALY: 'تعارض بيانات',
  IMPORT: 'استيراد بيانات',
  OTHER: 'أخرى',
};

export const REQUEST_STATUS_LABELS: Record<string, { ar: string; tone: string }> = {
  pending: { ar: 'قيد الانتظار', tone: 'warning' },
  approved: { ar: 'مقبول', tone: 'success' },
  rejected: { ar: 'مرفوض', tone: 'danger' },
  cancelled: { ar: 'ملغي', tone: 'neutral' },
};

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const SEASONS: Record<Season, string> = {
  fall: 'خريف',
  spring: 'ربيع',
  summer: 'صيف',
};

export const COURSE_ROLES: Record<string, string> = {
  compulsory: 'إجباري',
  lab: 'معمل',
  project: 'مشروع',
  field_training: 'تدريب ميداني',
  selected_topic: 'موضوع مختار',
  elective: 'اختياري',
};

export const GRADE_STATUS_LABELS: Record<string, string> = {
  passed: 'ناجح',
  failed: 'راسب',
  in_progress: 'قيد الدراسة',
  withdrawn: 'منسحب',
  incomplete: 'غير مكتمل',
  continued: 'مستمر',
  absent: 'غائب',
};

export const NAV_GROUPS = {
  student: [
    { to: '/student', label: 'لوحة المتابعة', icon: 'LayoutDashboard' },
    { to: '/student/eligibility', label: 'أهلية التسجيل', icon: 'ShieldCheck' },
    { to: '/student/plans', label: 'الخطط الدراسية', icon: 'ListChecks' },
    { to: '/student/standing', label: 'الموقف الأكاديمي', icon: 'Gauge' },
    { to: '/student/early-warning', label: 'الإنذار المبكر', icon: 'TriangleAlert' },
    { to: '/student/graduation', label: 'تدقيق التخرج', icon: 'GraduationCap' },
    { to: '/student/gpa', label: 'محاكاة المعدل', icon: 'Calculator' },
    { to: '/student/what-if', label: 'تغيير التخصص', icon: 'Shuffle' },
    { to: '/student/courses', label: 'سجلي الأكاديمي', icon: 'BookOpen' },
    { to: '/student/advisor', label: 'مرشدي والساعات', icon: 'UserRound' },
    { to: '/student/chat', label: 'مساعد اللائحة', icon: 'MessagesSquare' },
    { to: '/student/notifications', label: 'الإشعارات', icon: 'Bell' },
  ],
  advisor: [
    { to: '/advisor', label: 'لوحة المرشد', icon: 'LayoutDashboard' },
    { to: '/advisor/students', label: 'طلابي', icon: 'Users' },
    { to: '/advisor/at-risk', label: 'الطلاب المعرضون للخطر', icon: 'TriangleAlert' },
    { to: '/advisor/plans', label: 'مراجعة الخطط', icon: 'ClipboardCheck' },
    { to: '/advisor/office-hours', label: 'الساعات المكتبية', icon: 'CalendarClock' },
    { to: '/advisor/escalations', label: 'الحالات المحوّلة', icon: 'Inbox' },
  ],
  admin: [
    { to: '/admin', label: 'نظرة عامة', icon: 'LayoutDashboard' },
    { to: '/admin/users', label: 'المستخدمون', icon: 'Users' },
    { to: '/admin/students', label: 'الطلاب', icon: 'GraduationCap' },
    { to: '/admin/advisors', label: 'المرشدون', icon: 'UserCog' },
    { to: '/admin/departments', label: 'الأقسام', icon: 'Building2' },
    { to: '/admin/courses', label: 'المقررات', icon: 'BookOpen' },
    { to: '/admin/anomalies', label: 'تعارضات البيانات', icon: 'TriangleAlert' },
    { to: '/admin/rules', label: 'قواعد اللائحة', icon: 'Scale' },
    { to: '/admin/escalations', label: 'الحالات المحوّلة', icon: 'Inbox' },
    { to: '/admin/audit', label: 'سجل التدقيق', icon: 'ScrollText' },
    { to: '/admin/analytics', label: 'التحليلات', icon: 'ChartColumn' },
    { to: '/admin/imports', label: 'استيراد البيانات', icon: 'Upload' },
  ],
} as const;

export const HOME_BY_ROLE: Record<Role, string> = {
  student: '/student',
  advisor: '/advisor',
  admin: '/admin',
};
