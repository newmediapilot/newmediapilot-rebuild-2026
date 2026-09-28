import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const uploads = fileURLToPath(new URL('./public/uploads', import.meta.url))

/**
 * Exposes the gallery filenames in public/uploads as a plain array.
 *
 * The page needs the list of filenames, not the images themselves, and it cannot
 * get that from `import.meta.glob`: any glob pattern that matches a .png makes
 * Vite treat it as an importable asset and re-emit all 54 MB into /_astro under
 * content hashes, duplicating what public/ already serves at a stable URL.
 *
 * Resolving the list here keeps the assets untouched, and this file is read from
 * disk rather than bundled, so import.meta.url still points at the real path.
 */
const galleryShots = {
  name: 'nmp-gallery-shots',
  resolveId: (id) => (id === 'virtual:nmp-gallery-shots' ? '\0virtual:nmp-gallery-shots' : null),
  load(id) {
    if (id !== '\0virtual:nmp-gallery-shots') return null
    let files
    try {
      files = readdirSync(uploads)
    } catch {
      files = []
    }
    return `export default ${JSON.stringify(files)}`
  },
}

export default defineConfig({
  output: 'static',
  build: {
    format: 'file',
  },
  vite: {
    plugins: [galleryShots, tailwindcss()],
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
