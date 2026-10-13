// Seeds the local database: nine test users, six product categories, six services categories, six shops
// (four sell products, two only services), 24 products, eight product orders, twelve services, five open
// needs with their offers, and four sample jobs plus two quotes for Lucía. Orders and jobs go through the
// real database functions, never direct inserts. Safe to run twice: whatever already exists is skipped.
//
// Run from the market folder: node --env-file=.env.local scripts/sembrar.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !claveServicio) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. Usá --env-file=.env.local.');
  process.exit(1);
}

const s = createClient(url, claveServicio, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

// Fixed quote for the seed: USD per BTC.
const COTIZACION = 100000;
const MINUTO_MS = 60 * 1000;
const DIA_MS = 24 * 60 * MINUTO_MS;
const ahora = Date.now();

const nuevos = { usuarios: 0, negocios: 0, productos: 0, ordenes: 0, servicios: 0, necesidades: 0, ofertas: 0, cotizaciones: 0, trabajos: 0 };

// Test phones are 5037000000 plus one digit (see supabase/config.toml).
const USUARIOS = [
  { numero: 1, nombre: 'Ana', admin: true },
  { numero: 2, nombre: 'Rosa' },
  { numero: 3, nombre: 'Mario' },
  { numero: 4, nombre: 'Elena' },
  { numero: 5, nombre: 'Tomás' },
  { numero: 6, nombre: 'Lucía' },
  { numero: 7, nombre: 'Andrés' },
  { numero: 8, nombre: 'Sofía' },
  { numero: 9, nombre: 'Diego' },
];

const CATEGORIAS = ['Frutas', 'Verduras', 'Granos y café', 'Lácteos y huevos', 'Miel y conservas', 'Hierbas y plantas'];
const CATEGORIAS_SERVICIO = [
  'Hogar y reparaciones',
  'Transporte y mandados',
  'Belleza y cuidado personal',
  'Clases y tutorías',
  'Tecnología',
  'Comida y eventos',
];

// The shop owner is the user number; users 6 (Lucía) and 9 (Diego) have no shop.
const TIENDAS = [
  {
    dueno: 2,
    nombre: 'Huerta La Ceiba',
    descripcion: 'Hortalizas y frutas de temporada, cultivadas a la orilla de la quebrada.',
    ubicacion: 'El Zonte, La Libertad',
    lightning: 'huerta-la-ceiba@ejemplo.sv',
  },
  {
    dueno: 3,
    nombre: 'Cafetal El Mirador',
    descripcion: 'Café y granos secados al sol en la ladera del Bálsamo. Tostado por pedido.',
    ubicacion: 'Cerro El Bálsamo, La Libertad',
    lightning: 'cafetal-el-mirador@ejemplo.sv',
  },
  {
    dueno: 4,
    nombre: 'Quesería Las Brisas',
    descripcion: 'Queso fresco, crema, huevos de gallina criolla y miel de abeja.',
    ubicacion: 'Zona de El Zonte, La Libertad',
    lightning: 'queseria-las-brisas@ejemplo.sv',
  },
  {
    dueno: 5,
    nombre: 'Hierbas del Cerro',
    descripcion: 'Hierbas aromáticas, té de flor de jamaica y conservas de temporada.',
    ubicacion: 'Bálsamo, La Libertad',
    lightning: 'hierbas-del-cerro@ejemplo.sv',
  },
  {
    dueno: 7,
    nombre: 'Barbería Don Andrés',
    descripcion: 'Cortes de pelo y arreglo de barba, en el local o a domicilio.',
    ubicacion: 'Suchitoto, Cuscatlán',
    lightning: 'barberia-don-andres@ejemplo.sv',
  },
  {
    dueno: 8,
    nombre: 'Sofía Electricista',
    descripcion: 'Instalaciones y reparaciones eléctricas en casas. También reparo celulares y cargadores.',
    ubicacion: 'Suchitoto, Cuscatlán',
    lightning: 'sofia-electricista@ejemplo.sv',
  },
];

// [dueño, categoría, nombre, unidad, precio en centavos de USD, stock, activo]
const PRODUCTOS = [
  [2, 'Verduras', 'Tomate criollo', 'libra', 80, 30, true, '/productos/tomate.jpg'],
  [2, 'Verduras', 'Chile verde', 'libra', 60, 25, true, '/productos/chile-verde.jpg'],
  [2, 'Verduras', 'Güisquil', 'unidad', 50, 40, true, '/productos/guisquil.jpg'],
  [2, 'Verduras', 'Pepino', 'libra', 55, 20, true, '/productos/pepino.jpg'],
  [2, 'Frutas', 'Mango manila', 'libra', 70, 0, true, '/productos/mango-manila.jpg'],
  [2, 'Frutas', 'Banano', 'docena', 150, 20, true, '/productos/banano.jpg'],
  [2, 'Frutas', 'Plátano maduro', 'docena', 200, 16, true, '/productos/platano-maduro.jpg'],
  [2, 'Hierbas y plantas', 'Albahaca', 'manojo', 50, 15, true, '/productos/albahaca.jpg'],
  [2, 'Hierbas y plantas', 'Culantro', 'manojo', 50, 12, true, '/productos/culantro.jpg'],
  [3, 'Granos y café', 'Café tostado en grano', 'bolsa de 1 libra', 1200, 18, true, '/productos/cafe-tostado-en-grano.jpg'],
  [3, 'Granos y café', 'Café molido', 'bolsa de 1 libra', 1100, 22, true, '/productos/cafe-molido.jpg'],
  [3, 'Granos y café', 'Cacao en grano tostado', 'bolsa de 1 libra', 1000, 9, true, '/productos/cacao-en-grano-tostado.jpg'],
  [3, 'Granos y café', 'Maíz blanco', 'libra', 90, 40, true, '/productos/maiz-blanco.jpg'],
  [3, 'Granos y café', 'Frijol rojo', 'libra', 110, 35, true, '/productos/frijol-rojo.jpg'],
  [4, 'Lácteos y huevos', 'Queso fresco', 'libra', 650, 10, true, '/productos/queso-fresco.jpg'],
  [4, 'Lácteos y huevos', 'Huevos de gallina criolla', 'docena', 400, 30, true, '/productos/huevos-de-gallina-criolla.jpg'],
  [4, 'Lácteos y huevos', 'Crema de leche', 'botella de 750 ml', 550, 8, true, '/productos/crema-de-leche.jpg'],
  [4, 'Miel y conservas', 'Miel de abeja', 'botella de 750 ml', 1000, 12, true, '/productos/miel-de-abeja.jpg'],
  [4, 'Miel y conservas', 'Mermelada de nance', 'frasco de 370 ml', 550, 9, false, '/productos/mermelada-de-nance.jpg'],
  [5, 'Hierbas y plantas', 'Hierbabuena', 'manojo', 50, 0, true, '/productos/hierbabuena.jpg'],
  [5, 'Hierbas y plantas', 'Té de flor de jamaica', 'bolsa de 1 libra', 500, 14, true, '/productos/te-de-flor-de-jamaica.jpg'],
  [5, 'Miel y conservas', 'Conserva de chile jalapeño', 'frasco de 370 ml', 600, 10, true, '/productos/conserva-de-chile-jalapeno.jpg'],
  [5, 'Frutas', 'Maracuyá', 'docena', 300, 12, true, '/productos/maracuya.jpg'],
  [5, 'Frutas', 'Limón mandarina', 'libra', 50, 25, true, '/productos/limon-mandarina.jpg'],
];

// comprador and tienda are user numbers. estado is where the order ends.
// entrega: who marks it delivered ('comprador' or 'vendedor', the latter with the code).
const PEDIDOS = [
  {
    clave: 'sembrar-01',
    comprador: 6,
    tienda: 2,
    lineas: [['Tomate criollo', 2], ['Albahaca', 1]],
    estado: 'esperando_pago',
  },
  {
    clave: 'sembrar-02',
    comprador: 2,
    tienda: 3,
    lineas: [['Café tostado en grano', 1], ['Maíz blanco', 2]],
    estado: 'pagada',
  },
  {
    clave: 'sembrar-03',
    comprador: 7,
    tienda: 4,
    modo: 'entrega_vendedor',
    lineas: [['Queso fresco', 1], ['Huevos de gallina criolla', 1]],
    estado: 'pagada',
  },
  {
    clave: 'sembrar-04',
    comprador: 9,
    tienda: 2,
    lineas: [['Banano', 2], ['Pepino', 1]],
    estado: 'lista',
    mensajes: [
      [9, '¿Me lo podés dejar en la entrada de la finca?'],
      [2, 'Sí, dejalo en la caseta junto al portón.'],
    ],
  },
  {
    clave: 'sembrar-05',
    comprador: 3,
    tienda: 4,
    lineas: [['Miel de abeja', 1], ['Crema de leche', 1]],
    estado: 'cerrada',
    entrega: 'comprador',
    resena: [5, 'Miel muy rica y todo llegó bien.'],
  },
  {
    clave: 'sembrar-06',
    comprador: 8,
    tienda: 5,
    lineas: [['Té de flor de jamaica', 1], ['Conserva de chile jalapeño', 1]],
    estado: 'cerrada',
    entrega: 'vendedor',
    resena: [4, 'Buena conserva, el té tiene buen aroma.'],
  },
  {
    clave: 'sembrar-07',
    comprador: 7,
    tienda: 5,
    lineas: [['Maracuyá', 1]],
    estado: 'entregada',
    entrega: 'comprador',
  },
  {
    clave: 'sembrar-08',
    comprador: 8,
    tienda: 3,
    lineas: [['Café molido', 1]],
    estado: 'disputada',
    disputa: 'El café llegó con otro tueste que el de la foto.',
    mensajes: [
      [8, 'Lo pedí de tueste medio, no oscuro.'],
      [3, 'Revisamos el lote y te mandamos una foto del empaque.'],
    ],
  },
];

// [dueño, categoría, título, descripción, zona, tipo ('fijo' | 'cotizar'), precio en centavos, unidad, foto (en public/productos, o null)]
// The electrical service has no photo: no clean picture of a house installation was found.
const SERVICIOS = [
  [2, 'Clases y tutorías', 'Asesoría para huerto casero', 'Te enseño a sembrar, abonar y regar un huerto pequeño en tu patio, con semillas de la zona.', 'El Zonte, La Libertad', 'fijo', 800, 'por hora', '/productos/servicio-asesoria-huerto-casero.jpg'],
  [2, 'Hogar y reparaciones', 'Instalación de huerto en patio', 'Preparamos la tierra, armamos los cajones y dejamos sembrado el huerto. El precio depende del tamaño.', 'El Zonte, La Libertad', 'cotizar', null, null, '/productos/servicio-instalacion-huerto-patio.jpg'],
  [3, 'Comida y eventos', 'Tour del cafetal', 'Recorrido por el cafetal con explicación del cultivo, el secado y el tueste. Incluye una taza de café.', 'Cerro El Bálsamo, La Libertad', 'fijo', 1000, 'por persona', '/productos/servicio-tour-cafetal.jpg'],
  [3, 'Clases y tutorías', 'Taller de catación de café', 'Aprendé a distinguir notas de sabor en tres cafés de la finca. Dura una hora y media.', 'Cerro El Bálsamo, La Libertad', 'fijo', 900, 'por persona', '/productos/servicio-taller-catacion-cafe.jpg'],
  [4, 'Clases y tutorías', 'Taller de queso fresco', 'Hacemos queso fresco juntos desde la leche. Te vas con tu propio queso para la casa.', 'Zona de El Zonte, La Libertad', 'fijo', 1200, 'por persona', '/productos/servicio-taller-queso-fresco.jpg'],
  [4, 'Hogar y reparaciones', 'Reparación de cercas y portones', 'Cambio de postes, alambre y bisagras en cercas de finca o de casa. Cotizamos después de ver el trabajo.', 'Zona de El Zonte, La Libertad', 'cotizar', null, null, '/productos/servicio-reparacion-cercas-portones.jpg'],
  [5, 'Transporte y mandados', 'Mandados en moto dentro de Suchitoto', 'Compras, pagos y paquetes dentro de Suchitoto. La hora la coordinamos por el chat.', 'Suchitoto, Cuscatlán', 'fijo', 200, 'por viaje', '/productos/servicio-mandados-moto-suchitoto.jpg'],
  [5, 'Clases y tutorías', 'Clases de guitarra', 'Clases de guitarra para principiantes, con tu propia guitarra o con la mía.', 'Bálsamo, La Libertad', 'fijo', 600, 'por hora', '/productos/servicio-clases-guitarra.jpg'],
  [7, 'Belleza y cuidado personal', 'Corte de pelo clásico', 'Corte a tijera o máquina, con lavado. Atendemos sin cita los sábados.', 'Suchitoto, Cuscatlán', 'fijo', 500, 'por corte', '/productos/servicio-corte-pelo-clasico.jpg'],
  [7, 'Belleza y cuidado personal', 'Arreglo de barba', 'Perfilado y arreglo de barba con navaja y toalla caliente.', 'Suchitoto, Cuscatlán', 'fijo', 300, 'por servicio', '/productos/servicio-arreglo-barba.jpg'],
  [8, 'Hogar y reparaciones', 'Instalación eléctrica en casa', 'Cableado, tomacorrientes, breakers y revisión del tablero. Cotizamos después de ver la casa.', 'Suchitoto, Cuscatlán', 'cotizar', null, null, null],
  [8, 'Tecnología', 'Reparación de celulares', 'Cambio de pantalla, batería y cargadores. Revisamos el equipo y decimos el costo antes de cambiar piezas.', 'Suchitoto, Cuscatlán', 'cotizar', null, null, '/productos/servicio-reparacion-celulares.jpg'],
];

// [usuario, categoría, título, descripción, zona, presupuesto en centavos o null]
const NECESIDADES = [
  [6, 'Hogar y reparaciones', 'Revisar la instalación eléctrica de la cocina', 'Se apagan los tomacorrientes cuando prendo la licuadora. Necesito que revisen el cableado y el breaker.', 'Suchitoto, Cuscatlán', 6000],
  [6, 'Transporte y mandados', 'Mandado semanal al mercado de Suchitoto', 'Una vez por semana, compras de la lista que te mando por el chat. Alcanza con una moto.', 'Suchitoto, Cuscatlán', 300],
  [9, 'Belleza y cuidado personal', 'Corte de pelo para una boda', 'Necesito un corte prolijo el sábado temprano, en mi casa en el Bálsamo.', 'Bálsamo, La Libertad', 2000],
  [9, 'Clases y tutorías', 'Clases de guitarra para principiante', 'Quiero aprender acordes básicos. Prefiero clases cortas, una vez por semana.', 'Bálsamo, La Libertad', 2500],
  [9, 'Tecnología', 'Reparar el celular que no enciende', 'Se apaga solo y no carga. No sé si es la batería o el puerto de carga.', 'Bálsamo, La Libertad', null],
];

// [necesidad (título), dueño de la tienda, precio en centavos, mensaje]
const OFERTAS = [
  ['Revisar la instalación eléctrica de la cocina', 8, 4500, 'Puedo pasar el sábado por la mañana. Traigo el material básico.'],
  ['Mandado semanal al mercado de Suchitoto', 5, 300, 'Los lunes temprano. Si la lista pesa mucho, lo vemos aparte.'],
  ['Mandado semanal al mercado de Suchitoto', 4, 400, 'Tengo camioneta chica. Puedo ir los martes o los viernes.'],
  ['Corte de pelo para una boda', 7, 1500, 'Voy a tu casa el sábado a las 6 de la mañana. Llevo todo.'],
  ['Clases de guitarra para principiante', 5, 2400, 'Doce clases de una hora. Empezamos con tres acordes y una canción.'],
  ['Reparar el celular que no enciende', 8, 1200, 'Lo reviso y te digo el costo antes de cambiar piezas.'],
];

// Sample jobs for Lucía (6). estado: where the job ends. Each one goes through the real functions.
const TRABAJOS = [
  {
    clave: 'sembrar-trabajo-01',
    cliente: 6,
    servicio: 'Taller de queso fresco',
    estado: 'acordada',
    nota: 'Vamos el sábado a las 9 de la mañana. Llevo una bolsa para el queso.',
  },
  { clave: 'sembrar-trabajo-02', cliente: 6, servicio: 'Mandados en moto dentro de Suchitoto', estado: 'hecha' },
  { clave: 'sembrar-trabajo-03', cliente: 6, servicio: 'Asesoría para huerto casero', estado: 'entregada' },
  {
    clave: 'sembrar-trabajo-04',
    cliente: 6,
    servicio: 'Clases de guitarra',
    estado: 'cancelada',
    motivo: 'Ya no lo necesito, gracias.',
  },
];

// Quotes for Lucía (6): one waits for the shop, one already has an offer waiting for her.
const COTIZACIONES = [
  {
    cliente: 6,
    servicio: 'Instalación eléctrica en casa',
    descripcion: 'Quiero revisar el tablero y poner dos tomacorrientes nuevos en la cocina.',
    estado: 'ofrecida',
    precio: 9500,
    mensaje: 'Incluye tomacorrientes y breaker. Puedo ir el jueves por la tarde.',
  },
  {
    cliente: 6,
    servicio: 'Instalación de huerto en patio',
    descripcion: 'Tengo un patio de tierra de unos tres metros. Me interesa un huerto con verduras de temporada.',
    estado: 'solicitada',
  },
];

// Calls a database function and stops with its message when it fails.
async function rpc(nombre, args) {
  const { data, error } = await s.rpc(nombre, args);
  if (error) throw new Error(`${nombre}: ${error.message}`);
  return data;
}

async function unico(tabla, columnas, filtros) {
  let consulta = s.from(tabla).select(columnas);
  for (const [columna, valor] of Object.entries(filtros)) consulta = consulta.eq(columna, valor);
  const { data, error } = await consulta.maybeSingle();
  if (error) throw error;
  return data;
}

async function asegurarUsuarios() {
  const ids = {};
  for (const u of USUARIOS) {
    const telefono = `5037000000${u.numero}`;
    const { data: existente, error } = await s.from('usuarios').select('id').eq('telefono', telefono).maybeSingle();
    if (error) throw error;
    let id = existente?.id;
    if (!id) {
      const { data, error: errorAlta } = await s.auth.admin.createUser({ phone: telefono, phone_confirm: true });
      if (errorAlta) throw errorAlta;
      id = data.user.id;
      nuevos.usuarios++;
    }
    await rpc('actualizar_perfil', { p_usuario: id, p_nombre: u.nombre });
    if (u.admin) {
      const { error: errorAdmin } = await s.from('usuarios').update({ es_admin: true }).eq('id', id);
      if (errorAdmin) throw errorAdmin;
    }
    ids[u.numero] = id;
  }
  return ids;
}

async function asegurarCategorias() {
  const { error } = await s
    .from('categorias')
    .upsert(CATEGORIAS.map((nombre, i) => ({ nombre, orden: i + 1 })), { onConflict: 'nombre', ignoreDuplicates: true });
  if (error) throw error;
  const { data, error: errorLectura } = await s.from('categorias').select('id, nombre');
  if (errorLectura) throw errorLectura;
  return Object.fromEntries(data.map((c) => [c.nombre, c.id]));
}

async function asegurarTiendas(ids, idAdmin) {
  const negocioDe = {};
  for (const t of TIENDAS) {
    const existente = await unico('negocios', 'id, estado', { usuario_id: ids[t.dueno] });
    let id = existente?.id;
    let estado = existente?.estado;
    if (!id) {
      const negocio = await rpc('solicitar_negocio', {
        p_usuario: ids[t.dueno],
        p_nombre: t.nombre,
        p_descripcion: t.descripcion,
        p_ubicacion: t.ubicacion,
        p_lightning_address: t.lightning,
      });
      id = negocio.id;
      estado = negocio.estado;
      nuevos.negocios++;
    }
    if (estado !== 'aprobado') {
      await rpc('cambiar_estado_negocio', { p_negocio: id, p_actor: idAdmin, p_estado: 'aprobado' });
    }
    // The fake provider lets developers simulate payments without a wallet.
    const { error } = await s.from('negocios').update({ tipo_proveedor_pago: 'falso' }).eq('id', id);
    if (error) throw error;
    negocioDe[t.dueno] = id;
  }
  return negocioDe;
}

async function asegurarProductos(ids, negocioDe, categoriaDe) {
  const { data: existentes, error } = await s.from('productos').select('negocio_id, nombre');
  if (error) throw error;
  const yaExisten = new Set(existentes.map((p) => `${p.negocio_id}|${p.nombre}`));

  for (const [dueno, categoria, nombre, unidad, precio, stock, activo, foto] of PRODUCTOS) {
    if (yaExisten.has(`${negocioDe[dueno]}|${nombre}`)) continue;
    await rpc('guardar_producto', {
      p_usuario: ids[dueno],
      p_producto: null,
      p_categoria: categoriaDe[categoria],
      p_nombre: nombre,
      p_descripcion: '',
      p_unidad: unidad,
      p_precio: precio,
      p_stock: stock,
      p_activo: activo,
      p_fotos: foto ? [foto] : [],
    });
    nuevos.productos++;
  }

  const { data: todos, error: errorLectura } = await s.from('productos').select('id, negocio_id, nombre');
  if (errorLectura) throw errorLectura;
  return new Map(todos.map((p) => [`${p.negocio_id}|${p.nombre}`, p.id]));
}

async function asegurarCategoriasServicio() {
  const { error } = await s
    .from('categorias_servicio')
    .upsert(CATEGORIAS_SERVICIO.map((nombre, i) => ({ nombre, orden: i + 1 })), { onConflict: 'nombre', ignoreDuplicates: true });
  if (error) throw error;
  const { data, error: errorLectura } = await s.from('categorias_servicio').select('id, nombre');
  if (errorLectura) throw errorLectura;
  return Object.fromEntries(data.map((c) => [c.nombre, c.id]));
}

// Returns the id of each seeded service by its title (the titles are unique in the seed).
async function asegurarServicios(ids, negocioDe, categoriaDe) {
  const tiendas = Object.values(negocioDe);
  const { data: existentes, error } = await s.from('servicios').select('negocio_id, titulo').in('negocio_id', tiendas);
  if (error) throw error;
  const yaExisten = new Set(existentes.map((x) => `${x.negocio_id}|${x.titulo}`));

  for (const [dueno, categoria, titulo, descripcion, zona, tipo, precio, unidad, foto] of SERVICIOS) {
    if (yaExisten.has(`${negocioDe[dueno]}|${titulo}`)) continue;
    await rpc('guardar_servicio', {
      p_usuario: ids[dueno],
      p_servicio: null,
      p_categoria: categoriaDe[categoria],
      p_titulo: titulo,
      p_descripcion: descripcion,
      p_zona: zona,
      p_tipo_precio: tipo,
      p_precio: precio,
      p_unidad: unidad,
      p_activo: true,
      p_fotos: foto ? [foto] : [],
    });
    nuevos.servicios++;
  }

  const { data: todos, error: errorLectura } = await s.from('servicios').select('id, titulo').in('negocio_id', tiendas);
  if (errorLectura) throw errorLectura;
  return new Map(todos.map((x) => [x.titulo, x.id]));
}

// Returns the id of each seeded need by its title.
async function asegurarNecesidades(ids, categoriaDe) {
  const usuarios = [ids[6], ids[9]];
  const { data: existentes, error } = await s.from('necesidades').select('usuario_id, titulo').in('usuario_id', usuarios);
  if (error) throw error;
  const yaExisten = new Set(existentes.map((n) => `${n.usuario_id}|${n.titulo}`));

  for (const [usuario, categoria, titulo, descripcion, zona, presupuesto] of NECESIDADES) {
    if (yaExisten.has(`${ids[usuario]}|${titulo}`)) continue;
    await rpc('publicar_necesidad', {
      p_usuario: ids[usuario],
      p_categoria: categoriaDe[categoria],
      p_titulo: titulo,
      p_descripcion: descripcion,
      p_zona: zona,
      p_presupuesto: presupuesto,
    });
    nuevos.necesidades++;
  }

  const { data: todas, error: errorLectura } = await s.from('necesidades').select('id, titulo').in('usuario_id', usuarios);
  if (errorLectura) throw errorLectura;
  return new Map(todas.map((n) => [n.titulo, n.id]));
}

async function asegurarOfertas(ids, negocioDe, necesidadDe) {
  for (const [titulo, dueno, precio, mensaje] of OFERTAS) {
    const necesidad = necesidadDe.get(titulo);
    // One offer per shop and need: an existing one is left alone, so a second run changes nothing.
    const existente = await unico('cotizaciones', 'id', { necesidad_id: necesidad, negocio_id: negocioDe[dueno] });
    if (existente) continue;
    await rpc('ofertar', { p_usuario: ids[dueno], p_necesidad: necesidad, p_precio: precio, p_mensaje: mensaje });
    nuevos.ofertas++;
  }
}

// The service's shop owner acts for the provider. Each step runs only when the job is not there yet,
// so a second run stops where the first one ended.
async function sembrarTrabajo(t, ids, servicioDe) {
  const cliente = ids[t.cliente];
  const titular = SERVICIOS.find((x) => x[2] === t.servicio);
  const vendedor = ids[titular[0]];
  const existe = await unico('ordenes', 'id', { comprador_id: cliente, clave_idempotencia: t.clave });

  const orden = await rpc('contratar_servicio', {
    p_cliente: cliente,
    p_servicio: servicioDe.get(t.servicio),
    p_nota: t.nota ?? '',
    p_clave: t.clave,
    p_cotizacion_btc: COTIZACION,
  });
  if (!existe) nuevos.trabajos++;

  let estado = orden.estado;
  if (t.estado === 'cancelada') {
    if (estado === 'acordada') {
      await rpc('cancelar_orden', { p_orden: orden.id, p_actor: cliente, p_motivo: t.motivo });
    }
    return;
  }
  if (t.estado !== 'acordada' && estado === 'acordada') {
    await rpc('marcar_hecha', { p_orden: orden.id, p_actor: vendedor });
    estado = 'hecha';
  }
  if (t.estado === 'entregada' && estado === 'hecha') {
    await rpc('registrar_cobro_servicio', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `sembrar-${t.clave}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 10 * MINUTO_MS).toISOString(),
      p_cotizacion_btc: COTIZACION,
    });
    await rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });
  }
}

async function sembrarCotizacion(c, ids, servicioDe) {
  const cliente = ids[c.cliente];
  const titular = SERVICIOS.find((x) => x[2] === c.servicio);
  const existente = await unico('cotizaciones', 'id, estado', {
    cliente_id: cliente,
    servicio_id: servicioDe.get(c.servicio),
    descripcion_cliente: c.descripcion,
  });
  let cotizacion = existente;
  if (!cotizacion) {
    cotizacion = await rpc('solicitar_cotizacion', {
      p_cliente: cliente,
      p_servicio: servicioDe.get(c.servicio),
      p_descripcion: c.descripcion,
    });
    nuevos.cotizaciones++;
  }
  if (c.estado === 'ofrecida' && cotizacion.estado === 'solicitada') {
    await rpc('responder_cotizacion', {
      p_cotizacion: cotizacion.id,
      p_actor: ids[titular[0]],
      p_precio: c.precio,
      p_mensaje: c.mensaje,
    });
  }
}

async function sembrarPedido(p, ids, negocioDe, productoDe) {
  const comprador = ids[p.comprador];
  const vendedor = ids[p.tienda];
  const { data: existe, error } = await s
    .from('ordenes')
    .select('id')
    .eq('comprador_id', comprador)
    .eq('clave_idempotencia', p.clave)
    .maybeSingle();
  if (error) throw error;
  if (existe) return;

  const orden = await rpc('crear_orden', {
    p_comprador: comprador,
    p_negocio: negocioDe[p.tienda],
    p_lineas: p.lineas.map(([nombre, cantidad]) => ({
      producto_id: productoDe.get(`${negocioDe[p.tienda]}|${nombre}`),
      cantidad,
    })),
    p_modo: p.modo ?? 'recogida',
    p_clave: p.clave,
    p_cotizacion: COTIZACION,
  });
  nuevos.ordenes++;

  if (p.estado === 'esperando_pago') {
    // A day, not ten minutes, so the seeded request does not expire while someone looks at it.
    await rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `sembrar-${p.clave}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(ahora + DIA_MS).toISOString(),
    });
  } else {
    await rpc('registrar_cobro', {
      p_orden: orden.id,
      p_proveedor: 'falso',
      p_referencia: `sembrar-${p.clave}`,
      p_bolt11: null,
      p_destino: null,
      p_verificar_url: null,
      p_expira_en: new Date(Date.now() + 10 * MINUTO_MS).toISOString(),
    });
    await rpc('confirmar_pago', { p_orden: orden.id, p_actor: null });

    if (p.disputa) {
      await rpc('abrir_disputa', {
        p_orden: orden.id,
        p_actor: comprador,
        p_motivo: p.disputa,
        p_evidencia: 'Foto del empaque enviada por el chat.',
      });
    }

    if (['lista', 'entregada', 'cerrada'].includes(p.estado)) {
      await rpc('marcar_lista', { p_orden: orden.id, p_actor: vendedor });
    }

    if (['entregada', 'cerrada'].includes(p.estado)) {
      const { data: fresca, error: errorCodigo } = await s
        .from('ordenes')
        .select('codigo_entrega')
        .eq('id', orden.id)
        .single();
      if (errorCodigo) throw errorCodigo;
      const porVendedor = p.entrega === 'vendedor';
      await rpc('marcar_entregada', {
        p_orden: orden.id,
        p_actor: porVendedor ? vendedor : comprador,
        p_codigo: porVendedor ? fresca.codigo_entrega : null,
      });
    }

    if (p.resena) {
      await rpc('crear_resena', {
        p_orden: orden.id,
        p_actor: comprador,
        p_puntuacion: p.resena[0],
        p_comentario: p.resena[1],
      });
    }
  }

  for (const [autor, texto] of p.mensajes ?? []) {
    await rpc('enviar_mensaje', { p_orden: orden.id, p_actor: ids[autor], p_texto: texto });
  }
}

