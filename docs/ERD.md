# ERD — Smart Academic Advisor

مخطط قاعدة البيانات الكامل (PostgreSQL 16 + pgvector). المصدر الوحيد للحقيقة هو
migration: [`db/migrations/1700000000000_init.js`](../db/migrations/1700000000000_init.js).
كل الجداول تستخدم `uuid` كمفتاح أساسي (ما عدا جداول مرجعية بكود نصي)، مع
`created_at`/`updated_at` وقيود `CHECK` و`FOREIGN KEY` وفهارس.

> كيف تشاهد المخطط: GitHub يعرض Mermaid تلقائيًا، أو افتح الملف في VS Code
> (إضافة Markdown Preview Mermaid)، أو الصق محتوى [`erd.mmd`](./erd.mmd) في
> <https://mermaid.live>.

---

## 1) الهوية والهيكل الأكاديمي

```mermaid
erDiagram
    DEPARTMENTS ||--o{ ADVISORS : "يضم"
    DEPARTMENTS ||--o{ STUDENTS : "يضم"
    USERS ||--o| ADVISORS : "ملف مرشد"
    USERS ||--o| STUDENTS : "ملف طالب"
    ADVISORS ||--o{ STUDENTS : "يشرف على"

    DEPARTMENTS {
        uuid id PK
        text code UK "2-8 أحرف كبيرة"
        text name_ar
        text name_en
    }
    USERS {
        uuid id PK
        citext email UK
        text password_hash "argon2id"
        text role "student|advisor|admin"
        text status "active|inactive|suspended"
        text full_name
        boolean must_change_password
        boolean is_demo
        int failed_login_attempts
        timestamptz locked_until
        timestamptz deleted_at "soft delete"
    }
    ADVISORS {
        uuid id PK
        uuid user_id FK,UK
        uuid department_id FK
        text office_location
        int max_students "1..500"
    }
    STUDENTS {
        uuid id PK
        uuid user_id FK,UK
        text student_code UK "6-15 رقم"
        uuid department_id FK
        uuid advisor_id FK
        text program "CS|IT|AI|DS"
        int level "1..4"
        numeric current_cgpa "0..4"
        int passed_credits "0..300"
        int transfer_credits "0..54"
    }
```

## 2) كتالوج المقررات ومتطلبات البرامج

```mermaid
erDiagram
    COURSES ||--o{ COURSE_PREREQUISITES : "المقرر"
    COURSES ||--o{ COURSE_PREREQUISITES : "المتطلب المطلوب"
    ELECTIVE_POOLS ||--o{ ELECTIVE_POOL_COURSES : "يحتوي"
    COURSES ||--o{ ELECTIVE_POOL_COURSES : "عضو"
    COURSES ||--o{ PROGRAM_REQUIREMENTS : "مطلوب في"
    ELECTIVE_POOLS ||--o{ PROGRAM_REQUIREMENTS : "يغطي"
    COURSES ||--o{ RECOMMENDED_PLANS : "مقترح"
    ELECTIVE_POOLS ||--o{ RECOMMENDED_PLANS : "خيار"

    COURSES {
        uuid id PK
        text code UK "AAA0000"
        text name_ar
        text name_en
        int credits "0..12"
        text category
        boolean counts_in_gpa
        int level_hint "1..4"
        int term_hint "1|2"
        jsonb anomaly_ids
        boolean active
        timestamptz deleted_at
    }
    COURSE_PREREQUISITES {
        uuid id PK
        uuid course_id FK
        text type "prerequisite|corequisite|hours_required"
        uuid required_course_id FK "nullable"
        int min_passed_credit_hours "nullable"
    }
    ELECTIVE_POOLS {
        uuid id PK
        text code UK
        int credits_required "0..30"
        text source
    }
    ELECTIVE_POOL_COURSES {
        uuid id PK
        uuid pool_id FK
        uuid course_id FK
        boolean is_mandatory
    }
    PROGRAM_REQUIREMENTS {
        uuid id PK
        text program "CS|IT|AI|DS"
        uuid course_id FK
        text role "compulsory|lab|project|field_training|selected_topic|elective"
        uuid pool_id FK
    }
    RECOMMENDED_PLANS {
        uuid id PK
        text program
        int level "1..4"
        int term "1|2"
        int position
        uuid course_id FK
        uuid pool_id FK
        int credits
    }
```

