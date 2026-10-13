import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

export const CATEGORIAS = ['Volcanes', 'Playa', 'Naturaleza', 'Café', 'Pueblos', 'Comida', 'Ciudad'] as const;
export const ZONAS = ['Occidente', 'Centro', 'Oriente'] as const;
export const DIAS_SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const;

const tours = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tours' }),
  schema: z.object({
    titulo: z.string(),
    bajada: z.string(),
    lugar: z.string(),
    categoria: z.enum(CATEGORIAS),
    zona: z.enum(ZONAS),
    coords: z.string().optional(),
    /** Human readable: "4 horas", "Día completo". */
    duracion: z.string(),
    nivel: z.enum(['Fácil', 'Moderado', 'Exigente']),
    /** Human readable group size: "2 a 8 personas". */
    grupo: z.string(),
    /** Weekdays the experience runs. */
    salidas: z.array(z.enum(DIAS_SEMANA)).min(1).default([...DIAS_SEMANA]),
    /** Per person, in satoshis. */
    precio: z.number().int().positive(),
    incluye: z.array(z.string()),
    llevar: z.array(z.string()).default([]),
    portada: z.string(),
    alt: z.string(),
    /** Where the cover photo was really taken, only when it is not the tour's own place. */
    lugarFoto: z.string().optional(),
    credito: z.string().optional(),
    licencia: z.string().optional(),
    creditoUrl: z.url().optional(),
    /** Slugs of the Cacao Media stories about this place or activity. */
    historias: z.array(z.string()).default([]),
  }),
});

export const collections = { tours };
