/**
 * Every background a card can carry, in one table.
 *
 * There are two kinds of surface and they are picked the same way. A card stores
 * only the surface name; this module decides whether that name resolves to a
 * three-stop gradient or to a stripe texture class. That is the point -- before
 * this, textures were a hardcoded exception list that had to be kept in sync with
 * the gradient table by hand, and forgetting an entry silently painted stripes
 * over a gradient.
 *
 * Adding a surface: add it here, and it appears in the CMS picker automatically.
 * The picker is generated from SURFACE_OPTIONS, so there is no second list to
 * update.
 */

export type SurfaceKind = 'gradient' | 'texture'

export interface GradientSurface {
  kind: 'gradient'
  label: string
  /** CSS gradient direction: an angle, or a keyword such as `to top`. */
  angle: string
  top: string
  mid: string
  bottom: string
}

export interface TextureSurface {
  kind: 'texture'
  label: string
  /** One or more classes from global.css that paint the texture themselves. */
  className: string
}

export type Surface = GradientSurface | TextureSurface

/**
 * Names read as hue family rather than project, so a surface can be shared by
 * more than one card. Each one was lifted from the card that previously carried
 * it, so applying them reproduces the current design exactly.
 */
export const SURFACES = {
  // Textures. These used to be a hardcoded exception list; now they are just
  // surfaces, so a card can be switched to one without any code change.
  'rust-stripes': { kind: 'texture', label: 'Rust stripes', className: 'stripes-rust' },
  'blue-stripes': { kind: 'texture', label: 'Blue stripes', className: 'stripes-panel stripes-blue' },
  'green-stripes': { kind: 'texture', label: 'Green stripes', className: 'stripes-panel stripes-green' },

  // Portfolio card gradients.
  harbor: { kind: 'gradient', label: 'Harbour', angle: '145deg', top: '#1b3a4b', mid: '#16404a', bottom: '#0b1a24' },
  plum: { kind: 'gradient', label: 'Plum', angle: '115deg', top: '#3d1636', mid: '#2a1a3a', bottom: '#1a0b1c' },
  clay: { kind: 'gradient', label: 'Clay', angle: '160deg', top: '#43301a', mid: '#2a331a', bottom: '#1d1409' },
  jade: { kind: 'gradient', label: 'Jade', angle: '125deg', top: '#123a34', mid: '#123a20', bottom: '#07191a' },
  crimson: { kind: 'gradient', label: 'Crimson', angle: '100deg', top: '#3a1420', mid: '#2a1a2a', bottom: '#180810' },
  lagoon: { kind: 'gradient', label: 'Lagoon', angle: '150deg', top: '#16303f', mid: '#1a3020', bottom: '#091820' },
  fern: { kind: 'gradient', label: 'Fern', angle: '135deg', top: '#1c3320', mid: '#1c2a3a', bottom: '#0a1710' },
  bronze: { kind: 'gradient', label: 'Bronze', angle: '95deg', top: '#3b2a10', mid: '#332a1a', bottom: '#1a1206' },
  indigo: { kind: 'gradient', label: 'Indigo', angle: '170deg', top: '#231a44', mid: '#1a2a3a', bottom: '#0f0b20' },
  amethyst: { kind: 'gradient', label: 'Amethyst', angle: '120deg', top: '#3b2450', mid: '#3a2020', bottom: '#1b0f26' },
  slate: { kind: 'gradient', label: 'Slate', angle: '140deg', top: '#1a2440', mid: '#1a2a3a', bottom: '#0a0f1d' },

  // Static card and skill-group gradients.
  'header-warm': { kind: 'gradient', label: 'Header warm', angle: 'to top', top: '#4a1f0a', mid: '#33190d', bottom: '#160a05' },
  'skills-orchid': { kind: 'gradient', label: 'Skills orchid', angle: 'to top', top: '#241640', mid: '#6b2a12', bottom: '#3a1608' },
  // Diagonal rather than `to top`, so the tools card reads as a distinct block
  // next to Recent Websites instead of two flat panels stacked.
  
  'ai-teal': { kind: 'gradient', label: 'AI teal', angle: 'to top', top: '#0d3540', mid: '#123a2a', bottom: '#071a1f' },
  'front-end': { kind: 'gradient', label: 'Front-end', angle: 'to top', top: '#2a1c56', mid: '#1c2a3a', bottom: '#180f33' },
  'back-end': { kind: 'gradient', label: 'Back-end', angle: 'to top', top: '#4a2418', mid: '#3a1c2a', bottom: '#2a120b' },
  databases: { kind: 'gradient', label: 'Databases', angle: 'to top', top: '#4a3410', mid: '#2a3418', bottom: '#2a1d08' },
  cloud: { kind: 'gradient', label: 'Cloud', angle: 'to top', top: '#1d2b3c', mid: '#16283a', bottom: '#101823' },
  build: { kind: 'gradient', label: 'Build', angle: 'to top', top: '#33400f', mid: '#2a2a1a', bottom: '#1c2408' },
  'accessibility': { kind: 'gradient', label: 'Accessibility', angle: 'to top', top: '#4c1a28', mid: '#2a1a3a', bottom: '#2b0d15' },
  'brands-rust': { kind: 'gradient', label: 'Brands rust', angle: 'to top', top: '#54240f', mid: '#301309', bottom: '#1a0a05' },
  aubergine: { kind: 'gradient', label: 'Aubergine', angle: 'to top', top: '#241640', mid: '#161620', bottom: '#0c0c14' },
  'credits-warm': { kind: 'gradient', label: 'Credits warm', angle: 'to top', top: '#2a1c1c', mid: '#1a1618', bottom: '#0c0809' },
} as const satisfies Record<string, Surface>

