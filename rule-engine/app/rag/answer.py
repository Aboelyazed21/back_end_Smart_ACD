from __future__ import annotations

import re
from typing import Any

from ..config import get_settings
from ..data import RegulationData
from .store import PolicyChunk, store

INJECTION_PATTERNS = [
    r"ignore (all )?(previous|prior|above) instructions",
    r"disregard (the )?(system|previous|above)",
    r"reveal (the )?(system|developer) prompt",
    r"you are now",
    r"act as (an? )?(admin|developer|system)",
    r"\bDAN\b",
    r"تجاهل (كل )?(التعليمات|الأوامر) (السابقة|السابقه)",
    r"اكشف (التعليمات|البرومبت|النظام)",
    r"أنت الآن",
    r"تظاهر بأنك",
]
INJECTION_RE = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)

AR_STOPWORDS = {
    "من", "في", "على", "عن", "الى", "إلى", "ما", "هل", "هو", "هي", "و", "او", "أو",
    "التي", "الذي", "مع", "كان", "كانت", "يجب", "يمكن", "كم", "متي", "متى", "كيف",
    "لائحة", "اللائحة", "المادة", "مادة", "بخصوص", "حول", "هذا", "هذه", "ذلك",
}
EN_STOPWORDS = {
    "the", "a", "an", "of", "is", "are", "what", "how", "when", "can", "i", "to",
    "in", "on", "for", "and", "or", "about", "does", "do", "my", "with", "by",
    "bylaw", "bylaws", "regulation", "article",
}


def detect_language(question: str) -> str:
    arabic = len(re.findall(r"[\u0600-\u06FF]", question))
    return "ar" if arabic > 2 else "en"


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[\w\u0600-\u06FF]+", text.lower())
    return {w for w in words if len(w) > 2 and w not in AR_STOPWORDS and w not in EN_STOPWORDS}


def _citation(chunk: PolicyChunk) -> dict[str, Any]:
    return {
        "article": chunk.article_no,
        "clause": chunk.clause_no,
        "page": chunk.page_no,
        "source": chunk.source,
        "title": chunk.title,
    }


