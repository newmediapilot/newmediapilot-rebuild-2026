/// <reference types="astro/client" />

/** Filenames found in public/uploads, provided by the plugin in astro.config.mjs. */
declare module 'virtual:nmp-gallery-shots' {
  const files: string[]
  export default files
}