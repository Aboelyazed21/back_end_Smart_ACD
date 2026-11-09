# Data anomalies in the bylaw extraction

The supplied bylaw PDF is an OCR export. The extraction surfaced 27 places where the text contradicts itself, references a missing code or lists a course in more than one pool. Every anomaly is stored in `data_anomalies`, shown in the admin dashboard and carried into decisions as `anomaly_ids`.

**Do not "fix" these silently.** The engine treats them as first-class data:

| Severity | Count | Engine behaviour |
| --- | ---: | --- |
| `blocking` | 7 | Return `REVIEW_REQUIRED`, create an escalation automatically, never decide. |
| `warning` | 17 | Evaluate with `working_value`, attach the anomaly id and flag the result. |
| `info` | 3 | No effect on decisions; documented in the admin dashboard. |

## Register

| ID | Severity | Type | Summary | Affected courses | Working value |
| --- | --- | --- | --- | --- | --- |
| `A-REG-01` | blocking | rule_conflict | تعارض الحد الأدنى للعبء الدراسي (9 مقابل 12) | — | — |
| `A-REG-02` | blocking | rule_conflict | تعارض الحد الأقصى للمنذرين أكاديمياً (15 مقابل 12) | — | — |
| `A-REG-03` | info | feasibility | لا يمكن التخرج في 6 فصول بدون فصول صيفية | — | — |
| `A-REG-04` | info | typo | خطأ مطبعي CGBA بدل CGPA في شرط مرتبة الشرف | — | CGPA |
| `A-REG-05` | warning | rule_conflict | تكنولوجيا المعلومات UNI1204 إجباري رغم أنه ضمن الاختياري | UNI1204 | UNI1204 mandatory + 2 other university electives |
| `A-REG-06` | warning | rule_overlap | شرط تسجيل مشروع التخرج: 96 ساعة (مادة 13.7) مقابل المتطلب السابق في الجداول | CSC4105, INF4105, AIN4105, DSC4105 | enforce BOTH: course prerequisite AND >=96 passed credit hours |
| `A-REG-07` | blocking | missing_data | مقرر Math 2 والدراسات التمهيدية بدون كود في الكتالوج | — | — |
| `A-REG-08` | info | inconsistency | تقسيم الساعات في مادة 24 لا يطابق الجداول بدقة | — | — |
| `A-REG-09` | warning | ambiguity | شرط 21 ساعة عند إمكانية التخرج | — | 21 allowed when graduation is possible in that semester regardless of CGPA, flagged for advisor approval |
| `A-CAT-01` | warning | wrong_code | كود MTH1210 في خطة المستوى الأول | MTH1201 | MTH1201 |
| `A-CAT-02` | warning | wrong_prereq | متطلب نظم قواعد البيانات CSB2204: CSB1101 أم CSB2107؟ | CSB2204 | CSB1101 |
| `A-CAT-03` | warning | wrong_prereq | متطلب CSB2103: GNR1202 أم GNR1110؟ | CSB2103 | GNR1202 |
| `A-CAT-04` | warning | wrong_prereq | متطلب الحوسبة السحابية INF3201: CSB2101 أم CSC2113؟ | INF3201 | CSB2101 |
| `A-CAT-05` | warning | wrong_prereq | متطلب المعالجة المتوازية CSC4203: CSB2101 أم CSC2101؟ | CSC4203 | CSB2101 |
| `A-CAT-06` | warning | wrong_code | أكواد خاطئة في خطة علوم الحاسب للمستوى الثالث | INF3203, INF3202 | INF3203 / INF3202 |
| `A-CAT-07` | warning | wrong_prereq | متطلب CSC3103 مكتوب CSC2105 في الخطة | CSC3103 | CSB2105 |
| `A-CAT-08` | warning | wrong_prereq | أخطاء متطلبات في جدول 6 (تكنولوجيا المعلومات) | INF4101, INF4102 | INF3102 / CSB2103 |
| `A-CAT-09` | blocking | prereq_conflict | متطلب INF4105: CSB2105 أم CSB2205؟ | INF4105, INF4205 | — |
| `A-CAT-10` | blocking | prereq_conflict | متطلب DSC4105: لا يوجد أم CSB2205؟ | DSC4105, DSC4205 | — |
| `A-CAT-11` | blocking | invalid_code | متطلب DSC3102 هو MTH1108 وهو غير موجود | DSC3102 | — |
| `A-CAT-12` | blocking | code_and_prereq_conflict | مقرر علوم البيانات الاختياري: DSC4204 أم DSC4104 أم DSC4203؟ | DSC4204 | — |
| `A-CAT-13` | warning | wrong_prereq | متطلب DSC4205 مكتوب DSC4120 | DSC4205 | DSC4105 |
| `A-CAT-14` | warning | code_collision | كود التدريب الميداني لعلوم البيانات DSC3206 أم DSC3205؟ | DSC3206, DSC3205 | DSC3206 |
| `A-CAT-15` | warning | wrong_prereq | متطلب DSC3205 مكتوب DSC3103 | DSC3205 | DSC3105 |
| `A-CAT-16` | warning | wrong_reference | الملحق يذكر AIN3106 في وصف AIN3205 | AIN3205 | AIN3105 |
| `A-CAT-17` | warning | pool_conflict | اختياري علوم البيانات: AIN3102 إجباري ومكرر، وخطة DS تذكر مقررات خارج القائمة | AIN3102, INF3101, CSC4203 | Table 10 pool excluding AIN3102 |
| `A-CAT-18` | warning | pool_conflict | خطة IT تعرض INF3201 كاختياري وهو إجباري في نفس الفصل | INF3201 | IT_ELECTIVE pool from Table 6 (no INF3201) |