export type SurfaceName = keyof typeof SURFACES

export const SURFACE_NAMES = Object.keys(SURFACES) as SurfaceName[]

export function getSurface(name: string): Surface {
  const surface = SURFACES[name as SurfaceName]
  if (!surface) {
    throw new Error(`Unknown surface "${name}". Add it to src/data/surfaces.ts.`)
  }
  return surface
}

/**
 * The inline style a gradient card needs. Textures return undefined because they
 * are painted entirely by their class, and giving a texture card a gradient style
 * would set --grad-* values that nothing reads.
 */
export function surfaceStyle(name: string): string | undefined {
  const surface = getSurface(name)
  if (surface.kind !== 'gradient') return undefined
  return `--grad-angle:${surface.angle};--grad-top:${surface.top};--grad-mid:${surface.mid};--grad-bottom:${surface.bottom}`
}

/** Texture classes to append, or an empty string for gradients. */
export function surfaceClass(name: string): string {
  const surface = getSurface(name)
  return surface.kind === 'texture' ? surface.className : ''
}

/**
 * Marks which of the two painting layers a card opts into. The shared blob
 * gradient is scoped to `[data-surface-kind='gradient']`, so a texture card is
 * excluded by not matching rather than by being overridden -- which is why
 * nothing has to fight an `!important` to keep its stripes.
 */
export function surfaceAttrs(name: string): Record<string, string> {
  const surface = getSurface(name)
  const textureClass = surfaceClass(name)
  return {
    'data-surface': name,
    'data-surface-kind': surface.kind,
    ...(textureClass ? { 'data-surface-class': textureClass } : {}),
    style: surfaceStyle(name),
  }
}

/**
 * Option list for the CMS surface picker, grouped by kind. The CMS generates the
 * dropdown from this, so a new surface needs no config.yml edit.
 */
export const SURFACE_OPTIONS = [
  { label: '— Gradients —', value: '' },
  ...SURFACE_NAMES.filter((name) => SURFACES[name].kind === 'gradient').map((name) => ({
    label: SURFACES[name].label,
    value: name,
  })),
  { label: '— Textures —', value: 'none' },
  ...SURFACE_NAMES.filter((name) => SURFACES[name].kind === 'texture').map((name) => ({
    label: SURFACES[name].label,
    value: name,
  })),
]