async function resumen(negocioDe, ids) {
  const tiendas = Object.values(negocioDe);

  const { count: usuarios } = await s
    .from('usuarios')
    .select('id', { count: 'exact', head: true })
    .in('telefono', USUARIOS.map((u) => `5037000000${u.numero}`));
  const { count: categorias } = await s.from('categorias').select('id', { count: 'exact', head: true });
  const { count: aprobados } = await s
    .from('negocios')
    .select('id', { count: 'exact', head: true })
    .in('id', tiendas)
    .eq('estado', 'aprobado');
  const { data: productos } = await s.from('productos').select('activo, stock').in('negocio_id', tiendas);
  const { data: sembradas } = await s.from('ordenes').select('id, estado, tipo').like('clave_idempotencia', 'sembrar-%');
  const ordenes = (sembradas ?? []).filter((o) => o.tipo === 'productos');
  const trabajos = (sembradas ?? []).filter((o) => o.tipo === 'servicio');
  const idsOrdenes = (sembradas ?? []).map((o) => o.id);
  const { count: mensajes } = await s
    .from('mensajes')
    .select('id', { count: 'exact', head: true })
    .in('orden_id', idsOrdenes);
  const { count: avisos } = await s
    .from('avisos')
    .select('id', { count: 'exact', head: true })
    .in('orden_id', idsOrdenes);

  const porEstado = {};
  for (const o of ordenes ?? []) porEstado[o.estado] = (porEstado[o.estado] ?? 0) + 1;

  console.log('Sembrado listo.');
  console.log(`  Usuarios de prueba: ${usuarios} (nuevos: ${nuevos.usuarios})`);
  console.log(`  Categorías: ${categorias}`);
  console.log(`  Negocios aprobados: ${aprobados} (nuevos: ${nuevos.negocios})`);
  console.log(
    `  Productos: ${productos?.length ?? 0}, activos: ${(productos ?? []).filter((p) => p.activo).length}, ` +
      `sin stock: ${(productos ?? []).filter((p) => p.stock === 0).length} (nuevos: ${nuevos.productos})`,
  );
  console.log(`  Órdenes: ${ordenes?.length ?? 0} (nuevas: ${nuevos.ordenes})`);
  console.log(`  Por estado: ${Object.entries(porEstado).map(([e, n]) => `${e} ${n}`).join(', ')}`);
  console.log(`  Mensajes: ${mensajes}, avisos: ${avisos}`);

  const { count: categoriasServicio } = await s.from('categorias_servicio').select('id', { count: 'exact', head: true });
  const { data: servicios } = await s.from('servicios').select('id, activo').in('negocio_id', tiendas);
  const { count: sinNegocio } = await s
    .from('negocios')
    .select('id', { count: 'exact', head: true })
    .in('usuario_id', [ids[6], ids[9]]);
  const { data: necesidades } = await s.from('necesidades').select('id, estado').in('usuario_id', [ids[6], ids[9]]);
  const idsNecesidades = (necesidades ?? []).map((n) => n.id);
  const { data: ofertas } = idsNecesidades.length
    ? await s.from('cotizaciones').select('id').in('necesidad_id', idsNecesidades)
    : { data: [] };
  const { data: cotizaciones } = await s
    .from('cotizaciones')
    .select('estado')
    .eq('cliente_id', ids[6])
    .not('servicio_id', 'is', null);

  const contar = (filas, campo) => {
    const cuenta = {};
    for (const f of filas ?? []) cuenta[f[campo]] = (cuenta[f[campo]] ?? 0) + 1;
    return Object.entries(cuenta).map(([e, n]) => `${e} ${n}`).join(', ') || 'ninguna';
  };

  console.log(`  Categorías de servicio: ${categoriasServicio}`);
  console.log(
    `  Servicios: ${servicios?.length ?? 0}, activos: ${(servicios ?? []).filter((x) => x.activo).length} ` +
      `(nuevos: ${nuevos.servicios})`,
  );
  console.log(
    `  Necesidades: ${necesidades?.length ?? 0}, abiertas: ${(necesidades ?? []).filter((n) => n.estado === 'abierta').length} ` +
      `(nuevas: ${nuevos.necesidades})`,
  );
  console.log(`  Ofertas en necesidades: ${ofertas?.length ?? 0} (nuevas: ${nuevos.ofertas})`);
  console.log(`  Cotizaciones de Lucía: ${contar(cotizaciones, 'estado')}`);
  console.log(`  Trabajos: ${trabajos.length} (nuevos: ${nuevos.trabajos}), por estado: ${contar(trabajos, 'estado')}`);
  console.log(`  Lucía y Diego con negocio: ${sinNegocio} (deben ser 0)`);
}

