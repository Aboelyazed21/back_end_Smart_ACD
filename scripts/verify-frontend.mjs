#!/usr/bin/env node
/**
 * Verifies that every read endpoint the React frontend calls returns 200 with
 * the payload envelope the frontend expects.
 *
 * Usage: node scripts/verify-frontend.mjs
 * Env: API_URL (default http://localhost:4000), DEMO_PASSWORD (default ChangeMe!2026)
 */
const BASE = process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'ChangeMe!2026';
const TERM = process.env.VERIFY_TERM ?? '2026-2027-fall';

let failures = 0;
let checked = 0;

function jar() {
  return new Map();
}

function cookieHeader(jarMap) {
  return [...jarMap.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
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

function fail(label, detail) {
  failures += 1;
  console.error(`FAIL  ${label}${detail ? ` :: ${detail}` : ''}`);
}

function ok(label, condition, detail = '') {
  checked += 1;
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    fail(label, detail);
  }
}

async function get(label, path, auth, validate) {
  const response = await call(path, { token: auth.token, jar: auth.cookies });
  const pass = response.status === 200 && (!validate || validate(response.body));
  ok(label, pass, `${response.status} ${JSON.stringify(response.body).slice(0, 220)}`);
  return response.body;
}

function hasData(body) {
  return body !== null && typeof body === 'object' && 'data' in body;
}

function hasPagination(body) {
  return hasData(body) && body.pagination && typeof body.pagination.total === 'number';
}

async function login(email) {
  const cookies = jar();
  const csrfResponse = await call('/api/auth/csrf', { jar: cookies });
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
    csrf: response.body.csrfToken ?? csrfResponse.body?.csrfToken,
    user: response.body.user,
  };
}

