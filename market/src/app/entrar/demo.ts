import 'server-only';

// The fixed code for the demo accounts. The local stack accepts 123456 for the test phones
// (supabase/config.toml); DEMO_CODIGO can change it for a deployment that uses other test phones.
export const CODIGO_DEMO = process.env.DEMO_CODIGO ?? '123456';

// The only people the demo buttons can sign in as. Each is a test phone of the seed data.
export const PERSONAS_DEMO = {
  lucia: '70000006',
  rosa: '70000002',
  ana: '70000001',
} as const;

export type PersonaDemo = keyof typeof PERSONAS_DEMO;
