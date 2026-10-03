import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'
import { SURFACE_NAMES } from './data/surfaces'

const tiles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tiles' }),
  schema: z.object({
    title: z.string(),
    image: z.string().optional(),
    source: z.string().optional(),
  }),
})

/**
 * The Recent Work panels.
 *
 * `order` is the only thing that decides position on the page, so moving a card
 * is a matter of editing one integer. `surface` is validated against the shared
 * table rather than being a free string, which means a typo fails the build
 * instead of painting a card gray.
 *
 * `gallery` is an explicit list of paths rather than a filename convention. That
 * is what lets a card be renamed or moved without also renaming 5 images on disk,
 * and it means a card with no gallery is a deliberate choice instead of a key
 * that happens to match nothing.
 */
const cards = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cards' }),
  schema: z.object({
    title: z.string(),
    order: z.number().int(),
    blurb: z.string(),
    surface: z.enum(SURFACE_NAMES),
    image: z.string(),
    gallery: z.array(z.string()).default([]),
    website: z.string().url().optional(),
  }),
})

export const collections = { tiles, cards }