## Blocking anomalies

### A-REG-01 — تعارض الحد الأدنى للعبء الدراسي (9 مقابل 12)

مادة 8 تحدد الحد الأدنى 9 ساعات، بينما مادة 16.5 تقول إن الطالب المنذر أكاديمياً (CGPA أقل من 2.00) لا يسجل إلا الحد الأدنى للعبء الدراسي ويذكره 12 ساعة.

- **Sources:** Art. 8, p. 8; Art. 16.5, p. 14
- **Affected courses:** not course-specific
- **Affected rules:** R-LOAD-MIN, R-PROB-16.5
- **Suggested resolution (non-binding):** تأكيد من مجلس الكلية: هل 12 حد أدنى للمنذرين فقط؟
- **Status:** open

### A-REG-02 — تعارض الحد الأقصى للمنذرين أكاديمياً (15 مقابل 12)

مادة 8 تسمح بـ 15 ساعة لمن CGPA بين 1.00 و أقل من 2.00 و12 لمن أقل من 1.00، ومادة 16.5 تحصر المنذر في 12 ساعة، ومادة 7.2.ج تتحدث عن خفض العبء بقرار مجلس الكلية.

- **Sources:** Art. 8, p. 8; Art. 16.5, p. 14; Art. 7.2.ج, p. 8
- **Affected courses:** not course-specific
- **Affected rules:** R-LOAD-MAX, R-PROB-16.5
- **Suggested resolution (non-binding):** قرار رسمي من الكلية يوحّد الحد.
- **Status:** open

### A-REG-07 — مقرر Math 2 والدراسات التمهيدية بدون كود في الكتالوج

مادة 5.4-5.6 تتحدث عن امتحان تحديد مستوى، ودراسات إضافية، ومقرر رياضيات 2 لطلاب شعبة علوم، ولا يوجد لها أكواد أو ساعات في جداول المقررات.

- **Sources:** Art. 5.4-5.6, p. 5
- **Affected courses:** not course-specific
- **Affected rules:** R-ADM-REMEDIAL
- **Status:** open

### A-CAT-09 — متطلب INF4105: CSB2105 أم CSB2205؟

جدول 7 والملحق: CSB2105 (هندسة البرمجيات). خطة المستوى الرابع IT: CSB2205 (علوم البيانات). الاثنان كودان صحيحان.

- **Sources:** Table 7, p. 25; appendix, p. 52; plan IT L4S1, p. 33
- **Affected courses:** INF4105, INF4205
- **Affected rules:** not rule-specific
- **Suggested resolution (non-binding):** الأرجح CSB2105 كما في CS وAI، يحتاج اعتماد.
- **Status:** open

### A-CAT-10 — متطلب DSC4105: لا يوجد أم CSB2205؟

جدول 11 وخطة DS: لا متطلب. الملحق: CSB2205.

- **Sources:** Table 11, p. 27; plan DS L4S1, p. 37; appendix, p. 59
- **Affected courses:** DSC4105, DSC4205
- **Affected rules:** not rule-specific
- **Status:** open

### A-CAT-11 — متطلب DSC3102 هو MTH1108 وهو غير موجود

الكود MTH1108 ظهر في الجدول والخطة والملحق ولا يوجد في الكتالوج؛ إحصاء واحتمالات هو MTH1102.

- **Sources:** Table 10, p. 27; plan DS L3S1, p. 36; appendix, p. 57
- **Affected courses:** DSC3102
- **Affected rules:** not rule-specific
- **Suggested resolution (non-binding):** الأرجح MTH1102، يحتاج اعتماد.
- **Status:** open

### A-CAT-12 — مقرر علوم البيانات الاختياري: DSC4204 أم DSC4104 أم DSC4203؟

جدول 11: DSC4204 بمتطلب DSC3102. الملحق: DSC4104 بمتطلب CSB2205. خطة DS: DSC4203. (DSC4203 مستخدم في CS/AI بمعنى مختلف في مكان آخر).

- **Sources:** Table 11, p. 27; appendix, p. 59; plan DS L4S2, p. 37
- **Affected courses:** DSC4204
- **Affected rules:** not rule-specific
- **Status:** open

## Warnings that change an evaluation