// Cacao Pay transfers, sent by Lucía (6) and Diego (9). Each one ends in the state named here. The fee
// and the recipient amount are worked out with integers, as the database does, so it accepts them.
const TARIFAS_PAY = {
  lightning: { fijo: 0, bps: 50 },
  cuenta: { fijo: 99, bps: 100 },
  efectivo: { fijo: 199, bps: 150 },
};
const TASA_EUR_USD = 1.08; // the same rate the migration stores in pay_tasas
const SATS_POR_USD = 100000000 / COTIZACION; // one BTC is 1e8 sats

// Fields: remitente (user number), nombre, contacto (phone or email), origen and destino (currencies),
// monto (cents of the origin currency), entrega, nota, estado (where it ends), motivo (for fallida).
// Sats transfers always start in USD.
const TRANSFERENCIAS = [
  { clave: 'sembrar-pay-01', remitente: 6, nombre: 'Mamá Marta', contacto: '+503 7712 3456', origen: 'USD', monto: 4000, destino: 'USD', entrega: 'efectivo', nota: 'Para las compras de la semana.', estado: 'creada' },
  { clave: 'sembrar-pay-02', remitente: 6, nombre: 'Tío Rubén', contacto: 'ruben@ejemplo.sv', origen: 'EUR', monto: 12000, destino: 'USD', entrega: 'cuenta', nota: 'Para pagar la luz de la casa.', estado: 'procesando' },
  { clave: 'sembrar-pay-03', remitente: 6, nombre: 'Abuela Chela', contacto: '+503 7788 9900', origen: 'USD', monto: 2500, destino: 'SATS', entrega: 'lightning', nota: '', estado: 'completada' },
  { clave: 'sembrar-pay-04', remitente: 6, nombre: 'Mamá Marta', contacto: '+503 7712 3456', origen: 'EUR', monto: 6000, destino: 'USD', entrega: 'efectivo', nota: 'Para la colegiatura.', estado: 'fallida', motivo: 'El punto de pago cerró antes de recibir el envío.' },
  { clave: 'sembrar-pay-05', remitente: 6, nombre: 'Tío Rubén', contacto: 'ruben@ejemplo.sv', origen: 'USD', monto: 1500, destino: 'USD', entrega: 'cuenta', nota: '', estado: 'cancelada' },
  { clave: 'sembrar-pay-06', remitente: 6, nombre: 'Abuela Chela', contacto: '+503 7788 9900', origen: 'USD', monto: 1000, destino: 'SATS', entrega: 'lightning', nota: 'Para la luz.', estado: 'completada' },
  { clave: 'sembrar-pay-07', remitente: 9, nombre: 'Rosa', contacto: '+503 7000 0002', origen: 'USD', monto: 500, destino: 'SATS', entrega: 'lightning', nota: 'Te pago la compra de la semana.', estado: 'completada' },
  { clave: 'sembrar-pay-08', remitente: 9, nombre: 'Hermano Luis', contacto: '+503 7600 1122', origen: 'EUR', monto: 3000, destino: 'USD', entrega: 'cuenta', nota: '', estado: 'creada' },
];

