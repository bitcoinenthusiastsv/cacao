import type { Metadata } from 'next';
import { Suspense } from 'react';

import { cotizacionSegura } from '@/servidor/catalogo';
import { categorias } from '@/servidor/productos';
import { exigirVendedor } from '@/servidor/sesion';

import { AvisoNegocio } from '../_componentes/AvisoNegocio';
import { FormularioProducto } from '../_componentes/FormularioProducto';
import estilos from '../estilos.module.css';

export const metadata: Metadata = { title: 'Agregar producto' };

export default function NuevoProducto() {
  return (
    <Suspense fallback={<p role="status">Cargando el formulario…</p>}>
      <FormularioNuevo />
    </Suspense>
  );
}

async function FormularioNuevo() {
  const sesion = await exigirVendedor('/mi-negocio/productos/nuevo');
  const [listaCategorias, cotizacion] = await Promise.all([categorias(), cotizacionSegura()]);

  return (
    <>
      <section className={estilos.cabecera}>
        <h1>Agregar producto</h1>
      </section>

      <AvisoNegocio estado={sesion.negocio.estado} />

      <FormularioProducto
        categorias={listaCategorias}
        cotizacion={cotizacion}
        inicial={{
          id: null,
          nombre: '',
          descripcion: '',
          unidad: '',
          categoriaId: null,
          precio: '',
          stock: '',
          activo: true,
          fotos: [],
        }}
      />
    </>
  );
}