def _facts(data: RegulationData) -> list[dict[str, Any]]:
    max_load = data.load.get("max_by_cgpa") or []
    load_text = "، ".join(
        f"CGPA ≥ {row['cgpa_min']}: {row['max']}" for row in reversed(max_load)
    )
    return [
        {
            "keys": ["العبء", "الحد الأقصى", "ساعات", "load", "maximum", "credits"],
            "ar": (
                f"الحد الأقصى للعبء الدراسي حسب المعدل التراكمي: {load_text} ساعة. "
                f"الحد الأدنى {data.load.get('min_regular', 9)} ساعات ويُعفى إذا تبقى أقل من "
                f"{data.load.get('min_waived_if_remaining_credits_lt', 9)} ساعات للتخرج. "
                f"الفصل الصيفي بحد أقصى {data.load.get('summer_max', 9)} ساعات."
            ),
            "en": (
                f"Maximum load by CGPA: {load_text} credits. Minimum is {data.load.get('min_regular', 9)} "
                f"(waived when fewer than {data.load.get('min_waived_if_remaining_credits_lt', 9)} credits remain). "
                f"Summer maximum is {data.load.get('summer_max', 9)} credits."
            ),
            "rule_code": "R-LOAD-MAX",
        },
        {
            "keys": ["مشروع التخرج", "project", "graduation project"],
            "ar": (
                f"يُسجَّل مشروع التخرج في المستوى الرابع بعد اجتياز {data.graduation_project.get('min_passed_credit_hours', 96)} "
                "ساعة معتمدة (70%) مع استيفاء المتطلب السابق، ويُسجَّل في الخريف أو الربيع فقط."
            ),
            "en": (
                f"The graduation project is registered at level 4 after passing "
                f"{data.graduation_project.get('min_passed_credit_hours', 96)} credits (70%) and its prerequisite; "
                "registration is only in fall or spring."
            ),
            "rule_code": "R-PROJECT-13.7",
        },
        {
            "keys": ["التدريب", "الميداني", "training", "field"],
            "ar": (
                f"التدريب الميداني 0 ساعة ولا يدخل في GPA، ويشترط اجتياز {data.field_training.get('min_passed_credit_hours', 68)} "
                f"ساعة، ومدته {data.field_training.get('duration_weeks', 6)} أسابيع، ويُسمح به صيفاً."
            ),
            "en": (
                f"Field training is 0 credits and excluded from GPA; it requires "
                f"{data.field_training.get('min_passed_credit_hours', 68)} passed credits, lasts "
                f"{data.field_training.get('duration_weeks', 6)} weeks, and may be taken in summer."
            ),
            "rule_code": "R-TRAIN-13",
        },
        {
            "keys": ["التخرج", "graduation", "graduate", "136"],
            "ar": (
                f"التخرج يتطلب {data.graduation.get('min_credits', 136)} ساعة، ومعدلاً تراكمياً لا يقل عن "
                f"{data.graduation.get('min_cgpa', 2.0)}، واجتياز المقررات غير المحسوبة (التدريب الميداني)، "
                f"واستيفاء المجموعات الاختيارية والمشروع، و{data.graduation.get('min_regular_semesters', 6)} فصول نظامية على الأقل."
            ),
            "en": (
                f"Graduation requires {data.graduation.get('min_credits', 136)} credits, CGPA >= "
                f"{data.graduation.get('min_cgpa', 2.0)}, all non-credit requirements (field training), "
                f"satisfied elective pools and project, and at least {data.graduation.get('min_regular_semesters', 6)} regular semesters."
            ),
            "rule_code": "R-GRAD-17",
        },
        {
            "keys": ["الشرف", "honors", "honour", "3.00"],
            "ar": (
                f"مرتبة الشرف: CGPA ≥ {data.honors.get('min_cgpa', 3.0)}، وفي حدود "
                f"{data.honors.get('max_regular_semesters', 8)} فصول نظامية، دون رسوب أو حرمان."
            ),
            "en": (
                f"Honors: CGPA >= {data.honors.get('min_cgpa', 3.0)}, within "
                f"{data.honors.get('max_regular_semesters', 8)} regular semesters, with no failure or deprivation."
            ),
            "rule_code": "R-HONORS-16.4",
        },
        {
            "keys": ["الإنذار", "المنذر", "probation", "warning", "2.00"],
            "ar": (
                f"يكون الطالب تحت الملاحظة الأكاديمية إذا كان CGPA أقل من {data.probation.get('cgpa_lt', 2.0)} "
                "بعد أي فصل دراسي عدا الفصل الأول. الفصل بعد 4 إنذارات متتالية أو 6 إنذارات إجمالية أو تجاوز المدة."
            ),
            "en": (
                f"A student is on probation when CGPA is below {data.probation.get('cgpa_lt', 2.0)} after any semester "
                "except the first. Dismissal follows 4 consecutive or 6 total warnings, or exceeding max duration."
            ),
            "rule_code": "R-PROB-16.5",
        },
        {
            "keys": ["الانسحاب", "withdraw", "withdrawal", "W"],
            "ar": (
                f"الانسحاب (W) حتى نهاية الأسبوع {data.dates.get('withdraw_until_week', 10)} بشرط عدم تجاوز حد الغياب "
                "وعدم مخالفة حدود العبء؛ بعد ذلك يُسجَّل F. لا ينطبق على الفصل الصيفي."
            ),
            "en": (
                f"Withdrawal (W) is allowed until the end of week {data.dates.get('withdraw_until_week', 10)} if the "
                "absence limit and load limits are respected; afterwards it is recorded as F. It does not apply to summer."
            ),
            "rule_code": "R-DROP-10",
        },
        {
            "keys": ["الحضور", "attendance", "75"],
            "ar": (
                f"الحد الأدنى للحضور {data.attendance_min_pct}%؛ بعد إنذارين متتاليين يُحرم الطالب من الامتحان النهائي "
                "ويُسجَّل F، والغياب بعذر مقبول يُسجَّل W."
            ),
            "en": (
                f"Minimum attendance is {data.attendance_min_pct}%; after two successive warnings the student is barred "
                "from the final exam and receives F; an excused absence is recorded as W."
            ),
            "rule_code": "R-ATT-11",
        },
        {
            "keys": ["التقييم", "الامتحان", "assessment", "exam", "50", "25"],
            "ar": (
                "توزيع الدرجات: أعمال فصلية 25 + امتحان نصفي 25 + امتحان نهائي 50. الرسوب إذا كانت درجة "
                f"الامتحان النهائي أقل من {data.assessment.get('final_min_pct_of_final_exam', 30)}% أو المجموع أقل من "
                f"{data.assessment.get('pass_total_pct', 50)}%."
            ),
            "en": (
                "Assessment: coursework 25 + midterm 25 + final 50. A student fails with less than "
                f"{data.assessment.get('final_min_pct_of_final_exam', 30)}% on the final exam or less than "
                f"{data.assessment.get('pass_total_pct', 50)}% overall."
            ),
            "rule_code": "R-EXAM-15",
        },
        {
            "keys": ["التحويل", "transfer", "40%"],
            "ar": f"لا يجوز تحويل أكثر من {data.transfer.get('max_transferable_pct', 40)}% من ساعات البرنامج.",
            "en": f"No more than {data.transfer.get('max_transferable_pct', 40)}% of program credits may be transferred.",
            "rule_code": "R-ADM-05.2",
        },
        {
            "keys": ["المدة", "duration", "16", "semesters"],
            "ar": (
                f"المدة القصوى {data.durations.get('max_regular_semesters', 16)} فصلاً نظامياً (8 سنوات) "
                "دون احتساب فصول الإيقاف المعتمدة."
            ),
            "en": (
                f"Maximum duration is {data.durations.get('max_regular_semesters', 16)} regular semesters (8 years), "
                "excluding approved suspensions."
            ),
            "rule_code": "R-GRAD-DURATION",
        },
        {
            "keys": ["الإيقاف", "suspension", "4", "6"],
            "ar": (
                f"يُطلب الإيقاف قبل الامتحانات بشهر على الأقل، وبحد أقصى {data.durations.get('suspension_max_consecutive', 4)} "
                f"فصول متتالية أو {data.durations.get('suspension_max_total', 6)} فصول إجمالاً."
            ),
            "en": (
                f"Suspension must be requested at least one month before finals, capped at "
                f"{data.durations.get('suspension_max_consecutive', 4)} consecutive or "
                f"{data.durations.get('suspension_max_total', 6)} total semesters."
            ),
            "rule_code": "R-SUSP-14",
        },
        {
            "keys": ["الإعادة", "repeat", "83", "improvement", "تحسين"],
            "ar": (
                "إعادة المقرر الراسب أو إعادة مقرر نجح فيه الطالب لتحسين المعدل: تُحتسب الدرجة الفعلية بحد أقصى "
                f"{data.gpa.get('repeat_cap_pct', 83)}% (B، 3.00)، وتُحتسب ساعات المقرر مرة واحدة. "
                "التحسين مسموح بلا حد إذا كان CGPA < 2.00، وبحد 3 مقررات إذا كان CGPA ≥ 2.00."
            ),
            "en": (
                "A failed-course repeat or a CGPA-improvement repeat records the actual grade capped at "
                f"{data.gpa.get('repeat_cap_pct', 83)}% (B, 3.00), with credits counted once. Improvement is unlimited "
                "when CGPA < 2.00 and capped at 3 courses when CGPA >= 2.00."
            ),
            "rule_code": "R-REPEAT-CAP-16.11",
        },
    ]