Warnings are evaluated with the value below but the decision carries the anomaly id so an advisor can see the caveat. A warning never blocks a plan by itself.

| ID | Summary | Affected courses | Working value |
| --- | --- | --- | --- |
| `A-REG-05` | تكنولوجيا المعلومات UNI1204 إجباري رغم أنه ضمن الاختياري | UNI1204 | UNI1204 mandatory + 2 other university electives |
| `A-REG-06` | شرط تسجيل مشروع التخرج: 96 ساعة (مادة 13.7) مقابل المتطلب السابق في الجداول | CSC4105, INF4105, AIN4105, DSC4105 | enforce BOTH: course prerequisite AND >=96 passed credit hours |
| `A-REG-09` | شرط 21 ساعة عند إمكانية التخرج | — | 21 allowed when graduation is possible in that semester regardless of CGPA, flagged for advisor approval |
| `A-CAT-01` | كود MTH1210 في خطة المستوى الأول | MTH1201 | MTH1201 |
| `A-CAT-02` | متطلب نظم قواعد البيانات CSB2204: CSB1101 أم CSB2107؟ | CSB2204 | CSB1101 |
| `A-CAT-03` | متطلب CSB2103: GNR1202 أم GNR1110؟ | CSB2103 | GNR1202 |
| `A-CAT-04` | متطلب الحوسبة السحابية INF3201: CSB2101 أم CSC2113؟ | INF3201 | CSB2101 |
| `A-CAT-05` | متطلب المعالجة المتوازية CSC4203: CSB2101 أم CSC2101؟ | CSC4203 | CSB2101 |
| `A-CAT-06` | أكواد خاطئة في خطة علوم الحاسب للمستوى الثالث | INF3203, INF3202 | INF3203 / INF3202 |
| `A-CAT-07` | متطلب CSC3103 مكتوب CSC2105 في الخطة | CSC3103 | CSB2105 |
| `A-CAT-08` | أخطاء متطلبات في جدول 6 (تكنولوجيا المعلومات) | INF4101, INF4102 | INF3102 / CSB2103 |
| `A-CAT-13` | متطلب DSC4205 مكتوب DSC4120 | DSC4205 | DSC4105 |
| `A-CAT-14` | كود التدريب الميداني لعلوم البيانات DSC3206 أم DSC3205؟ | DSC3206, DSC3205 | DSC3206 |
| `A-CAT-15` | متطلب DSC3205 مكتوب DSC3103 | DSC3205 | DSC3105 |
| `A-CAT-16` | الملحق يذكر AIN3106 في وصف AIN3205 | AIN3205 | AIN3105 |
| `A-CAT-17` | اختياري علوم البيانات: AIN3102 إجباري ومكرر، وخطة DS تذكر مقررات خارج القائمة | AIN3102, INF3101, CSC4203 | Table 10 pool excluding AIN3102 |
| `A-CAT-18` | خطة IT تعرض INF3201 كاختياري وهو إجباري في نفس الفصل | INF3201 | IT_ELECTIVE pool from Table 6 (no INF3201) |

## Informational anomalies

- **A-REG-03** — لا يمكن التخرج في 6 فصول بدون فصول صيفية. مادة 6.6 و17.3 تشترط 136 ساعة في 6 فصول نظامية على الأقل، لكن أقصى عبء 21 ساعة (126 ساعة في 6 فصول). الخطة الموصى بها 8 فصول (32/36/34/34).
- **A-REG-04** — خطأ مطبعي CGBA بدل CGPA في شرط مرتبة الشرف. مادة 16.4 تذكر CGBA.
- **A-REG-08** — تقسيم الساعات في مادة 24 لا يطابق الجداول بدقة. مثلا الرياضيات التطبيقية 3 ساعات في مادة 24 بينما CSC4104+CSC4205 = 4 ساعات. المجموع الكلي 136 متسق في كل البرامج.

## Resolution workflow

1. An admin opens `PATCH /api/admin/anomalies/{id}/resolve` with `resolvedValue` and an optional `note`.
2. The service validates the value, writes an audit record and stores who resolved it and when.
3. Every open escalation whose affected decisions reference the anomaly is re-evaluated. Escalations that no longer return `REVIEW_REQUIRED` are auto-resolved with a note.
4. Reopening (`POST /api/admin/anomalies/{id}/reopen`) requires a reason, is audit logged and resets the anomaly to `open`.

## Known need for college confirmation

- Probation load: 9 vs 12 credits (`A-REG-01`, `A-REG-02`).
- Field training: credit weight is not stated, so it is stored as 0 credits and as a non-credit requirement.
- `MTH1108` is referenced by `DSC3102` but does not exist in the catalogue (`A-CAT-11`).
- Graduation project credit threshold: 90 vs 96 passed credits (`A-REG-06`).
- Elective pools overlap for several courses (`A-REG-05`, `A-CAT-17`, `A-CAT-18`).

> This file is generated from `regulation-data/anomalies.json`; edit the JSON (and the seed) instead of the markdown.
