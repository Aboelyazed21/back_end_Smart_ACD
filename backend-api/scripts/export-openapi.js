// Copies the canonical OpenAPI document to the repository root so it can be
// imported directly into Postman, Swagger Editor, Insomnia, etc.
const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'src', 'docs', 'openapi.json');
const target = path.join(__dirname, '..', 'openapi.json');

fs.copyFileSync(source, target);
console.log(`OpenAPI document written to ${target}`);
