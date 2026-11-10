import express, { Router } from 'express';
import path from 'node:path';
import openapi from './openapi.json';

/**
 * Swagger / OpenAPI documentation.
 *
 * The specification lives in `openapi.json` (also exported to the repository
 * root for Postman / Swagger Editor imports). Swagger UI assets are served
 * locally from the `swagger-ui-dist` package so the docs work offline.
 */

const assetsDir = path.dirname(require.resolve('swagger-ui-dist/package.json'));

// Helmet's global policy is intentionally strict (`default-src 'none'`), which
// would block Swagger UI's inline styles and its own same-origin fetches.
const DOCS_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SWAGGER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Smart Academic Advisor API · Swagger UI</title>
    <link rel="stylesheet" href="/api/docs/assets/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *::before, *::after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
      .swagger-ui .topbar { display: none; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/api/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/docs/assets/swagger-ui-standalone-preset.js"></script>
    <script src="/api/docs/swagger-init.js"></script>
  </body>
</html>`;

const SWAGGER_INIT = `window.addEventListener('load', function () {
  window.ui = SwaggerUIBundle({
    url: '/api/openapi.json',
    dom_id: '#swagger-ui',
    deepLinking: true,
    docExpansion: 'list',
    filter: true,
    persistAuthorization: true,
    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
    plugins: [SwaggerUIBundle.plugins.DownloadUrl],
    layout: 'StandaloneLayout'
  });
});`;

export const docsRouter = Router();

docsRouter.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', DOCS_CSP);
  next();
});

docsRouter.get('/openapi.json', (_req, res) => {
  res.json(openapi);
});

docsRouter.get('/docs', (_req, res) => {
  res.type('html').send(SWAGGER_HTML);
});

docsRouter.get('/docs/swagger-init.js', (_req, res) => {
  res.type('application/javascript').send(SWAGGER_INIT);
});

docsRouter.use('/docs/assets', express.static(assetsDir, { index: false, maxAge: '1d' }));
