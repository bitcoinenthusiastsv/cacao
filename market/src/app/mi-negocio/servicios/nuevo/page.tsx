import type { Metadata } from 'next';
import { Suspense } from 'react';

import { cotizacionSegura } from '@/servidor/catalogo';
import { categoriasServicio } from '@/servidor/servicios';
import { exigirVendedor } from '@/servidor/sesion';

import { FormularioServicio } from '../_componentes/FormularioServicio';
import { motivoSinPublicar } from '../_componentes/AvisoServicios';
import estilos from '../estilos.module.css';

export const metadata: Metadata = { title: 'Agregar servicio' };

export default function NuevoServicio() {
  return (
    <Suspense fallback={<p role="status">Cargando el formulario…</p>}>
      <FormularioNuevo />
    </Suspense>
  );
}

async function FormularioNuevo() {
  const sesion = await exigirVendedor('/mi-negocio/servicios/nuevo');
  const [listaCategorias, cotizacion] = await Promise.all([categoriasServicio(), cotizacionSegura()]);

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Agregar servicio</h1>
      </section>

      <FormularioServicio
        categorias={listaCategorias}
        cotizacion={cotizacion}
        motivo={motivoSinPublicar(sesion.negocio.estado)}
        inicial={{
          id: null,
          categoriaId: null,
          titulo: '',
          descripcion: '',
          zona: '',
          tipoPrecio: 'fijo',
          precio: '',
          unidad: '',
          activo: true,
          fotos: [],
        }}
      />
    </>
  );
}