## 3) العروض الفصلية والتسجيل والدرجات

```mermaid
erDiagram
    COURSES ||--o{ COURSE_OFFERINGS : "يُطرح في"
    COURSE_OFFERINGS ||--o{ MEETING_TIMES : "مواعيد"
    COURSE_OFFERINGS ||--o{ EXAMS : "امتحانات"
    STUDENTS ||--o{ ENROLLMENTS : "يسجّل"
    COURSES ||--o{ ENROLLMENTS : "مقرر"
    COURSE_OFFERINGS ||--o{ ENROLLMENTS : "شعبة"

    COURSE_OFFERINGS {
        uuid id PK
        uuid course_id FK
        text academic_year "YYYY-YYYY"
        text season "fall|spring|summer"
        int capacity "0..1000"
        int enrolled_count
        text status "open|closed|cancelled"
    }
    MEETING_TIMES {
        uuid id PK
        uuid offering_id FK
        text day "sat..fri"
        time start_time
        time end_time
        text room
    }
    EXAMS {
        uuid id PK
        uuid offering_id FK
        text exam_type "midterm|final|oral|practical"
        date exam_date
        time start_time
        time end_time
        text room
    }
    ENROLLMENTS {
        uuid id PK
        uuid student_id FK
        uuid course_id FK
        uuid offering_id FK
        text term
        text academic_year
        text season
        text grade_letter
        numeric percentage "0..100"
        numeric grade_points "0..4"
        text status "passed|failed|in_progress|withdrawn|incomplete|continued|absent"
        int attempt_no "1..20"
        boolean counts_in_gpa
        boolean is_repeat
    }
    GRADE_SCALE {
        text letter PK
        numeric min_pct
        numeric max_pct_exclusive
        numeric points
        boolean counts_in_gpa
        boolean passed
    }
```

`grade_scale` جدول مرجعي مستقل (A/B+/…/F) يستخدمه الاستيراد وحساب GPA ولا يرتبط بمفتاح خارجي.

## 4) الخطط والموقف الأكاديمي والمراجعة