def _match_fact(data: RegulationData, question: str) -> dict[str, Any] | None:
    q = question.lower()
    best = None
    best_score = 0
    for fact in _facts(data):
        score = sum(1 for key in fact["keys"] if key.lower() in q)
        if score > best_score:
            best = fact
            best_score = score
    return best if best_score >= 1 else None


def _match_anomaly(data: RegulationData, question: str) -> Any | None:
    q = question.lower()
    q_tokens = _tokens(question)
    best = None
    best_overlap = 0
    for anomaly in data.anomalies.values():
        if not anomaly.is_open:
            continue
        if any(code.lower() in q for code in anomaly.affected_courses):
            return anomaly
        blob = f"{anomaly.title_ar} {anomaly.description_ar} {anomaly.title_en} {anomaly.description_en}"
        overlap = len(q_tokens & _tokens(blob))
        if overlap > best_overlap:
            best = anomaly
            best_overlap = overlap
    return best if best_overlap >= 5 else None


def _extract(chunk: PolicyChunk, question: str, language: str) -> str:
    sentences = [s.strip() for s in re.split(r"(?<=[.!؟])\s+|\n+", chunk.text) if len(s.strip()) > 25]
    q_tokens = _tokens(question)
    scored = []
    for idx, sentence in enumerate(sentences):
        overlap = len(q_tokens & _tokens(sentence))
        scored.append((overlap, -idx, sentence))
    scored.sort(reverse=True)
    selected = [row[2] for row in scored[:3] if row[0] > 0] or [row[2] for row in scored[:2]]
    if not selected:
        selected = [chunk.text[:700]]
    body = " ".join(selected)
    if language == "en" and chunk.language == "ar":
        return f"The bylaw text (Arabic) states: {body}"
    return body


