#!/usr/bin/env node
/**
 * End-to-end smoke test against a running API and rule engine.
 *
 * Usage: node scripts/smoke.mjs
 * Env: API_URL (default http://localhost:4000), DEMO_PASSWORD (default ChangeMe!2026)
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'ChangeMe!2026';
let failures = 0;

function jar() {
  return new Map();
}

function cookieHeader(jarMap) {
  return [...jarMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(jarMap, response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jarMap.set(pair.slice(0, index), pair.slice(index + 1));
  }
}

async function call(path, options = {}) {
  const { method = 'GET', body, token, csrf, jar: jarMap, headers = {} } = options;
  const finalHeaders = { accept: 'application/json', ...headers };
  if (body !== undefined) finalHeaders['content-type'] = 'application/json';
  if (token) finalHeaders.authorization = `Bearer ${token}`;
  if (csrf) finalHeaders['x-csrf-token'] = csrf;
  if (jarMap && jarMap.size) finalHeaders.cookie = cookieHeader(jarMap);
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (jarMap) storeCookies(jarMap, response);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, body: json };
}

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
  }
}

async function login(email) {
  const cookies = jar();
  const csrfResponse = await call('/api/auth/csrf', { jar: cookies });
  const csrfToken = csrfResponse.body?.csrfToken;
  const response = await call('/api/auth/login', {
    method: 'POST',
    body: { email, password: PASSWORD },
    jar: cookies,
  });
  if (response.status !== 200) {
    throw new Error(`login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return {
    cookies,
    token: response.body.accessToken,
    csrf: response.body.csrfToken ?? csrfToken,
    user: response.body.user,
  };
}

async function main() {
  console.log(`Smoke testing ${BASE}`);
  const health = await call('/health/ready');
  check('health ready', health.status === 200, JSON.stringify(health.body));

  const student = await login('student1@aidm.bua.edu.eg');
  check('student login', student.user?.role === 'student');

  const profile = await call('/api/student/profile', {
    token: student.token,
    jar: student.cookies,
  });
  check('student profile', profile.status === 200 && profile.body?.data?.student?.program === 'CS');

  const eligibility = await call('/api/student/eligibility', {
    token: student.token,
    jar: student.cookies,
  });
  check(
    'bulk eligibility',
    eligibility.status === 200 && Array.isArray(eligibility.body?.data?.decisions),
    JSON.stringify(eligibility.body)?.slice(0, 200),
  );

  const single = await call('/api/student/eligibility/CSB1201', {
    token: student.token,
    jar: student.cookies,
  });
  check(
    'single eligibility has traceability fields',
    single.status === 200 &&
      ['ELIGIBLE', 'NOT_ELIGIBLE', 'UNKNOWN', 'REVIEW_REQUIRED'].includes(single.body?.data?.decision?.status) &&
      typeof single.body?.data?.decision?.rule_code === 'string',
    JSON.stringify(single.body),
  );

  const badCsrf = await call('/api/student/gpa/simulate', {
    method: 'POST',
    token: student.token,
    jar: student.cookies,
    body: { simulated: [] },
  });
  check('csrf enforced', badCsrf.status === 403, String(badCsrf.status));

  const plan = await call('/api/student/plans', {
    method: 'POST',
    token: student.token,
    csrf: student.csrf,
    jar: student.cookies,
    body: { term: '2026-2027-spring', maxCredits: 15 },
  });
  check(
    'draft plan generated',
    plan.status === 201 && plan.body?.data?.status === 'DRAFT' && plan.body?.data?.advisory_only === true,
    JSON.stringify(plan.body)?.slice(0, 300),
  );
  const planId = plan.body?.data?.id;

  if (planId) {
    const submit = await call(`/api/student/plans/${planId}/submit`, {
      method: 'POST',
      token: student.token,
      csrf: student.csrf,
      jar: student.cookies,
    });
    check('plan submitted for review', submit.status === 200, JSON.stringify(submit.body)?.slice(0, 200));
  }

  const chatSession = await call('/api/chat/sessions', {
    method: 'POST',
    token: student.token,
    csrf: student.csrf,
    jar: student.cookies,
    body: { title: 'Smoke test' },
  });
  const sessionId = chatSession.body?.data?.id;
  check('chat session created', chatSession.status === 201 && Boolean(sessionId));

  if (sessionId) {
    const answer = await call(`/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      token: student.token,
      csrf: student.csrf,
      jar: student.cookies,
      body: { question: 'What is the maximum study load allowed in one semester?' },
    });
    const payload = answer.body?.data;
    check(
      'rag answer cites or escalates',
      answer.status === 200 &&
        (payload?.escalate === true || (Array.isArray(payload?.citations) && payload.citations.length > 0)),
      JSON.stringify(answer.body)?.slice(0, 400),
    );
  }

  const forbidden = await call('/api/advisor/students', {
    token: student.token,
    jar: student.cookies,
  });
  check('student cannot use advisor routes', forbidden.status === 403, String(forbidden.status));

  const advisor = await login('advisor1@aidm.bua.edu.eg');
  check('advisor login', advisor.user?.role === 'advisor');
  const students = await call('/api/advisor/students', {
    token: advisor.token,
    jar: advisor.cookies,
  });
  check('advisor lists advisees', students.status === 200 && Array.isArray(students.body?.data));
  const plans = await call('/api/advisor/plans', { token: advisor.token, jar: advisor.cookies });
  check('advisor lists plans', plans.status === 200 && Array.isArray(plans.body?.data));

  const admin = await login('admin@bua.edu.eg');
  check('admin login', admin.user?.role === 'admin');
  const anomalies = await call('/api/admin/anomalies', { token: admin.token, jar: admin.cookies });
  check('admin lists anomalies', anomalies.status === 200 && (anomalies.body?.data?.length ?? 0) > 0);
  const rules = await call('/api/admin/regulation/rules', { token: admin.token, jar: admin.cookies });
  check('admin lists rules', rules.status === 200);
  const overview = await call('/api/admin/analytics/overview', {
    token: admin.token,
    jar: admin.cookies,
  });
  check('admin analytics overview', overview.status === 200, JSON.stringify(overview.body)?.slice(0, 200));

  console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
