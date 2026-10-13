import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

// This project's folder. Next otherwise picks a workspace root from the lockfiles it finds.
const raiz = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // The host was adding a trailing slash and Next was taking it off, so a page
  // redirected forever and never opened. vercel.json keeps the slash off.
  skipTrailingSlashRedirect: true,
  turbopack: {
    root: raiz,
  },
};

export default nextConfig;