// The recipient amount in integers: BigInt with the rate scaled by 1e8, so no float can round it differently.
function calcularTransferencia(t) {
  const { fijo, bps } = TARIFAS_PAY[t.entrega];
  const comision = fijo + Math.floor((t.monto * bps + 9999) / 10000);
  const neto = t.monto - comision;
  const tasa = t.destino === 'SATS' ? SATS_POR_USD : t.origen === 'EUR' ? TASA_EUR_USD : 1;
  const escala = BigInt(Math.round(tasa * 1e8));
  const divisor = t.destino === 'SATS' ? 100n * 100000000n : 100000000n;
  return { comision, tasa, destino: Number((BigInt(neto) * escala) / divisor) };
}

// Creates one transfer and moves it to its state. Each step runs only when the transfer is not there yet,
// so a second run changes nothing.
async function sembrarTransferencia(t, ids) {
  const remitente = ids[t.remitente];
  const { comision, tasa, destino } = calcularTransferencia(t);
  const existe = await unico('pay_transferencias', 'id', { remitente_id: remitente, clave_idempotencia: t.clave });
  const fila = await rpc('pay_crear_transferencia', {
    p_remitente: remitente,
    p_destinatario_nombre: t.nombre,
    p_destinatario_contacto: t.contacto,
    p_moneda_origen: t.origen,
    p_monto_origen: t.monto,
    p_moneda_destino: t.destino,
    p_entrega: t.entrega,
    p_tasa: tasa,
    p_tasa_fuente: t.destino === 'SATS' ? 'Precio del BTC de demostración' : t.origen === 'EUR' ? 'Tasa fija de demostración' : 'Sin conversión',
    p_comision: comision,
    p_monto_destino: destino,
    p_nota: t.nota,
    p_clave: t.clave,
  });

  let estado = fila.estado;
  if (t.estado === 'cancelada') {
    if (estado === 'creada') await rpc('pay_cancelar', { p_transferencia: fila.id, p_actor: remitente });
    return !existe;
  }
  if (t.estado === 'creada') return !existe;
  if (estado === 'creada') {
    await rpc('pay_procesar', { p_transferencia: fila.id, p_actor: remitente });
    estado = 'procesando';
  }
  if (t.estado === 'completada' && estado === 'procesando') {
    await rpc('pay_completar', { p_transferencia: fila.id, p_actor: null });
  }
  if (t.estado === 'fallida' && estado === 'procesando') {
    await rpc('pay_fallar', { p_transferencia: fila.id, p_actor: null, p_motivo: t.motivo });
  }
  return !existe;
}

