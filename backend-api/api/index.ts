import { createApp } from '../src/app';

/**
 * Vercel serverless entrypoint.
 *
 * `createApp()` returns a fully configured Express application, which is itself
 * a valid Node.js request handler, so it can be exported directly as the
 * default export of a Vercel Function.
 *
 * The function is exposed through the rewrites declared in `vercel.json`
 * (`/api/*` and `/health` -> `/api/index`). Vercel preserves the original
 * `req.url`, so Express keeps routing on the real path.
 */
const app = createApp();

export default app;
