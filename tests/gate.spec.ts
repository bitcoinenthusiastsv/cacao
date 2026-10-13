import { expect, test } from '@playwright/test';

const PAGA = '/historias/la-ola-que-cambio-un-pueblo/';
const GRATIS = '/historias/como-pedir-un-cafe-de-altura/';
const CLAVE = 'cacao-gate:la-ola-que-cambio-un-pueblo';
const DIA = 24 * 60 * 60 * 1000;

const TRAVEL = 'https://cacao-travel.vercel.app';
const TOUR = {
  id: 'prueba',
  titulo: 'Experiencia de prueba',
  lugar: 'El Zonte',
  duracion: '3 horas',
  nivel: 'Fácil',
  precio: 45000,
  url: `${TRAVEL}/experiencias/prueba/`,
  foto: `${TRAVEL}/fotos/prueba.jpg`,
  historias: ['la-ola-que-cambio-un-pueblo'],
};

test('paid story starts locked', async ({ page }) => {
  await page.goto(PAGA);
  await expect(page.locator('article[data-historia]')).toHaveAttribute('data-gate-estado', 'bloqueado');
  await expect(page.locator('[data-gate-cerrado]')).toBeHidden();
  await expect(page.locator('[data-gate-muro]')).toBeVisible();
  await expect(page.locator('[data-gate-pastilla]')).toHaveText('120 sats');
  await expect(page.locator('[data-gate-muro]')).toContainText('Modo demo');
});

test('unlocking reveals the story and survives a reload', async ({ page }) => {
  await page.goto(PAGA);
  await page.locator('[data-gate-boton]').click();
  await expect(page.locator('[data-gate-cerrado]')).toBeVisible();
  await expect(page.locator('[data-gate-muro]')).toBeHidden();

  const expira = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).expira, CLAVE);
  expect(expira - Date.now()).toBeGreaterThan(6.9 * DIA);
  expect(expira - Date.now()).toBeLessThanOrEqual(7 * DIA);

  await page.reload();
  await expect(page.locator('[data-gate-cerrado]')).toBeVisible();
});

test('reading the unlocked part sets the state to leyendo', async ({ page }) => {
  await page.goto(PAGA);
  await page.locator('[data-gate-boton]').click();
  await expect(page.locator('article[data-historia]')).toHaveAttribute('data-gate-estado', 'desbloqueado');
  await expect(page.locator('[data-gate-pastilla]')).toHaveText('Desbloqueado');
  await page.mouse.wheel(0, 800);
  await expect(page.locator('article[data-historia]')).toHaveAttribute('data-gate-estado', 'leyendo');
  await expect(page.locator('[data-gate-pastilla]')).toHaveText('Leyendo');
});

test('unlocking does not make the page jump', async ({ page }) => {
  await page.goto(PAGA);
  const boton = page.locator('[data-gate-boton]');
  // Bring the button into view first, so the click itself does not scroll the page.
  await boton.scrollIntoViewIfNeeded();
  const antes = await page.evaluate(() => window.scrollY);
  await boton.click();
  await expect(page.locator('[data-gate-cerrado]')).toBeVisible();
  const despues = await page.evaluate(() => window.scrollY);
  expect(Math.abs(despues - antes)).toBeLessThan(5);
});

test('an expired unlock locks the story again', async ({ page }) => {
  await page.goto(PAGA);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ token: 'viejo', expira: Date.now() - 1000 })), CLAVE);
  await page.reload();
  await expect(page.locator('article[data-historia]')).toHaveAttribute('data-gate-estado', 'expirado');
  await expect(page.locator('[data-gate-cerrado]')).toBeHidden();
  await expect(page.locator('[data-gate-vencido]')).toBeVisible();
  await expect(page.locator('[data-gate-boton]')).toHaveText('Desbloquear de nuevo');
  await expect(page.locator('[data-gate-pastilla]')).toHaveText('Expirado');

  await page.locator('[data-gate-boton]').click();
  await expect(page.locator('[data-gate-cerrado]')).toBeVisible();
});

// A sentence that only exists after the gate in this story.
const FRASE_CERRADA = 'Una moneda que llegó por la misma carretera';

test('the locked text is not in the page and the server refuses to hand it out without a token', async ({ page, request }) => {
  const fuente = await (await request.get(PAGA)).text();
  expect(fuente).not.toContain(FRASE_CERRADA);

  const api = '/api/contenido/la-ola-que-cambio-un-pueblo/';
  expect((await request.get(api)).status()).toBe(401);
  expect((await request.get(api, { headers: { Authorization: 'Bearer abc.def' } })).status()).toBe(401);

  // A real token, but issued for a different story, does not open this one.
  const otra = await request.post('/api/desbloquear/', { data: { slug: 'lo-que-nadie-te-cuenta-del-tunco' } });
  const { token } = await otra.json();
  expect((await request.get(api, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);

  // Tampering with the payload breaks the signature.
  const [, firma] = token.split('.');
  const falso = Buffer.from(JSON.stringify({ tipo: 'pago', slugs: ['la-ola-que-cambio-un-pueblo'], exp: Date.now() + 1e9 })).toString('base64url');
  expect((await request.get(api, { headers: { Authorization: `Bearer ${falso}.${firma}` } })).status()).toBe(401);

  // The right token gets the text.
  const buena = await (await request.post('/api/desbloquear/', { data: { slug: 'la-ola-que-cambio-un-pueblo' } })).json();
  const r = await request.get(api, { headers: { Authorization: `Bearer ${buena.token}` } });
  expect(r.status()).toBe(200);
  expect((await r.json()).html).toContain(FRASE_CERRADA);
});

test('a free story cannot be asked for through the unlock API', async ({ request }) => {
  expect((await request.post('/api/desbloquear/', { data: { slug: 'como-pedir-un-cafe-de-altura' } })).status()).toBe(404);
  expect((await request.post('/api/desbloquear/', { data: { slug: '../../etc/passwd' } })).status()).toBe(404);
});

test('a device that lies about its expiry is corrected by the server', async ({ page }) => {
  await page.goto(PAGA);
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ token: 'inventado.firma', expira: Date.now() + 1e9 })), CLAVE);
  await page.reload();
  await expect(page.locator('article[data-historia]')).toHaveAttribute('data-gate-estado', 'bloqueado');
  await expect(page.locator('[data-gate-muro]')).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), CLAVE)).toBeNull();
});