// Returns how many transfers this run created.
async function sembrarTransferencias(ids) {
  let nuevas = 0;
  for (const t of TRANSFERENCIAS) {
    if (await sembrarTransferencia(t, ids)) nuevas++;
  }
  return nuevas;
}

async function resumenPay(ids, nuevas) {
  const { data: filas, error } = await s
    .from('pay_transferencias')
    .select('estado, destinatario_id')
    .in('remitente_id', [ids[6], ids[9]])
    .like('clave_idempotencia', 'sembrar-pay-%');
  if (error) throw error;
  const cuenta = {};
  for (const f of filas) cuenta[f.estado] = (cuenta[f.estado] ?? 0) + 1;
  const porEstado = Object.entries(cuenta).map(([e, n]) => `${e} ${n}`).join(', ') || 'ninguna';
  console.log(`  Pay, transferencias: ${filas.length} (nuevas: ${nuevas}), por estado: ${porEstado}`);
  console.log(`  Pay, con destinatario registrado: ${filas.filter((f) => f.destinatario_id).length}`);
}

async function main() {
  const ids = await asegurarUsuarios();
  const categoriaDe = await asegurarCategorias();
  const categoriaServicioDe = await asegurarCategoriasServicio();
  const negocioDe = await asegurarTiendas(ids, ids[1]);
  const productoDe = await asegurarProductos(ids, negocioDe, categoriaDe);

  for (const p of PEDIDOS) {
    await sembrarPedido(p, ids, negocioDe, productoDe);
  }

  const servicioDe = await asegurarServicios(ids, negocioDe, categoriaServicioDe);
  const necesidadDe = await asegurarNecesidades(ids, categoriaServicioDe);
  await asegurarOfertas(ids, negocioDe, necesidadDe);
  for (const t of TRABAJOS) {
    await sembrarTrabajo(t, ids, servicioDe);
  }
  for (const c of COTIZACIONES) {
    await sembrarCotizacion(c, ids, servicioDe);
  }

  const nuevasPay = await sembrarTransferencias(ids);

  await resumen(negocioDe, ids);
  await resumenPay(ids, nuevasPay);
}

main().catch((error) => {
  console.error('El sembrado falló:', error.message);
  process.exit(1);
});
