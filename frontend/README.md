# Smart Academic Advisor — الواجهة الأمامية (فرنت)

واجهة ويب عربية (RTL) لمشروع **المستشار الأكاديمي الذكي** لبرنامج AIDM بجامعة بدر
بأسيوط. هذه الحزمة **مستقلة تمامًا** عن حزمة الباك: تحتوي تطبيق React فقط،
وتتصل بالـAPI عبر `/api` على نفس الأصل (same origin).

> **إرشادي فقط.** الواجهة لا تسجّل الطلاب ولا تسمح بتجاوز نتيجة المحرك. كل خطة
> تُعرض بحالة `DRAFT`، وكل قرار يظهر مع `rule_code` والمادة والصفحة ومعرّفات
> التعارضات.

## المحتويات

- [المتطلبات](#المتطلبات)
- [التشغيل السريع](#التشغيل-السريع)
- [متغيرات البيئة](#متغيرات-البيئة)
- [الربط مع حزمة الباك](#الربط-مع-حزمة-الباك)
- [البناء للإنتاج](#البناء-للإنتاج)
- [Docker](#docker)
- [النشر خلف HTTPS](#النشر-خلف-https)
- [الحسابات التجريبية](#الحسابات-التجريبية)
- [الاختبارات والجودة](#الاختبارات-والجودة)
- [بنية المشروع](#بنية-المشروع)
- [ملاحظات أمنية](#ملاحظات-أمنية)

## المتطلبات

- Node.js 20 أو أحدث (المشروع يعلن `"node": ">=20"`).
- npm 10 أو أحدث.
- حزمة الباك (`باك`) تعمل على `http://127.0.0.1:4000` أثناء التطوير.

## التشغيل السريع

```bash
cd فرنت
npm ci
cp .env.example .env      # اختياري: VITE_PROXY_TARGET=http://127.0.0.1:4000
npm run dev               # http://127.0.0.1:5173
```

خادم التطوير يمرّر `/api` و`/health` إلى الباك عبر
`VITE_PROXY_TARGET` (الافتراضي `http://127.0.0.1:4000`)، فيبقى المتصفح على أصل
واحد، وهو شرط عمل كوكي التحديث `httpOnly` ورمز CSRF.

قبل فتح الواجهة شغّل الباك كاملًا (قاعدة البيانات + المحرك + API). راجع
`باك/README.md` للخطوات. للتأكد من جاهزية الـAPI:

```bash
curl http://localhost:4000/health/live
curl http://localhost:4000/health/ready
```

ثم افتح `http://127.0.0.1:5173` وسجّل الدخول بحساب من
[الحسابات التجريبية](#الحسابات-التجريبية).

### أوامر npm

| الأمر | الوظيفة |
| --- | --- |
| `npm run dev` | خادم التطوير على المنفذ 5173 مع تمرير الـAPI. |
| `npm run build` | فحص TypeScript ثم بناء الإنتاج في `dist/`. |
| `npm run preview` | معاينة `dist/` على المنفذ 4173 مع نفس التمرير. |
| `npm run typecheck` | `tsc --noEmit` فقط. |
| `npm run lint` | ESLint بدون أي تحذير مسموح. |
| `npm test` | اختبارات Vitest (تشغيل واحد). |
| `npm run test:watch` | Vitest في وضع المراقبة. |

## متغيرات البيئة

| المتغير | الافتراضي | الاستخدام |
| --- | --- | --- |
| `VITE_PROXY_TARGET` | `http://127.0.0.1:4000` | عنوان الباك الذي يمرّر إليه خادم التطوير (`dev`/`preview`) طلبات `/api` و`/health`. |

لا توجد أسرار في الواجهة: لا يُخزَّن توكن الوصول ولا رمز CSRF في
`localStorage` أو `sessionStorage`. توكن الوصول ورمز CSRF يعيشان في الذاكرة فقط،
والجلسة تُستعاد عند إعادة تحميل الصفحة عبر `POST /api/auth/refresh` ثم
`GET /api/auth/me`.

## الربط مع حزمة الباك

الواجهة تتحدث مع الباك بالعقد التالي:

- كل الطلبات تحت `/api`، والاستجابة الناجحة `{ "data": ... }` مع
  `pagination` في القوائم.
- الأخطاء `{ "error": { "code", "message", "details?", "correlationId" } }`.
- المصادقة: `Authorization: Bearer <access token>` في الذاكرة، وكوكي تحديث
  `httpOnly` على المسار `/api/auth`.
- كل طلب يغيّر الحالة يرسل `x-csrf-token` (باستثناء `login` و`refresh` و`csrf`).
- عند `401` تُجرَّب إعادة التحديث مرة واحدة ثم يُعاد الطلب. وعند `403` الناتج
  عن CSRF قديم يُحدَّث الرمز ويُعاد الطلب مرة واحدة.

إن استضفت الواجهة على أصل مختلف عن الـAPI (غير مُستحسن):

1. أضف أصل الواجهة إلى `CORS_ORIGINS` في الباك.
2. اضبط `APP_BASE_URL` على عنوان الواجهة العام.
3. استخدم HTTPS و`COOKIE_SECURE=true`، وإلا لن يُقبل كوكي التحديث.

الطريقة الموصى بها هي بقاء الواجهة والـAPI على نفس الأصل عبر reverse proxy،
وهو ما يفعله `nginx.conf` المرفق.

## البناء للإنتاج

```bash
npm ci
npm run build             # tsc --noEmit && vite build -> dist/
```

مخرجات `dist/` ملفات ثابتة. قدّمها من أي خادم ويب مع:

- تمرير `/api` و`/health` إلى الباك.
- SPA fallback: أي مسار غير موجود يعيد `index.html`.
- عدم تخزين `index.html` (no-cache) وتخزين `/assets/*` طويلًا (immutable).
- رؤوس أمان: `Content-Security-Policy`، `X-Frame-Options: DENY`،
  `X-Content-Type-Options: nosniff`، `Referrer-Policy`.

`nginx.conf` المرفق يطبّق كل ذلك، ويستخدم `API_UPSTREAM` لتحديد عنوان الباك.

> إذا شغّلت nginx خارج Docker فانسخ محتوى `nginx.conf` واستبدل السطر
> `set $api_upstream "${API_UPSTREAM}";` بعنوان الباك مباشرة، مثل
> `set $api_upstream "http://127.0.0.1:4000";` (الاستبدال التلقائي يتم فقط داخل
> صورة nginx الرسمية).

## Docker

الصورة مستقلة، وسياق البناء هو هذا المجلد:

```bash
docker build -t smart-advisor/frontend .
docker run --rm -p 8080:80 -e API_UPSTREAM=http://host.docker.internal:4000 smart-advisor/frontend
```

- `API_UPSTREAM` الافتراضي `http://backend-api:4000` (اسم خدمة الباك داخل شبكة
  Docker Compose نفسها).
- للاتصال بباك يعمل على المضيف من داخل الحاوية على Linux استخدم
  `http://host.docker.internal:4000` مع
  `--add-host=host.docker.internal:host-gateway`.
- يُستبدل `API_UPSTREAM` عبر `envsubst` وقت تشغيل الحاوية، لذا لا حاجة لإعادة
  البناء عند تغيير العنوان.

### مع حزمة الباك عبر Compose

شغّل الباك أولًا من مجلد `باك` (`docker compose up -d --build`). شبكته
الافتراضية اسمها `smart-academic-advisor_default`. أضف ملف
`docker-compose.yml` داخل `فرنت`:

```yaml
services:
  frontend:
    build: .
    environment:
      API_UPSTREAM: http://backend-api:4000
    ports:
      - "8080:80"
    restart: unless-stopped
    networks:
      - advisor

networks:
  advisor:
    external: true
    name: smart-academic-advisor_default
```

ثم `docker compose up -d --build` وافتح `http://localhost:8080`.

## النشر خلف HTTPS

الطريقة الموصى بها: خادم Linux واحد، والواجهة هي نقطة الدخول العامة الوحيدة.

1. ابنِ الواجهة وانشرها عبر nginx على 80/443.
2. مرّر `/api` و`/health` إلى `backend-api:4000` (داخل شبكة Compose).
3. ضع TLS أمام nginx ومرّر `X-Forwarded-*`، واضبط `TRUST_PROXY=true` في الباك.
4. في الباك: `NODE_ENV=production`، `COOKIE_SECURE=true`، `SEED_DEMO=false`،
   أسرار حقيقية، وSMTP حقيقي.
5. تأكد من `/healthz` للواجهة و`/health/live` و`/health/ready` للـAPI.

لا تنشر منفذ المحرك (rule-engine) ولا قاعدة البيانات للإنترنت.

## الحسابات التجريبية

تُنشأ محليًا بكلمة المرور **`ChangeMe!2026`** (وتُمنع في الإنتاج):

| البريد | الدور |
| --- | --- |
| `admin@bua.edu.eg` | إدارة |
| `advisor1@aidm.bua.edu.eg`، `advisor2@aidm.bua.edu.eg` | مستشار أكاديمي |
| `student1@aidm.bua.edu.eg` … `student6@aidm.bua.edu.eg` | طالب |

الطلاب يغطّون حالات مختلفة: متطلب سابق راسب، إنذار أكاديمي، وقريب من التخرج.

## الاختبارات والجودة

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

- Vitest + Testing Library: اختبارات المكوّنات والأدوات (`src/**/*.test.ts(x)`).
- ESLint بلا تحذيرات (`--max-warnings 0`).
- فحص TypeScript صارم أثناء البناء.
- سير عمل CI مستقل في `.github/workflows/ci.yml`.

فحص العقد الحيّ بين الواجهة والـAPI موجود في حزمة الباك:
`node scripts/verify-frontend.mjs` (يشغّل 52 فحصًا للـ endpoints التي تستدعيها
الواجهة، بما فيها أغلفة الاستجابة والصلاحيات).

## بنية المشروع

```
src/
  App.tsx            المسارات ومجموعات الصلاحيات (RequireRole)
  main.tsx           نقطة الدخول + QueryClient
  index.css          Tailwind + الخطوط + RTL
  auth/              سياق المصادقة وتخزين التوكن في الذاكرة
  components/        مكوّنات الواجهة (layout, ui, charts, ...)
  lib/               api client، CSRF، التنسيق، سياسة كلمة المرور
  pages/             auth | student | advisor | admin
  test/              إعداد Vitest
nginx.conf           خدمة SPA + تمرير /api و/health + رؤوس أمان
Dockerfile           بناء Node ثم nginx
vite.config.ts       المنافذ، التمرير، manualChunks، إعداد Vitest
```

## ملاحظات أمنية

- لا تُخزَّن التوكنات في التخزين الدائم؛ إعادة التحميل تستعيد الجلسة عبر كوكي
  التحديث.
- كوكي التحديث `httpOnly` و`SameSite=Strict` ويعمل فقط على نفس الأصل، لذا لا
  تفصل الواجهة عن الـAPI على نطاقات مختلفة.
- CSRF بنمط double-submit: يُقرأ الرمز من الاستجابة ويُرسل في `x-csrf-token`.
- رؤوس الأمان وCSP مضبوطة في `nginx.conf`؛ لا تضف مصادر سكربت خارجية.
- لا تضع أي مفاتيح أو أسرار في متغيرات `VITE_*`؛ كلها تُحزَّم في الحزمة النهائية.