```mermaid
erDiagram
    STUDENTS ||--o{ STUDY_PLANS : "خطط"
    USERS ||--o{ STUDY_PLANS : "أنشأ/راجع"
    STUDY_PLANS ||--o{ STUDY_PLAN_ITEMS : "بنود"
    COURSES ||--o{ STUDY_PLAN_ITEMS : "مقرر"
    STUDENTS ||--o{ ELIGIBILITY_CHECKS : "فحوص أهلية"
    COURSES ||--o{ ELIGIBILITY_CHECKS : "مقرر"
    STUDENTS ||--o{ ACADEMIC_STANDING : "موقف فصلي"
    STUDENTS ||--o{ ESCALATIONS : "حالات"
    USERS ||--o{ ESCALATIONS : "أنشأ/أسند/حل"
    STUDY_PLANS ||--o{ ESCALATIONS : "مرتبطة"
    ESCALATIONS ||--o{ ESCALATION_EVENTS : "سجل أحداث"
    USERS ||--o{ ESCALATION_EVENTS : "منفّذ"
    ADVISORS ||--o{ ADVISING_NOTES : "ملاحظات"
    STUDENTS ||--o{ ADVISING_NOTES : "عن"
    ADVISORS ||--o{ OFFICE_HOUR_SLOTS : "ساعات مكتبية"
    OFFICE_HOUR_SLOTS ||--o{ OFFICE_HOUR_REQUESTS : "طلبات"
    STUDENTS ||--o{ OFFICE_HOUR_REQUESTS : "يطلب"
    USERS ||--o{ NOTIFICATIONS : "يستقبل"

    STUDY_PLANS {
        uuid id PK
        uuid student_id FK
        text term
        text academic_year
        text season
        text status "DRAFT|SUBMITTED|APPROVED|MODIFIED|REJECTED"
        int total_credits "0..21"
        uuid generated_by FK
        text engine_version
        text planning_slot
        jsonb load_flags
        jsonb engine_payload
        text notes
        text feedback
        uuid reviewed_by FK
        timestamptz reviewed_at
    }
    STUDY_PLAN_ITEMS {
        uuid id PK
        uuid plan_id FK
        uuid course_id FK
        int position
        int credits
        text eligibility_status "ELIGIBLE|NOT_ELIGIBLE|UNKNOWN|REVIEW_REQUIRED"
        text rule_code
        text reason_ar
        text reason_en
        text article
        text page
        jsonb anomaly_ids
        jsonb meeting_times
    }
    ELIGIBILITY_CHECKS {
        uuid id PK
        uuid student_id FK
        uuid course_id FK
        text course_code
        text term
        text status
        text rule_code
        text article
        text page
        text reason_ar
        text reason_en
        jsonb anomaly_ids
        jsonb context
    }
    ACADEMIC_STANDING {
        uuid id PK
        uuid student_id FK
        text term
        text academic_year
        numeric sgpa
        numeric cgpa
        int passed_credits
        int level
        int warning_no
        int consecutive_warnings
        int total_warnings
        boolean probation
        boolean dismissal_risk
        boolean final_chance
    }
    ESCALATIONS {
        uuid id PK
        text ticket_no UK
        uuid student_id FK
        uuid created_by FK
        uuid assigned_to FK
        text type "RULE_ENGINE|PLAN_REVIEW|ACADEMIC|ANOMALY|IMPORT|OTHER"
        text status "open|in_review|resolved|closed"
        text priority "low|medium|high|critical"
        text subject
        text description
        uuid related_plan_id FK
        text related_course_code
        jsonb anomaly_ids
        text resolution
        uuid resolved_by FK
        timestamptz resolved_at
    }
    ESCALATION_EVENTS {
        uuid id PK
        uuid escalation_id FK
        uuid actor_id FK
        text event_type
        text notes
    }
    ADVISING_NOTES {
        uuid id PK
        uuid advisor_id FK
        uuid student_id FK
        text note
        text visibility "advisor_only|student"
    }
    OFFICE_HOUR_SLOTS {
        uuid id PK
        uuid advisor_id FK
        int weekday "0..6"
        time start_time
        time end_time
        text location
        boolean active
    }
    OFFICE_HOUR_REQUESTS {
        uuid id PK
        uuid slot_id FK
        uuid student_id FK
        text status "pending|approved|rejected|cancelled"
        text reason
    }
    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        text type
        text title
        text body
        text channel "in_app|email"
        timestamptz read_at
    }
```

## 5) الحوكمة واللائحة وRAG والأمان

