import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  output: 'static',
  // The deploy scripts and the form endpoint both live in the repo root .env,
  // which sits one level above this package.
  envDir: '..',
  build: {
    format: 'file',
  },
  vite: {
    plugins: [tailwindcss()],
  },
})