#!/usr/bin/env node
/**
 * Regulation data integrity check.
 *
 * Runs without a database so CI can fail fast before migrations. It protects
 * the contract between the source bylaw extraction, the rule engine, the
 * seed job and the RAG policy chunks:
 *
 *  - 104 courses, 4 programs, 25 rules, 27 anomalies, 539 policy chunks
 *  - every program totals exactly 136 credit hours
 *  - recommended plans total 32/36/34/34 credits per level
 *  - every referenced course, pool, anomaly and rule exists
 *  - policy chunks match the checksum of the shipped PDF
 *
 * Usage: node scripts/validate-data.mjs [--data-dir regulation-data]
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED = {
  courses: 104,
  programs: 4,
  rules: 25,
  anomalies: 27,
  policyChunks: 539,
  programCredits: 136,
  levelCredits: { 1: 32, 2: 36, 3: 34, 4: 34 },
  minCgpa: 2,
  minRegularSemesters: 6,
};

const SEVERITIES = new Set(['blocking', 'warning', 'info']);
const ACADEMIC_YEAR_RE = /^\d{4}-\d{4}$/;
const COURSE_CODE_RE = /^[A-Z]{3}\d{4}$/;
const TERM_SLOT_RE = /^([1-4])-([12])$/;

const errors = [];
const warnings = [];

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(dir, name) {
  const file = path.join(dir, name);
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${name}: cannot read/parse (${error.message})`);
    return null;
  }
}

function parseArgs(argv) {
  const index = argv.indexOf('--data-dir');
  if (index >= 0 && argv[index + 1]) return path.resolve(argv[index + 1]);
  return path.join(ROOT, 'regulation-data');
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value > 0;
}

/** Pages are either a single page or a "12-13" range used by OCR extraction. */
function isPageRef(value) {
  if (isPositiveInt(value)) return true;
  if (typeof value !== 'string') return false;
  const match = /^(\d+)(?:-(\d+))?$/.exec(value);
  if (!match) return false;
  const start = Number(match[1]);
  const end = match[2] === undefined ? start : Number(match[2]);
  return start >= 1 && end >= start;
}

function main() {
  const dir = parseArgs(process.argv.slice(2));
  const coursesFile = readJson(dir, 'courses.json');
  const programsFile = readJson(dir, 'programs.json');
  const rulesFile = readJson(dir, 'regulation_rules.json');
  const anomaliesFile = readJson(dir, 'anomalies.json');
  const chunksFile = readJson(dir, 'policy_chunks.json');
  if (errors.length > 0) return report();

  const courses = coursesFile.courses ?? [];
  const programs = programsFile.programs ?? {};
  const commonCompulsory = programsFile.common_compulsory ?? [];
  const pools = programsFile.elective_pools ?? {};
  const recommendedPlans = programsFile.recommended_plans ?? {};
  const rules = rulesFile.rules ?? [];
  const anomalies = anomaliesFile.anomalies ?? [];
  const chunks = chunksFile.chunks ?? [];
  const document = chunksFile.document ?? {};

  validateCourses(courses);
  const courseByCode = new Map(courses.map((course) => [course.code, course]));

  validateRules(rules);
  const ruleCodes = new Set(rules.map((rule) => rule.rule_code));
  validateAnomalies(anomalies, courseByCode, ruleCodes);
  const anomalyIds = new Set(anomalies.map((anomaly) => anomaly.id));
  validateCrossReferences(courses, courseByCode, anomalyIds);
  validatePrograms(programs, commonCompulsory, pools, recommendedPlans, courseByCode);
  validateRecommendedPlans(recommendedPlans, courseByCode, pools);
  validateRegulationTotals(rulesFile);
  validatePolicyChunks(chunks, document, dir);

  report();
}

