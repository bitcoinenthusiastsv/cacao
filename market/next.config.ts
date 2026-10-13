import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

// This project's folder. Next otherwise picks a workspace root from the lockfiles it finds.
const raiz = path.dirname(fileURLToPath(import.meta.url));

// A UUID is the only id a product or shop can have. Anything else can never be a row, so it is
// sent to a path that does not exist: Next answers that with a real 404 status, before any
// streaming starts (a notFound() in the page would come after the 200 is already sent).
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const ID_NO_UUID = `(?!${UUID}$)[^/]+`;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The host was adding a trailing slash and Next was taking it off, so a product
  // page redirected forever and never opened. vercel.json keeps the slash off.
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: raiz,
  },
  async rewrites() {
    return [
      { source: `/productos/:id(${ID_NO_UUID})`, destination: '/no-existe' },
      { source: `/negocios/:id(${ID_NO_UUID})`, destination: '/no-existe' },
      { source: `/servicios/:id(${ID_NO_UUID})`, destination: '/no-existe' },
      { source: `/necesito/:id((?!nuevo$)${ID_NO_UUID})`, destination: '/no-existe' },
    ];
  },
};

export default nextConfig;