test('an unlocked story passes the reader token to its Cacao Travel experience', async ({ page }) => {
  await page.route(`${TRAVEL}/api/tours.json`, (r) => r.fulfill({ json: { tours: [TOUR] } }));
  await page.route(`${TRAVEL}/fotos/**`, (r) => r.fulfill({ status: 204 }));
  await page.goto(PAGA);
  const enlace = page.locator('[data-widget-travel] .wt-boleto');
  await expect(enlace).toHaveAttribute('href', TOUR.url);
  await page.locator('[data-gate-boton]').click();
  await expect(enlace).toHaveAttribute('href', /#lector=/);
  await expect(page.locator('.wt__lector')).toBeVisible();
});

test('unlocking one story does not unlock another', async ({ page }) => {
  await page.goto(PAGA);
  await page.locator('[data-gate-boton]').click();
  await page.goto('/historias/lo-que-nadie-te-cuenta-del-tunco/');
  await expect(page.locator('[data-gate-cerrado]')).toBeHidden();
});

test('a failed unlock explains itself', async ({ page }) => {
  await page.route('**/api/desbloquear/', (r) => r.abort());
  await page.goto(PAGA);
  await page.locator('[data-gate-boton]').click();
  await expect(page.locator('[data-gate-error]')).toBeVisible();
  await expect(page.locator('[data-gate-error]')).toContainText('No pudimos desbloquear');
  await expect(page.locator('[data-gate-muro]')).toBeVisible();
});

test('the story opens even when the browser blocks storage', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
  });
  await page.goto(PAGA);
  await page.locator('[data-gate-boton]').click();
  await expect(page.locator('[data-gate-cerrado]')).toBeVisible();
});

test('free story has no wall', async ({ page }) => {
  await page.goto(GRATIS);
  await expect(page.locator('article[data-historia]')).toHaveAttribute('data-gate-estado', 'gratis');
  await expect(page.locator('[data-gate-muro]')).toHaveCount(0);
  await expect(page.locator('[data-gate-pastilla]')).toHaveText('Gratis');
});

test('a reading pass is removed from the address bar on a free story', async ({ page }) => {
  await page.goto(GRATIS + '#pase=abc.def');
  await expect(page.locator('article[data-historia]')).toHaveAttribute('data-gate-estado', 'gratis');
  expect(page.url()).not.toContain('pase');
});


test('the Travel widget renders what the Cacao Travel API returns', async ({ page }) => {
  await page.route(`${TRAVEL}/api/tours.json`, (r) => r.fulfill({ json: { tours: [TOUR] } }));
  await page.route(`${TRAVEL}/fotos/**`, (r) => r.fulfill({ status: 204 }));
  await page.goto(PAGA);
  const widget = page.locator('[data-widget-travel]');
  await expect(widget).toBeVisible();
  await expect(widget.locator('[data-widget-precio]')).toHaveText('45,000 sats');
  await expect(widget.locator('.wt-boleto')).toHaveAttribute('href', TOUR.url);
});

test('the Travel widget stays hidden when the story has no experience or the API fails', async ({ page }) => {
  await page.route(`${TRAVEL}/api/tours.json`, (r) => r.fulfill({ json: { tours: [TOUR] } }));
  await page.goto(GRATIS);
  await expect(page.locator('[data-widget-travel]')).toBeHidden();

  await page.route(`${TRAVEL}/api/tours.json`, (r) => r.abort());
  await page.goto(PAGA);
  await expect(page.locator('[data-widget-travel]')).toBeHidden();
});

test('a place story with no linked experience still gets one from the same place', async ({ page }) => {
  const enElPuerto = { ...TOUR, lugar: 'Puerto de La Libertad', historias: [] };
  await page.route(`${TRAVEL}/api/tours.json`, (r) => r.fulfill({ json: { tours: [enElPuerto] } }));
  await page.route(`${TRAVEL}/fotos/**`, (r) => r.fulfill({ status: 204 }));
  await page.goto('/historias/punta-roca-la-derecha/');
  await expect(page.locator('[data-widget-travel]')).toBeVisible();

  // A coffee how-to in the same city does not qualify: it is not a place story.
  const enLaCapital = { ...TOUR, lugar: 'San Salvador', historias: [] };
  await page.route(`${TRAVEL}/api/tours.json`, (r) => r.fulfill({ json: { tours: [enLaCapital] } }));
  await page.goto(GRATIS);
  await expect(page.locator('[data-widget-travel]')).toBeHidden();
});

test('the widget ignores entries that point outside Cacao Travel', async ({ page }) => {
  const falso = { ...TOUR, url: 'https://example.com/phish/' };
  await page.route(`${TRAVEL}/api/tours.json`, (r) => r.fulfill({ json: { tours: [falso] } }));
  await page.goto(PAGA);
  await expect(page.locator('[data-widget-travel]')).toBeHidden();
});

for (const ruta of ['/', '/cronicas/', '/archivo/', '/acerca/', PAGA]) {
  test(`no horizontal scroll at 375px on ${ruta}`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(ruta);
    const desborde = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(desborde).toBeLessThanOrEqual(0);
  });
}
