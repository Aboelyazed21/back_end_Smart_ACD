# نشر الباك إند على Vercel (Smart Academic Advisor)

هذا الدليل يشرح ربط مستودع `back_end_Smart_ACD` بمشروع Vercel وتشغيل الـ API،
ثم ربط الفرونت إند المنشور عليه.

> ملاحظة مهمة: Vercel يشغّل Express كـ Serverless Function، فهو لا يحتاج
> `npm start` ولا `PORT`. الملف `backend-api/api/index.ts` هو نقطة الدخول
> و`backend-api/vercel.json` يوجّه كل مسارات `/api/*` و`/health` إليه.

---

## 1) قاعدة بيانات Postgres مستضافة (مطلوبة)

Vercel لا يوفّر قاعدة بيانات، والـ API يحتاج Postgres مع امتداد **pgvector**.
اختر واحدة من:

| الخدمة | ملاحظات |
| --- | --- |
| **Neon** (neon.tech) | مجاني، يدعم pgvector، أسهل خيار |
| **Supabase** | مجاني، pgvector مفعّل |
| **Railway** | سهل، لكنه مدفوع بعد الفترة التجريبية |

بعد إنشاء القاعدة خُذ **Connection String** بالشكل:

```
postgres://USER:PASSWORD@HOST/DBNAME?sslmode=require
```

## 2) تجهيز قاعدة البيانات (من جهازك مرة واحدة)

من داخل مجلد `backend-api`:

```powershell
$env:MIGRATION_DATABASE_URL = "postgres://.../smart_advisor?sslmode=require"
$env:DATABASE_URL           = "postgres://.../smart_advisor?sslmode=require"
$env:DB_APP_PASSWORD        = "ضع-كلمة-مرور-قوية"
npm ci
npm run migrate:up
npm run build
$env:DEMO_PASSWORD = "ChangeMe!2026"
npm run seed
```

> شغّل السكربتات من جهازك (وليس من Vercel) لأنها تحتاج اتصالاً مباشراً بالقاعدة.

## 3) إنشاء المشروع على Vercel

1. افتح <https://vercel.com/new> واختر مستودع **`Aboelyazed21/back_end_Smart_ACD`**.
2. في **Root Directory** اختر: `backend-api`.
3. **Framework Preset**: `Other`.
4. **Build Command**: اتركه افتراضياً (`npm run build`).
5. **Output Directory**: اتركه فارغاً.
6. أضف متغيرات البيئة التالية (Production + Preview):

| المتغير | القيمة |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | رابط قاعدة البيانات (مع `?sslmode=require`) |
| `DB_POOL_MAX` | `5` |
| `JWT_ACCESS_SECRET` | نص عشوائي ≥ 32 حرف |
| `JWT_REFRESH_PEPPER` | نص عشوائي ≥ 32 حرف |
| `JWT_ISSUER` | `bua-aidm-advisor` |
| `JWT_AUDIENCE` | `bua-aidm-api` |
| `ENGINE_URL` | `http://127.0.0.1:8001` (مؤقتاً حتى نشر محرك القواعد) |
| `ENGINE_SERVICE_TOKEN` | نص ≥ 16 حرف |
| `CORS_ORIGINS` | `https://front-end-smart-acadmic-ad-j92r.vercel.app` |
| `COOKIE_SECURE` | `true` |
| `ALLOWED_EMAIL_DOMAIN` | `aidm.bua.edu.eg` |

7. اضغط **Deploy**.

بعد النشر اختبر:

```
https://<BACKEND>.vercel.app/health/live
```

يجب أن يعيد `{"status":"ok", ...}`.

## 4) ربط الفرونت إند بالباك إند

في مستودع الفرونت إند `Front_end-_Smart_Acadmic_ad` عدّل `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<BACKEND>.vercel.app/api/:path*" },
    { "source": "/health", "destination": "https://<BACKEND>.vercel.app/health" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

ثم ارفع التعديل على `main` — Vercel سيعيد نشر الفرونت تلقائياً.

## 5) حدود النسخة الحالية

- **محرك القواعد (Python rule-engine)** غير منشور؛ ميزات الشات/فحص الأهلية
  ستحتاج نشر خدمة `rule-engine` (Railway/Render) وتحديث `ENGINE_URL`.
- **رفع الملفات** على Vercel لا يُحفظ بشكل دائم (filesystem مؤقت)؛ استخدم
  تخزيناً خارجياً (S3 / Supabase Storage) قبل الاعتماد عليه في الإنتاج.
- Vercel Hobby يسمح بـ 10 ثوانٍ كحد أقصى للدالة (تم ضبطها على 30 في
  `vercel.json` وتعمل على الخطط المدفوعة).
