import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  output: 'static',
  devToolbar: {
    // Dev-only overlay (inspector, audit warnings, logger). It is injected into
    // the page and rendered by the browser, so it has no place in a production
    // build, and it can obscure the layout while working on the page itself.
    enabled: false,
  },
  build: {
    format: 'file',
  },
  vite: {
    // The gallery used to be discovered by globbing public/uploads for
    // image-preview-<key>-<n>.png, which needed this virtual module. It is an
    // explicit `gallery` list on each card in src/content/cards now, so the glob
    // and this plugin are both gone -- as is the reason the old one existed, since
    // Vite was re-emitting 54 MB of gallery PNGs into /_astro under content hashes.
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
