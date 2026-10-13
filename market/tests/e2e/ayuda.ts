import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import { type Browser, type Page, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Test phones 7000 0001 to 7000 0009 accept code 123456 on the local stack (supabase/config.toml).
export const PERSONAS = {
  ana: 1, // admin
  rosa: 2, // sellers, each with an approved shop
  mario: 3,
  elena: 4,
  tomas: 5,
  lucia: 6, // buyers
  andres: 7,
  sofia: 8,
  diego: 9,
} as const;

export type Persona = keyof typeof PERSONAS;

// browser.newContext() ignores the config's `use`, so the phone settings are repeated here.
export const OPCIONES_CONTEXTO = {
  viewport: { width: 375, height: 800 },
  locale: 'es-SV',
  timezoneId: 'America/El_Salvador',
} as const;

// The local stack sends at most 30 codes per hour. A saved session per person keeps a full run
// well under that. The folder is ignored by git; it only holds test-phone cookies.
const CARPETA_SESIONES = path.join(process.cwd(), '.qa', 'e2e-sesiones');

/** Opens a browser context signed in as one of the test people, reusing a saved session when it is still valid. */
export async function sesionDe(browser: Browser, persona: Persona): Promise<Page> {
  const archivo = path.join(CARPETA_SESIONES, `${persona}.json`);
  if (existsSync(archivo)) {
    const guardada = await browser.newContext({ ...OPCIONES_CONTEXTO, storageState: archivo });
    const pagina = await guardada.newPage();
    await pagina.goto('/cuenta');
    if (!/\/entrar/.test(pagina.url())) return pagina;
    await guardada.close();
  }

  const contexto = await browser.newContext(OPCIONES_CONTEXTO);
  const pagina = await contexto.newPage();
  await pagina.goto('/entrar');
  await pagina.getByLabel('Número de celular').fill(`7000000${PERSONAS[persona]}`);
  await pagina.getByRole('button', { name: 'Enviar código' }).click();
  const campoCodigo = pagina.getByLabel('Código de seis números');
  const limite = pagina.getByText(/demasiados códigos/);
  await expect(campoCodigo.or(limite)).toBeVisible({ timeout: 20_000 });
  if (await limite.isVisible()) {
    throw new Error('Se agotó el límite de SMS del stack local (30 por hora). Esperá y volvé a correr.');
  }
  await campoCodigo.fill('123456');
  await pagina.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(pagina).not.toHaveURL(/\/entrar/, { timeout: 60_000 });
  mkdirSync(CARPETA_SESIONES, { recursive: true });
  await contexto.storageState({ path: archivo });
  return pagina;
}

/**
 * Service-role client for arranging and checking data from tests. Run Playwright with
 * `node --env-file=.env.local node_modules/@playwright/test/cli.js test` so the keys are present.
 */
export function servicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) throw new Error('Faltan las variables de .env.local. Usá --env-file=.env.local.');
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** User id of a test person, looked up by phone. */
export async function idDe(persona: Persona): Promise<string> {
  const { data, error } = await servicio()
    .from('usuarios')
    .select('id')
    .eq('telefono', `5037000000${PERSONAS[persona]}`)
    .single();
  if (error || !data) throw new Error(`No encontré a ${persona}: ${error?.message}`);
  return data.id as string;
}

/** True when the page is wider than the screen (sideways scroll). */
export async function seDesborda(pagina: Page): Promise<boolean> {
  return pagina.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

// The local stack's mail catcher (Mailpit, supabase/config.toml [local_smtp]). Emails never leave the machine.
const CATCHER = 'http://127.0.0.1:54324';

/**
 * The six digits in the newest email the local stack sent to `correo`. Polls the catcher for up to
 * 20 seconds. Pass `desde` to ignore mail that arrived earlier, such as a code from a previous sign-in.
 */
export async function codigoDeCorreo(correo: string, desde?: Date): Promise<string> {
  const limite = Date.now() + 20_000;
  while (Date.now() < limite) {
    const busqueda = await fetch(`${CATCHER}/api/v1/search?query=${encodeURIComponent(`to:${correo}`)}&limit=5`);
    if (busqueda.ok) {
      const { messages } = (await busqueda.json()) as { messages: { ID: string; Created: string }[] };
      // Newest first, so the first match that is recent enough is the code to use.
      const reciente = messages.find((m) => !desde || new Date(m.Created) >= desde);
      if (reciente) {
        const mensaje = (await (await fetch(`${CATCHER}/api/v1/message/${reciente.ID}`)).json()) as { Text: string };
        const codigo = /\b(\d{6})\b/.exec(mensaje.Text ?? '');
        if (codigo) return codigo[1];
      }
    }
    await new Promise((resolver) => setTimeout(resolver, 1000));
  }
  throw new Error(`No llegó el código a ${correo} en 20 segundos. Revisá que el stack local esté arriba.`);
}

/**
 * The hashed token a sign-in link carries, made with the service-role client. The local mail has only
 * the code, so tests open /auth/confirmar with this token, the way the link would. A new address gets
 * its account here, as a sign-in would create it; `nombre` names the account when given.
 */
export async function tokenDeEnlace(correo: string, nombre?: string): Promise<string> {
  const cliente = servicio();
  const { data, error } = await cliente.auth.admin.generateLink({ type: 'magiclink', email: correo });
  const hash = data?.properties?.hashed_token;
  if (error || !hash || !data.user) throw new Error(`No pude armar el enlace para ${correo}: ${error?.message}`);
  if (nombre) {
    const { error: errorNombre } = await cliente.rpc('actualizar_perfil', { p_usuario: data.user.id, p_nombre: nombre });
    if (errorNombre) throw new Error(`No pude poner el nombre a ${correo}: ${errorNombre.message}`);
  }
  return hash;
}