```mermaid
erDiagram
    USERS ||--o{ DATA_ANOMALIES : "يحل"
    POLICY_DOCUMENTS ||--o{ POLICY_CHUNKS : "مقاطع"
    STUDENTS ||--o{ CHAT_SESSIONS : "محادثات"
    CHAT_SESSIONS ||--o{ CHAT_MESSAGES : "رسائل"
    USERS ||--o{ IMPORT_JOBS : "ينفّذ"
    IMPORT_JOBS ||--o{ IMPORT_ROW_ERRORS : "أخطاء صفوف"
    USERS ||--o{ REFRESH_TOKENS : "جلسات"
    USERS ||--o{ PASSWORD_RESETS : "استعادة"
    USERS ||--o{ AUDIT_LOGS : "منفّذ"

    REGULATION_RULES {
        text rule_code PK
        text article_no
        text clause_no
        text page_no
        text title_ar
        text title_en
        text summary_ar
        text summary_en
        text status "active|superseded"
    }
    DATA_ANOMALIES {
        text id PK "A-XXX-00"
        text severity "blocking|warning|info"
        text type
        text title_ar
        text title_en
        text description_ar
        text description_en
        jsonb sources
        jsonb affected_courses
        jsonb affected_rules
        text working_value
        text resolved_value
        text engine_behavior
        text suggested_resolution
        text status "open|resolved"
        uuid resolved_by FK
        timestamptz resolved_at
    }
    POLICY_DOCUMENTS {
        uuid id PK
        text title
        text source_file
        text checksum UK
        int page_count
        text language
    }
    POLICY_CHUNKS {
        uuid id PK
        uuid document_id FK
        text article_no
        text clause_no
        int page_no
        text language
        text title
        text text
        text text_normalized
        text source_ref
        text chunk_hash UK
        vector embedding "vector(384)"
    }
    CHAT_SESSIONS {
        uuid id PK
        uuid student_id FK
        text title
    }
    CHAT_MESSAGES {
        uuid id PK
        uuid session_id FK
        text role "user|assistant|system"
        text content
        jsonb citations
        numeric confidence "0..1"
        boolean escalated
        text rule_code
    }
    IMPORT_JOBS {
        uuid id PK
        text type "students|transcripts"
        text status "pending|processing|completed|failed"
        text filename
        text stored_path
        int total_rows
        int success_rows
        int error_rows
        uuid created_by FK
        text error_message
        timestamptz started_at
        timestamptz finished_at
    }
    IMPORT_ROW_ERRORS {
        uuid id PK
        uuid job_id FK
        int row_no
        text code
        text message
        jsonb raw
    }
    REFRESH_TOKENS {
        uuid id PK
        uuid user_id FK
        text token_hash UK
        uuid family_id
        timestamptz expires_at
        timestamptz revoked_at
        uuid replaced_by
        text user_agent
        text ip
    }
    PASSWORD_RESETS {
        uuid id PK
        uuid user_id FK
        text token_hash UK
        timestamptz expires_at
        timestamptz used_at
    }
    AUDIT_LOGS {
        uuid id PK
        uuid actor_id FK
        text action
        text entity_type
        text entity_id
        jsonb before
        jsonb after
        text ip
        text user_agent
        text correlation_id
        timestamptz created_at "append-only"
    }
```

> **علاقات منطقية غير مفروضة بـ FK:** `courses.anomaly_ids`،
> `data_anomalies.affected_rules`، `data_anomalies.affected_courses`،
> `study_plan_items.anomaly_ids`، و`escalations.anomaly_ids` كلها `jsonb`
> تحمل أكوادًا مرجعية للتدقيق. لا تُستخدم كـ Foreign Keys لأنها قد تشير إلى
> بيانات لائحة غير موجودة في جداول الأعمال (مثل قواعد pseudo أو مقررات محذوفة).

---

## فهرس الجداول (36 جدولًا)

### الهوية والصلاحيات
| الجدول | الغرض | المفتاح | علاقات أساسية |
|---|---|---|---|
| `departments` | الأقسام الأكاديمية | `id` | ← advisors, students |
| `users` | كل الحسابات (طالب/مرشد/أدمن) | `id` | 1:1 advisors/students، 1:N sessions/audit |
| `advisors` | الملف الإشرافي للمرشد | `id` | `user_id` UK، `department_id` |
| `students` | الملف الأكاديمي للطالب | `id` | `user_id` UK، `advisor_id`، `department_id` |

### الكتالوج والمتطلبات
| الجدول | الغرض | المفتاح | علاقات أساسية |
|---|---|---|---|
| `courses` | كتالوج المقررات | `id` | ← prerequisites, enrollments, plans |
| `elective_pools` | مجموعات الاختياري | `id` | ← pool_courses, requirements |
| `elective_pool_courses` | أعضاء كل مجموعة | `id` | `pool_id`+`course_id` UNIQUE |
| `course_prerequisites` | متطلب سابق/متزامن/ساعات | `id` | `course_id`، `required_course_id` |
| `program_requirements` | خطة كل برنامج | `id` | `program`+`course_id`+`role` UNIQUE |
| `recommended_plans` | الخطة الاسترشادية | `id` | `program`+`level`+`term`+`position` UNIQUE |

### العروض والتسجيل
| الجدول | الغرض | المفتاح | علاقات أساسية |
|---|---|---|---|
| `course_offerings` | عرض المقرر في فصل | `id` | `course_id`+سنة+فصل UNIQUE |
| `meeting_times` | مواعيد المحاضرات | `id` | `offering_id` |
| `exams` | امتحانات العرض | `id` | `offering_id` |
| `enrollments` | سجل الطالب الدراسي | `id` | `student_id`+`course_id`+`term`+`attempt` UNIQUE |
| `grade_scale` | تدرج التقديرات | `letter` | مرجعي |