function validateCourses(courses) {
  if (courses.length !== EXPECTED.courses) {
    fail(`courses.json: expected ${EXPECTED.courses} courses, found ${courses.length}`);
  }
  const seen = new Set();
  for (const course of courses) {
    const label = `course ${course.code ?? '<missing code>'}`;
    if (!COURSE_CODE_RE.test(course.code ?? '')) {
      fail(`${label}: code must look like ABC1234`);
    }
    if (seen.has(course.code)) fail(`${label}: duplicate course code`);
    seen.add(course.code);
    if (!course.name_ar && !course.name_en) fail(`${label}: needs a name in at least one language`);
    // Field training is a non-credit graduation requirement (0 credits).
    const minCredits = course.category === 'field_training' ? 0 : 1;
    if (!Number.isInteger(course.credits) || course.credits < minCredits || course.credits > 6) {
      fail(`${label}: credits must be an integer between ${minCredits} and 6`);
    }
    if (!course.category) fail(`${label}: missing category`);
    if (typeof course.counts_in_gpa !== 'boolean') fail(`${label}: counts_in_gpa must be boolean`);
    if (!course.prerequisites || !Array.isArray(course.prerequisites.all_of)) {
      fail(`${label}: prerequisites.all_of must be an array`);
    }
    if (!Array.isArray(course.anomaly_ids)) fail(`${label}: anomaly_ids must be an array`);
  }
}

function validateRules(rules) {
  if (rules.length !== EXPECTED.rules) {
    fail(`regulation_rules.json: expected ${EXPECTED.rules} rules, found ${rules.length}`);
  }
  const seen = new Set();
  for (const rule of rules) {
    const label = `rule ${rule.rule_code ?? '<missing code>'}`;
    if (!rule.rule_code) fail(`${label}: missing rule_code`);
    if (seen.has(rule.rule_code)) fail(`${label}: duplicate rule_code`);
    seen.add(rule.rule_code);
    if (!rule.article) fail(`${label}: missing article`);
    if (!isPageRef(rule.page)) fail(`${label}: page must be a positive page or page range`);
    if (!rule.title_ar && !rule.title_en) fail(`${label}: needs a title`);
  }
}

function validateAnomalies(anomalies, courseByCode, ruleCodes) {
  if (anomalies.length !== EXPECTED.anomalies) {
    fail(`anomalies.json: expected ${EXPECTED.anomalies} anomalies, found ${anomalies.length}`);
  }
  const seen = new Set();
  for (const anomaly of anomalies) {
    const label = `anomaly ${anomaly.id ?? '<missing id>'}`;
    if (!anomaly.id) fail(`${label}: missing id`);
    if (seen.has(anomaly.id)) fail(`${label}: duplicate id`);
    seen.add(anomaly.id);
    if (!SEVERITIES.has(anomaly.severity)) {
      fail(`${label}: severity must be blocking|warning|info`);
    }
    if (!anomaly.type) fail(`${label}: missing type`);
    if (!anomaly.title_ar && !anomaly.title_en) fail(`${label}: needs a title`);
    if (!Array.isArray(anomaly.sources) || anomaly.sources.length === 0) {
      fail(`${label}: needs at least one source with article/page`);
    } else {
      for (const source of anomaly.sources) {
        if (!source.article && !source.where) {
          fail(`${label}: source needs an article or a location`);
        }
        if (!isPageRef(source.page)) {
          fail(`${label}: source page must be a positive page or page range`);
        }
      }
    }
    if (!Array.isArray(anomaly.affected_rules)) fail(`${label}: affected_rules must be an array`);
    for (const code of anomaly.affected_rules ?? []) {
      if (!ruleCodes.has(code)) {
        // Some anomalies point at conceptual rules the OCR export never turned
        // into a first-class rule (e.g. the elective or remedial policy). The
        // engine still consumes these codes, so keep them but make them visible.
        warn(`${label}: affected rule ${code} is a pseudo code outside regulation_rules.json`);
      }
    }
    if (!Array.isArray(anomaly.affected_courses)) fail(`${label}: affected_courses must be an array`);
    for (const code of anomaly.affected_courses ?? []) {
      if (!courseByCode.has(code)) fail(`${label}: unknown affected course ${code}`);
    }
    if (anomaly.severity === 'blocking' && anomaly.working_value !== null) {
      warn(`${label}: blocking anomalies should not use a working value`);
    }
    if (!['open', 'resolved'].includes(anomaly.status ?? 'open')) {
      fail(`${label}: status must be open|resolved`);
    }
  }
  for (const required of ['A-REG-01', 'A-REG-02']) {
    if (!seen.has(required)) fail(`anomalies.json: required blocking anomaly ${required} is missing`);
  }
}

