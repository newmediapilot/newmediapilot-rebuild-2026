import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const tiles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/tiles' }),
  schema: z.object({
    title: z.string(),
    image: z.string().optional(),
  }),
})

export const collections = { tiles }