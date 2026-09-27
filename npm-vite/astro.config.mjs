import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  output: 'static',
  build: {
    format: 'file',
  },
  vite: {
    plugins: [tailwindcss()],
    // The deploy scripts and the form endpoint both live in the repo root .env,
    // which sits one level above this package.
    //
    // This must live under `vite`, not at the top level: Astro 7 reads
    //   loadEnv(mode, config.vite.envDir ?? fileURLToPath(config.root), '')
    // so a top-level `envDir` is ignored and every PUBLIC_ var silently builds
    // as empty. Resolved from this file's own URL so it cannot drift with cwd.
    envDir: repoRoot,
  },
})