function validateCrossReferences(courses, courseByCode, anomalyIds) {
  for (const course of courses) {
    for (const prerequisite of course.prerequisites?.all_of ?? []) {
      if (!courseByCode.has(prerequisite)) {
        // Documented phantom codes (for example MTH1108) are intentional data
        // anomalies: they must be attached to the course and handled as REVIEW.
        if ((course.anomaly_ids ?? []).length > 0) {
          warn(
            `course ${course.code}: unknown prerequisite ${prerequisite} ` +
              `(documented by ${course.anomaly_ids.join(', ')})`,
          );
        } else {
          fail(`course ${course.code}: unknown prerequisite ${prerequisite}`);
        }
      }
      if (prerequisite === course.code) fail(`course ${course.code}: cannot be its own prerequisite`);
    }
    for (const id of course.anomaly_ids ?? []) {
      if (!anomalyIds.has(id)) fail(`course ${course.code}: unknown anomaly ${id}`);
    }
    const minCredits = course.prerequisites?.min_passed_credit_hours;
    if (minCredits !== null && minCredits !== undefined) {
      if (!Number.isInteger(minCredits) || minCredits < 0 || minCredits > EXPECTED.programCredits) {
        fail(`course ${course.code}: implausible min_passed_credit_hours ${minCredits}`);
      }
    }
  }
}

function validatePrograms(programs, commonCompulsory, pools, recommendedPlans, courseByCode) {
  const names = Object.keys(programs);
  if (names.length !== EXPECTED.programs) {
    fail(`programs.json: expected ${EXPECTED.programs} programs, found ${names.length}`);
  }
  if (names.join(',') !== 'CS,IT,AI,DS') {
    warn(`programs.json: unexpected program list ${names.join(',')}`);
  }
  for (const code of ['UNIV_ELECTIVE', 'HUMANITIES_ELECTIVE', 'BASIC_COMPUTING_ELECTIVE']) {
    if (!pools[code]) fail(`elective_pools: shared pool ${code} is required by every program`);
  }

  for (const name of names) {
    const program = programs[name];
    const label = `program ${name}`;
    if (!program.name_ar || !program.name_en) fail(`${label}: needs Arabic and English names`);
    if (!pools[program.elective_pool]) fail(`${label}: unknown elective pool ${program.elective_pool}`);

    const codes = new Set([
      ...commonCompulsory,
      ...(program.compulsory ?? []),
      ...(program.labs ?? []),
      ...(program.project ?? []),
      ...(program.selected_topic ? [program.selected_topic] : []),
      ...(program.field_training ? [program.field_training] : []),
    ]);
    for (const courseCode of codes) {
      if (!courseByCode.has(courseCode)) fail(`${label}: unknown course ${courseCode}`);
    }
    let required = 0;
    for (const courseCode of codes) required += courseByCode.get(courseCode)?.credits ?? 0;
    for (const poolCode of [
      'UNIV_ELECTIVE',
      'HUMANITIES_ELECTIVE',
      'BASIC_COMPUTING_ELECTIVE',
      program.elective_pool,
    ]) {
      required += pools[poolCode]?.credits_required ?? 0;
    }
    if (required !== EXPECTED.programCredits) {
      fail(`${label}: totals ${required} credit hours, expected ${EXPECTED.programCredits}`);
    }

    if (!recommendedPlans[name]) fail(`${label}: no recommended plan`);
    for (const [slot, items] of Object.entries(recommendedPlans[name] ?? {})) {
      const match = TERM_SLOT_RE.exec(slot);
      if (!match) fail(`${label}: invalid plan slot ${slot}`);
      if (match && Number(match[1]) < 3) {
        fail(`${label}: program plan slot ${slot} must be level 3 or 4`);
      }
      const credits = (items ?? []).reduce((total, item) => {
        if (item.course) return total + (courseByCode.get(item.course)?.credits ?? 0);
        return total + (Number(item.credits) || 0);
      }, 0);
      if (!Number.isInteger(credits) || credits <= 0) {
        fail(`${label}: plan slot ${slot} has no credits`);
      }
    }
  }
}