def _citations(chunks: list[tuple[PolicyChunk, float]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int]] = set()
    for chunk, _score in chunks:
        key = (chunk.article_no, chunk.clause_no, chunk.page_no)
        if key in seen:
            continue
        seen.add(key)
        out.append(_citation(chunk))
        if len(out) >= 3:
            break
    return out


def answer_question(
    data: RegulationData, question: str, language: str = "auto", open_anomaly_ids: list[str] | None = None
) -> dict[str, Any]:
    """Extractive, citation-first RAG. There is no LLM tool access and no student data."""
    settings = get_settings()
    lang = detect_language(question) if language == "auto" else language
    flags: list[str] = []
    store.load()

    if INJECTION_RE.search(question):
        return {
            "answer": "تم رفض الطلب: نص المستخدم يحتوي على محاولة توجيه غير مسموح بها. تم تحويل الحالة إلى المرشد."
            if lang == "ar"
            else "Request refused: the input contains a prompt-injection attempt. The case has been escalated to an advisor.",
            "answer_language": lang,
            "citations": [],
            "confidence": 0.0,
            "escalate": True,
            "escalate_reason": "PROMPT_INJECTION_DETECTED",
            "anomaly_ids": [],
            "flags": ["PROMPT_INJECTION_DETECTED"],
        }

    allowed_anomalies = set(open_anomaly_ids) if open_anomaly_ids is not None else {
        a.id for a in data.anomalies.values() if a.is_open
    }

    anomaly = _match_anomaly(data, question)
    if anomaly and anomaly.id in allowed_anomalies:
        return {
            "answer": (
                f"هذا الموضوع مرتبط بعيب مفتوح في اللائحة ({anomaly.id}: {anomaly.title_ar}). "
                "لا يمكن الإجابة بشكل قاطع؛ تم تحويل الحالة إلى المرشد الأكاديمي."
                if lang == "ar"
                else f"This topic matches an open bylaw anomaly ({anomaly.id}). A definitive answer is not possible; "
                "the case has been escalated to an academic advisor."
            ),
            "answer_language": lang,
            "citations": [
                {"article": str(s.get("article")), "clause": "", "page": s.get("page"), "source": "BUA-AIDM.pdf"}
                for s in anomaly.sources
            ],
            "confidence": 0.4,
            "escalate": True,
            "escalate_reason": f"OPEN_ANOMALY:{anomaly.id}",
            "anomaly_ids": [anomaly.id],
            "flags": ["OPEN_ANOMALY"],
        }

    fact = _match_fact(data, question)
    if fact:
        rule = data.rule(fact["rule_code"], ("N/A", "N/A"))
        return {
            "answer": fact["ar"] if lang == "ar" else fact["en"],
            "answer_language": lang,
            "citations": [
                {
                    "article": rule.article,
                    "clause": rule.clause,
                    "page": int(re.findall(r"\d+", rule.page)[0]) if re.findall(r"\d+", rule.page) else rule.page,
                    "source": f"BUA-AIDM.pdf#page={rule.page}",
                    "title": rule.title_ar,
                }
            ],
            "confidence": 0.99,
            "escalate": False,
            "escalate_reason": None,
            "anomaly_ids": [],
            "flags": ["RULE_ENGINE_NUMERIC"],
        }

    results = store.search(question, settings.rag_top_k)
    if not results:
        return {
            "answer": "لا توجد مقتطفات لائحية مطابقة؛ تم تحويل السؤال إلى المرشد."
            if lang == "ar"
            else "No matching bylaw text was retrieved; the question has been escalated to an advisor.",
            "answer_language": lang,
            "citations": [],
            "confidence": 0.0,
            "escalate": True,
            "escalate_reason": "NO_RETRIEVAL",
            "anomaly_ids": [],
            "flags": [],
        }

    best, score = results[0]
    confidence = max(0.0, min(1.0, round(float(score), 3)))
    citations = _citations(results)
    if confidence < settings.rag_min_confidence or not citations:
        return {
            "answer": "الثقة في النص المسترجع منخفضة؛ تم تحويل السؤال إلى المرشد الأكاديمي."
            if lang == "ar"
            else "Confidence in the retrieved bylaw text is low; the question has been escalated to an academic advisor.",
            "answer_language": lang,
            "citations": citations,
            "confidence": confidence,
            "escalate": True,
            "escalate_reason": "LOW_CONFIDENCE",
            "anomaly_ids": [],
            "flags": flags,
        }

    return {
        "answer": _extract(best, question, lang),
        "answer_language": lang,
        "citations": citations,
        "confidence": confidence,
        "escalate": False,
        "escalate_reason": None,
        "anomaly_ids": [],
        "flags": flags,
    }
