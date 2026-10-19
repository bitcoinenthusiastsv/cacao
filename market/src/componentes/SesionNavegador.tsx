'use client';

import { useAuth } from '@clerk/nextjs';
import { useEffect } from 'react';

import { fijarObtenerToken } from '@/lib/supabase-navegador';

// Hands the browser Supabase client the Clerk session token, so reads and Realtime run as the
// signed-in person. Renders nothing.
export function SesionNavegador() {
  const { getToken } = useAuth();
  useEffect(() => {
    fijarObtenerToken(() => getToken());
  }, [getToken]);
  return null;
}