function validateRecommendedPlans(recommendedPlans, courseByCode, pools) {
  if (!recommendedPlans.COMMON) {
    fail('recommended_plans: COMMON plan is required');
    return;
  }
  if (Object.keys(recommendedPlans).length !== EXPECTED.programs + 1) {
    fail(
      `recommended_plans: expected COMMON plus ${EXPECTED.programs} programs, found ${
        Object.keys(recommendedPlans).length
      } plans`,
    );
  }
  for (const [planName, slots] of Object.entries(recommendedPlans)) {
    const levelTotals = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const [slot, items] of Object.entries(slots)) {
      const match = TERM_SLOT_RE.exec(slot);
      if (!match) {
        fail(`plan ${planName}: invalid slot ${slot}`);
        continue;
      }
      const level = Number(match[1]);
      if (planName === 'COMMON' && level > 2) {
        fail(`plan COMMON: slot ${slot} must be level 1 or 2`);
      }
      if (planName !== 'COMMON' && level < 3) {
        fail(`plan ${planName}: slot ${slot} must be level 3 or 4`);
      }
      for (const item of items ?? []) {
        if (item.course) {
          if (!courseByCode.has(item.course)) {
            fail(`plan ${planName}/${slot}: unknown course ${item.course}`);
          }
          levelTotals[level] += courseByCode.get(item.course)?.credits ?? 0;
        } else if (item.elective_pool) {
          if (!pools[item.elective_pool]) {
            fail(`plan ${planName}/${slot}: unknown pool ${item.elective_pool}`);
          }
          if (!Number.isInteger(item.credits) || item.credits <= 0) {
            fail(`plan ${planName}/${slot}: pool ${item.elective_pool} needs positive credits`);
          }
          levelTotals[level] += Number(item.credits) || 0;
        } else {
          fail(`plan ${planName}/${slot}: item needs either course or elective_pool`);
        }
      }
    }
    if (planName === 'COMMON') {
      if (levelTotals[1] !== EXPECTED.levelCredits[1]) {
        fail(`plan COMMON: level 1 totals ${levelTotals[1]}, expected ${EXPECTED.levelCredits[1]}`);
      }
      if (levelTotals[2] !== EXPECTED.levelCredits[2]) {
        fail(`plan COMMON: level 2 totals ${levelTotals[2]}, expected ${EXPECTED.levelCredits[2]}`);
      }
    } else {
      if (levelTotals[3] !== EXPECTED.levelCredits[3]) {
        fail(`plan ${planName}: level 3 totals ${levelTotals[3]}, expected ${EXPECTED.levelCredits[3]}`);
      }
      if (levelTotals[4] !== EXPECTED.levelCredits[4]) {
        fail(`plan ${planName}: level 4 totals ${levelTotals[4]}, expected ${EXPECTED.levelCredits[4]}`);
      }
    }
  }
}