async function main() {
  console.log(`Checking frontend contract against ${BASE}`);
  console.log(`Term: ${TERM}\n`);

  const student = await login('student1@aidm.bua.edu.eg');
  const advisor = await login('advisor1@aidm.bua.edu.eg');
  const admin = await login('admin@bua.edu.eg');

  // --- Shared / auth -------------------------------------------------------
  console.log('auth');
  const me = await get('/auth/me', '/api/auth/me', student, (body) => body?.user?.role === 'student');
  ok('me exposes user + student profile', Boolean(me?.student), JSON.stringify(me));
  await get('/auth/sessions', '/api/auth/sessions', student, (body) => Array.isArray(body?.items));

  // --- Student -------------------------------------------------------------
  console.log('\nstudent');
  await get('/student/dashboard', `/api/student/dashboard?term=${TERM}`, student, hasData);
  await get(
    '/student/eligibility',
    `/api/student/eligibility?term=${TERM}&courseCodes=&plannedCredits=`,
    student,
    (body) => Array.isArray(body?.data?.decisions),
  );
  const plans = await get('/student/plans', '/api/student/plans', student, hasData);
  if (Array.isArray(plans?.data) && plans.data[0]) {
    await get('/student/plans/:id', `/api/student/plans/${plans.data[0].id}`, student, hasData);
  }
  await get('/student/standing', `/api/student/standing?term=${TERM}`, student, hasData);
  await get('/student/early-warning', `/api/student/early-warning?term=${TERM}`, student, hasData);
  await get('/student/graduation-audit', `/api/student/graduation-audit?term=${TERM}`, student, hasData);
  await get('/student/courses', '/api/student/courses', student, hasData);
  await get('/student/recommended-plan', `/api/student/recommended-plan?term=${TERM}&level=2`, student, hasData);
  await get('/student/enrollments', '/api/student/enrollments', student, hasData);
  await get('/student/advisor', '/api/student/advisor', student, hasData);
  await get('/student/office-hours/requests', '/api/student/office-hours/requests', student, hasData);
  await get(
    '/student/notifications',
    '/api/student/notifications?page=1&limit=5',
    student,
    hasPagination,
  );
  await get(
    '/student/notifications (unread bell)',
    '/api/student/notifications?unread=true&page=1&limit=1',
    student,
    hasPagination,
  );
  await get('/chat/sessions', '/api/chat/sessions', student, hasData);

  // --- Advisor -------------------------------------------------------------
  console.log('\nadvisor');
  await get('/advisor/dashboard', '/api/advisor/dashboard', advisor, hasData);
  const advisees = await get(
    '/advisor/students',
    '/api/advisor/students?page=1&limit=5',
    advisor,
    hasPagination,
  );
  const advisee = advisees?.data?.[0];
  if (!advisee) {
    fail('advisor has at least one advisee', 'demo seed missing');
  } else {
    await get('/advisor/students/:id', `/api/advisor/students/${advisee.id}`, advisor, hasData);
    await get(
      '/advisor/students/:id/eligibility',
      `/api/advisor/students/${advisee.id}/eligibility?term=${TERM}`,
      advisor,
      hasData,
    );
    await get(
      '/advisor/students/:id/standing',
      `/api/advisor/students/${advisee.id}/standing?term=${TERM}`,
      advisor,
      hasData,
    );
    await get(
      '/advisor/students/:id/early-warning',
      `/api/advisor/students/${advisee.id}/early-warning?term=${TERM}`,
      advisor,
      hasData,
    );
    await get(
      '/advisor/students/:id/graduation-audit',
      `/api/advisor/students/${advisee.id}/graduation-audit?term=${TERM}`,
      advisor,
      hasData,
    );
    await get(
      '/advisor/students/:id/notes',
      `/api/advisor/students/${advisee.id}/notes`,
      advisor,
      hasData,
    );
  }
  await get('/advisor/at-risk', '/api/advisor/at-risk', advisor, hasData);
  await get('/advisor/plans', '/api/advisor/plans', advisor, hasData);
  await get('/advisor/office-hours', '/api/advisor/office-hours', advisor, hasData);
  await get('/advisor/office-hour-requests', '/api/advisor/office-hour-requests', advisor, hasData);
  await get('/advisor/escalations', '/api/advisor/escalations', advisor, hasData);

  // --- Admin ---------------------------------------------------------------
  console.log('\nadmin');
  await get('/admin/users', '/api/admin/users?page=1&limit=5', admin, hasPagination);
  const students = await get(
    '/admin/students',
    '/api/admin/students?page=1&limit=5',
    admin,
    hasPagination,
  );
  const adminStudent = students?.data?.[0];
  if (adminStudent) {
    await get('/admin/students/:id', `/api/admin/students/${adminStudent.id}`, admin, hasData);
  } else {
    fail('admin has at least one student', 'demo seed missing');
  }
  await get('/admin/advisors', '/api/admin/advisors', admin, hasData);
  await get('/admin/departments', '/api/admin/departments', admin, hasData);
  const courses = await get(
    '/admin/courses',
    '/api/admin/courses?page=1&limit=5',
    admin,
    hasPagination,
  );
  const adminCourse = courses?.data?.[0];
  if (adminCourse) {
    await get('/admin/courses/:id', `/api/admin/courses/${adminCourse.id}`, admin, hasData);
  }
  const anomalies = await get(
    '/admin/anomalies',
    '/api/admin/anomalies?page=1&limit=5',
    admin,
    hasPagination,
  );
  if (anomalies?.data?.[0]) {
    await get('/admin/anomalies/:id', `/api/admin/anomalies/${anomalies.data[0].id}`, admin, hasData);
  }
  const rules = await get(
    '/admin/regulation/rules',
    '/api/admin/regulation/rules?page=1&limit=5',
    admin,
    hasPagination,
  );
  if (rules?.data?.[0]) {
    await get(
      '/admin/regulation/rules/:code',
      `/api/admin/regulation/rules/${encodeURIComponent(rules.data[0].rule_code)}`,
      admin,
      hasData,
    );
  }
  await get(
    '/admin/escalations',
    '/api/admin/escalations?page=1&limit=5',
    admin,
    hasPagination,
  );
  await get('/admin/audit-logs', '/api/admin/audit-logs?page=1&limit=5', admin, hasPagination);
  await get(
    '/admin/analytics/overview',
    '/api/admin/analytics/overview',
    admin,
    (body) => hasData(body) && typeof body.data.students === 'object',
  );
  await get('/admin/analytics/bottlenecks', '/api/admin/analytics/bottlenecks?limit=5', admin, hasData);
  await get('/admin/analytics/enrollments', '/api/admin/analytics/enrollments', admin, hasData);
  await get('/admin/analytics/escalations', '/api/admin/analytics/escalations', admin, hasData);
  await get('/admin/analytics/plans', '/api/admin/analytics/plans', admin, hasData);
  const imports = await get(
    '/admin/imports',
    '/api/admin/imports?page=1&limit=5',
    admin,
    hasPagination,
  );
  if (imports?.data?.[0]) {
    await get('/admin/imports/:id', `/api/admin/imports/${imports.data[0].id}`, admin, hasData);
    await get(
      '/admin/imports/:id/errors',
      `/api/admin/imports/${imports.data[0].id}/errors`,
      admin,
      hasData,
    );
  }

  // --- RBAC ----------------------------------------------------------------
  console.log('\nrbac');
  const forbidden = await call('/api/admin/users?limit=1', { token: student.token, jar: student.cookies });
  ok('student cannot read admin users', forbidden.status === 403, String(forbidden.status));
  const advisorForbidden = await call('/api/student/plans', {
    token: advisor.token,
    jar: advisor.cookies,
  });
  ok('advisor cannot read student plans', advisorForbidden.status === 403, String(advisorForbidden.status));

  console.log(`\n${checked - failures}/${checked} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
