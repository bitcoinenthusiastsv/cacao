// Reads the Clerk session of every request, so pages and routes can ask for it. Nothing is blocked
// here: the admin panel checks its own access (src/lib/servidor/admin-acceso.ts).
import { clerkMiddleware } from '@clerk/astro/server';

export const onRequest = clerkMiddleware();