### الخطط والإرشاد
| الجدول | الغرض | المفتاح | علاقات أساسية |
|---|---|---|---|
| `study_plans` | خطط دراسية (DRAFT افتراضيًا) | `id` | `student_id`، `generated_by`، `reviewed_by` |
| `study_plan_items` | مقررات الخطة مع القرار والمرجع | `id` | `plan_id`+`course_id` UNIQUE |
| `eligibility_checks` | أثر فحوص الأهلية | `id` | `student_id`، `course_id` |
| `academic_standing` | الموقف الفصلي والإنذارات | `id` | `student_id`+`term` UNIQUE |
| `escalations` | الحالات المحوّلة | `id` | `student_id`، `assigned_to`، `related_plan_id` |
| `escalation_events` | سجل أحداث الحالة | `id` | `escalation_id` |
| `advising_notes` | ملاحظات المرشد | `id` | `advisor_id`، `student_id` |
| `office_hour_slots` | الساعات المكتبية | `id` | `advisor_id` |
| `office_hour_requests` | طلبات الطلاب | `id` | `slot_id`، `student_id` |
| `notifications` | إشعارات داخلية/بريد | `id` | `user_id` |

### الحوكمة واللائحة والأمان
| الجدول | الغرض | المفتاح | علاقات أساسية |
|---|---|---|---|
| `regulation_rules` | قواعد اللائحة (rule_code) | `rule_code` | مرجعي للقرارات |
| `data_anomalies` | تعارضات البيانات | `id` | `resolved_by` → users |
| `policy_documents` | مستندات اللائحة | `id` | ← policy_chunks |
| `policy_chunks` | مقاطع + embedding 384 | `id` | `document_id`؛ HNSW cosine |
| `chat_sessions` | جلسات مساعد اللائحة | `id` | `student_id` |
| `chat_messages` | رسائل + citations/confidence | `id` | `session_id` |
| `import_jobs` | عمليات CSV | `id` | `created_by` |
| `import_row_errors` | أخطاء الصفوف | `id` | `job_id` |
| `refresh_tokens` | Refresh tokens مُشفّرة + عائلات | `id` | `user_id`، `family_id` |
| `password_resets` | رموز استعادة كلمة المرور | `id` | `user_id` |
| `audit_logs` | سجل تدقيق append-only | `id` | `actor_id` |

---

## قيود وفهارس ومحرّكات مهمة

- **Append-only audit:** تريجر `audit_logs_append_only` يمنع `UPDATE`/`DELETE`،
  وصلاحيات دور التطبيق `smart_advisor_app` لا تمنحهما أصلًا.
- **`updated_at`:** تريجر `set_updated_at()` على 16 جدولًا يعمل تلقائيًا.
- **pgvector:** `policy_chunks.embedding vector(384)` + فهرس
  `hnsw (embedding vector_cosine_ops)` لبحث RAG.
- **بحث نصي:** فهرس GIN على `courses` عبر `to_tsvector('simple', code || name_ar || name_en)`.
- **الفهارس الجزئية:** `users_role_idx` و`users_status_idx` و`courses_active_idx`
  كلها `WHERE deleted_at IS NULL` (soft delete).
- **قيود منطقية:** `course_prerequisites` تفرض وجود `required_course_id` أو
  `min_passed_credit_hours` حسب النوع، و`recommended_plans` تفرض وجود مقرر أو مجموعة.
- **قيود النطاق:** CGPA/GPA `0..4`، الساعات `0..300`، السعة `0..1000`،
  `attempt_no 1..20`، `confidence 0..1`.
- **Unique constraints** تمنع التكرار في: التسجيل، بنود الخطة، العروض الفصلية،
  أعضاء المجموعات، متطلبات البرامج، والخطة الاسترشادية.

## توليد المخطط من الصفر

```bash
cd backend-api
npm run migrate:up   # يستخدم MIGRATION_DATABASE_URL (owner role)
npm run seed         # idempotent: بيانات اللائحة + الحسابات التجريبية
```

لتصدير المخطط الفعلي من قاعدة بيانات قائمة:

```bash
pg_dump --schema-only --no-owner --no-privileges smart_advisor > schema.sql
```
