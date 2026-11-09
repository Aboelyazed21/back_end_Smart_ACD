#!/usr/bin/env node
/**
 * Regenerates docs/data-anomalies.md from regulation-data/anomalies.json.
 * Keeping this generated avoids drift between the engine seed and the docs.
 *
 * Usage: node scripts/gen-anomaly-doc.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(
  readFileSync(path.join(ROOT, 'regulation-data', 'anomalies.json'), 'utf8'),
);
const anomalies = source.anomalies;

const counts = anomalies.reduce(
  (acc, anomaly) => {
    acc[anomaly.severity] = (acc[anomaly.severity] ?? 0) + 1;
    return acc;
  },
  { blocking: 0, warning: 0, info: 0 },
);

const lines = [];
lines.push('# Data anomalies in the bylaw extraction');
lines.push('');
lines.push(
  'The supplied bylaw PDF is an OCR export. The extraction surfaced 27 places where the text contradicts itself, references a missing code or lists a course in more than one pool. Every anomaly is stored in `data_anomalies`, shown in the admin dashboard and carried into decisions as `anomaly_ids`.',
);
lines.push('');
lines.push('**Do not "fix" these silently.** The engine treats them as first-class data:');
lines.push('');
lines.push('| Severity | Count | Engine behaviour |');
lines.push('| --- | ---: | --- |');
lines.push(
  `| \`blocking\` | ${counts.blocking} | Return \`REVIEW_REQUIRED\`, create an escalation automatically, never decide. |`,
);
lines.push(
  `| \`warning\` | ${counts.warning} | Evaluate with \`working_value\`, attach the anomaly id and flag the result. |`,
);
lines.push(`| \`info\` | ${counts.info} | No effect on decisions; documented in the admin dashboard. |`);
lines.push('');
lines.push('## Register');
lines.push('');
lines.push('| ID | Severity | Type | Summary | Affected courses | Working value |');
lines.push('| --- | --- | --- | --- | --- | --- |');
for (const anomaly of anomalies) {
  const courses = anomaly.affected_courses?.length ? anomaly.affected_courses.join(', ') : '—';
  const working = anomaly.working_value ? String(anomaly.working_value) : '—';
  lines.push(
    `| \`${anomaly.id}\` | ${anomaly.severity} | ${anomaly.type} | ${anomaly.title_ar} | ${courses} | ${working} |`,
  );
}
lines.push('');
lines.push('## Blocking anomalies');
lines.push('');
for (const anomaly of anomalies.filter((item) => item.severity === 'blocking')) {
  lines.push(`### ${anomaly.id} — ${anomaly.title_ar}`);
  lines.push('');
  lines.push(anomaly.description_ar);
  lines.push('');
  const sources = (anomaly.sources ?? [])
    .map((source) => {
      const where = source.article ? `Art. ${source.article}` : source.where;
      return `${where}, p. ${source.page}`;
    })
    .join('; ');
  lines.push(`- **Sources:** ${sources || 'not recorded'}`);
  lines.push(
    `- **Affected courses:** ${anomaly.affected_courses?.length ? anomaly.affected_courses.join(', ') : 'not course-specific'}`,
  );
  lines.push(
    `- **Affected rules:** ${anomaly.affected_rules?.length ? anomaly.affected_rules.join(', ') : 'not rule-specific'}`,
  );
  if (anomaly.suggested_resolution_non_binding) {
    lines.push(`- **Suggested resolution (non-binding):** ${anomaly.suggested_resolution_non_binding}`);
  }
  lines.push(`- **Status:** ${anomaly.status ?? 'open'}`);
  lines.push('');
}

lines.push('## Warnings that change an evaluation');
lines.push('');
lines.push(
  'Warnings are evaluated with the value below but the decision carries the anomaly id so an advisor can see the caveat. A warning never blocks a plan by itself.',
);
lines.push('');
lines.push('| ID | Summary | Affected courses | Working value |');
lines.push('| --- | --- | --- | --- |');
for (const anomaly of anomalies.filter((item) => item.severity === 'warning')) {
  const courses = anomaly.affected_courses?.length ? anomaly.affected_courses.join(', ') : '—';
  lines.push(
    `| \`${anomaly.id}\` | ${anomaly.title_ar} | ${courses} | ${anomaly.working_value ?? '—'} |`,
  );
}
lines.push('');
lines.push('## Informational anomalies');
lines.push('');
for (const anomaly of anomalies.filter((item) => item.severity === 'info')) {
  lines.push(`- **${anomaly.id}** — ${anomaly.title_ar}. ${anomaly.description_ar}`);
}
lines.push('');
lines.push('## Resolution workflow');
lines.push('');
lines.push(
  '1. An admin opens `PATCH /api/admin/anomalies/{id}/resolve` with `resolvedValue` and an optional `note`.',
);
lines.push('2. The service validates the value, writes an audit record and stores who resolved it and when.');
lines.push(
  '3. Every open escalation whose affected decisions reference the anomaly is re-evaluated. Escalations that no longer return `REVIEW_REQUIRED` are auto-resolved with a note.',
);
lines.push(
  '4. Reopening (`POST /api/admin/anomalies/{id}/reopen`) requires a reason, is audit logged and resets the anomaly to `open`.',
);
lines.push('');
lines.push('## Known need for college confirmation');
lines.push('');
lines.push(
  '- Probation load: 9 vs 12 credits (`A-REG-01`, `A-REG-02`).',
);
lines.push(
  '- Field training: credit weight is not stated, so it is stored as 0 credits and as a non-credit requirement.',
);
lines.push(
  '- `MTH1108` is referenced by `DSC3102` but does not exist in the catalogue (`A-CAT-11`).',
);
lines.push(
  '- Graduation project credit threshold: 90 vs 96 passed credits (`A-REG-06`).',
);
lines.push('- Elective pools overlap for several courses (`A-REG-05`, `A-CAT-17`, `A-CAT-18`).');
lines.push('');
lines.push(
  '> This file is generated from `regulation-data/anomalies.json`; edit the JSON (and the seed) instead of the markdown.',
);

writeFileSync(path.join(ROOT, 'docs', 'data-anomalies.md'), `${lines.join('\n')}\n`, 'utf8');
console.log(`wrote docs/data-anomalies.md with ${anomalies.length} anomalies`);