function validateRegulationTotals(rulesFile) {
  const meta = rulesFile.meta ?? {};
  const graduation = rulesFile.graduation ?? {};
  if (meta.total_credit_hours !== EXPECTED.programCredits) {
    fail(`meta.total_credit_hours must be ${EXPECTED.programCredits}`);
  }
  if (graduation.min_credits !== EXPECTED.programCredits) {
    fail(`graduation.min_credits must be ${EXPECTED.programCredits}`);
  }
  if (Number(graduation.min_cgpa) !== EXPECTED.minCgpa) {
    fail(`graduation.min_cgpa must be ${EXPECTED.minCgpa}`);
  }
  if (Number(graduation.min_regular_semesters) !== EXPECTED.minRegularSemesters) {
    fail(`graduation.min_regular_semesters must be ${EXPECTED.minRegularSemesters}`);
  }
  for (const [level, credits] of Object.entries(EXPECTED.levelCredits)) {
    if (meta.plan_level_credits?.[level] !== credits) {
      fail(`meta.plan_level_credits.${level} must be ${credits}`);
    }
  }
  const dates = rulesFile.dates ?? {};
  for (const [name, term] of Object.entries(dates)) {
    if (term && term.academic_year && !ACADEMIC_YEAR_RE.test(term.academic_year)) {
      fail(`dates.${name}: academic_year must look like 2026-2027`);
    }
  }
}

function validatePolicyChunks(chunks, document, dir) {
  if (chunks.length !== EXPECTED.policyChunks) {
    fail(`policy_chunks.json: expected ${EXPECTED.policyChunks} chunks, found ${chunks.length}`);
  }
  const pdfPath = path.join(dir, document.source_file ?? 'BUA-AIDM.pdf');
  try {
    statSync(pdfPath);
    const actual = createHash('sha256').update(readFileSync(pdfPath)).digest('hex');
    if (actual !== document.checksum) {
      fail(`policy_chunks.json: PDF checksum ${actual} does not match document.checksum`);
      warn('run `python scripts/ingest_policy.py --reindex` after replacing the PDF');
    }
  } catch (error) {
    fail(`policy PDF ${pdfPath}: ${error.message}`);
  }
  if (!isPositiveInt(document.page_count)) fail('policy_chunks.json: document.page_count must be positive');
  if (!document.title) fail('policy_chunks.json: document.title is required');

  const hashes = new Set();
  let maxPage = 0;
  for (const [index, chunk] of chunks.entries()) {
    const label = `policy chunk #${index}`;
    if (!chunk.text || chunk.text.trim().length < 10) fail(`${label}: text is too short`);
    if (!isPositiveInt(chunk.page_no)) {
      fail(`${label}: page_no must be a positive integer`);
    } else {
      maxPage = Math.max(maxPage, chunk.page_no);
    }
    if (chunk.page_no > (document.page_count ?? 0)) fail(`${label}: page exceeds document page count`);
    if (!chunk.article_no) warn(`${label}: no article number (table/front-matter chunk)`);
    if (!chunk.chunk_hash) fail(`${label}: missing chunk_hash`);
    if (hashes.has(chunk.chunk_hash)) fail(`${label}: duplicate chunk_hash`);
    hashes.add(chunk.chunk_hash);
    if (!/^BUA-AIDM\.pdf#page=\d+$/.test(chunk.source ?? '')) {
      fail(`${label}: source must look like BUA-AIDM.pdf#page=N`);
    }
  }
  if (maxPage > 0 && maxPage < (document.page_count ?? 0) - 5) {
    warn(`policy chunks only reach page ${maxPage} of ${document.page_count}`);
  }
}

function report() {
  for (const message of warnings) console.warn(`warn: ${message}`);
  if (errors.length > 0) {
    for (const message of errors) console.error(`error: ${message}`);
    console.error(`\nregulation data validation failed with ${errors.length} error(s)`);
    process.exitCode = 1;
    return;
  }
  console.log(`regulation data is valid (${warnings.length} warning(s))`);
}

main();
