import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const historias = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/historias' }),
  schema: z.object({
    titulo: z.string(),
    bajada: z.string(),
    seccion: z.enum(['cronica', 'guia', 'cultura', 'cafe']),
    fecha: z.coerce.date(),
    autor: z.string(),
    lugar: z.string(),
    coords: z.string().optional(),
    minutos: z.number().int().positive(),
    /** In satoshis. */
    precio: z.number().int().nonnegative().default(120),
    portada: z.string(),
    alt: z.string(),
    credito: z.string().optional(),
    licencia: z.string().optional(),
    /** Where the cover photo was really taken, only when it is not the story's own place. */
    lugarFoto: z.string().optional(),
    creditoUrl: z.url().optional(),
    tags: z.array(z.string()).default([]),
    gratis: z.boolean().default(false),
  }),
});

export const collections = { historias };
