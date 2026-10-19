// Reads the Clerk session of every request, so pages can ask for it. Nothing is blocked here:
// the operator panel checks its own sign-in (src/pages/operadores.astro).
import { clerkMiddleware } from '@clerk/astro/server';

export const onRequest = clerkMiddleware();
