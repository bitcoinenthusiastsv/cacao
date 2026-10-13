import 'server-only';

import type { EstadoEnvio } from '@/lib/transferencias';

import { desdeError, exito, fallo, type Resultado } from './resultado';
import { clienteServicio } from './supabase';
import { tarifas, tarifasDetalle, tasasDeCambio, type TarifaDetalle, type TasaDeCambio } from './tasas';
import {
  aEnvio,
  COLUMNAS_ENVIO,
  esAdministrador,
  paginaValida,
  POR_PAGINA,
  type FilaEnvio,
  type PaginaEnvios,
} from './transferencias';

// Admin views. Each function checks the administrator flag in the database before it reads.

export type ResumenEstado = {
  estado: EstadoEnvio;
  cantidad: number;
  montoOrigenUsdCentavos: number;
  comisionUsdCentavos: number;
};

export type PasoEmbudo = {
  nombre: string;
  etiqueta: string;
  orden: number;
  sesiones: number;
  eventos: number;
  valorUsdCentavos: number;
};

async function exigirAdmin(actorId: string): Promise<Resultado<null>> {
  try {
    if (!(await esAdministrador(actorId))) {
      return fallo('NO_PERMITIDO', 'Solo un administrador puede ver esta información.');
    }
    return exito(null);
  } catch (error) {
    return desdeError(error);
  }
}

function fechasValidas(desde: Date, hasta: Date): boolean {
  return !Number.isNaN(desde.getTime()) && !Number.isNaN(hasta.getTime()) && desde < hasta;
}

/** Every transfer, newest first, optionally in one state. Contacts are masked. */
export async function todosLosEnvios(
  actorId: string,
  opciones: { estado?: EstadoEnvio; pagina?: number } = {},
): Promise<Resultado<PaginaEnvios>> {
  const acceso = await exigirAdmin(actorId);
  if (!acceso.ok) return acceso;
  try {
    const pagina = paginaValida(opciones.pagina);
    const desde = (pagina - 1) * POR_PAGINA;
    let consulta = clienteServicio()
      .from('pay_transferencias')
      .select(COLUMNAS_ENVIO, { count: 'exact' });
    if (opciones.estado) consulta = consulta.eq('estado', opciones.estado);
    const { data, error, count } = await consulta
      .order('creada_en', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + POR_PAGINA - 1);
    if (error) throw new Error(`No pudimos leer los envíos: ${error.message}`);

    const tarifasLeidas = await tarifas();
    const filas = (data ?? []) as unknown as FilaEnvio[];
    return exito({
      envios: filas.map((f) => aEnvio(f, tarifasLeidas)),
      total: count ?? 0,
      pagina,
      porPagina: POR_PAGINA,
    });
  } catch (error) {
    return desdeError(error);
  }
}

/** Transfers created in [desde, hasta), per state, with the amounts in US cents. */
export async function resumenEnvios(actorId: string, desde: Date, hasta: Date): Promise<Resultado<ResumenEstado[]>> {
  const acceso = await exigirAdmin(actorId);
  if (!acceso.ok) return acceso;
  if (!fechasValidas(desde, hasta)) return fallo('DATOS_INVALIDOS', 'La fecha de inicio tiene que ser anterior a la de fin.');
  try {
    const { data, error } = await clienteServicio().rpc('pay_resumen', {
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
    });
    if (error) return desdeError(error);
    return exito(
      (data ?? []).map((f) => ({
        estado: f.estado,
        cantidad: Number(f.cantidad),
        montoOrigenUsdCentavos: Number(f.monto_origen_usd_centavos),
        comisionUsdCentavos: Number(f.comision_usd_centavos),
      })),
    );
  } catch (error) {
    return desdeError(error);
  }
}

/** The Cacao Pay funnel for the period, in funnel order. */
export async function embudoPay(actorId: string, desde: Date, hasta: Date): Promise<Resultado<PasoEmbudo[]>> {
  const acceso = await exigirAdmin(actorId);
  if (!acceso.ok) return acceso;
  if (!fechasValidas(desde, hasta)) return fallo('DATOS_INVALIDOS', 'La fecha de inicio tiene que ser anterior a la de fin.');
  try {
    const { data, error } = await clienteServicio().rpc('embudo', {
      p_sitio: 'pay',
      p_desde: desde.toISOString(),
      p_hasta: hasta.toISOString(),
    });
    if (error) return desdeError(error);
    return exito(
      (data ?? []).map((p) => ({
        nombre: p.nombre,
        etiqueta: p.etiqueta,
        orden: p.orden,
        sesiones: Number(p.sesiones),
        eventos: Number(p.eventos),
        valorUsdCentavos: Number(p.valor_usd_centavos),
      })),
    );
  } catch (error) {
    return desdeError(error);
  }
}

/** The fee table and the stored rates, as the database has them. */
export async function tarifasYTasas(
  actorId: string,
): Promise<Resultado<{ tarifas: TarifaDetalle[]; tasas: TasaDeCambio[] }>> {
  const acceso = await exigirAdmin(actorId);
  if (!acceso.ok) return acceso;
  try {
    return exito({ tarifas: await tarifasDetalle(), tasas: await tasasDeCambio() });
  } catch (error) {
    return desdeError(error);
  }
}
