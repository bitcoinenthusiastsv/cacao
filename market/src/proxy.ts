import { clerkMiddleware } from '@clerk/nextjs/server';

// Runs before each page request. Clerk reads the session and refreshes its token when needed.
// It never redirects: pages decide that.
export default clerkMiddleware();

// Static files skip the proxy: images, fonts, the manifest and Next's own assets.
export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|webmanifest)$).*)'],
};
