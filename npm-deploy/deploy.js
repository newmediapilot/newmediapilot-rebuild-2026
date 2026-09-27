import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dist = resolve(root, 'npm-vite', 'dist')

function loadEnv() {
  const file = resolve(root, '.env')
  if (!existsSync(file)) {
    console.error('No .env found at repo root. Cannot resolve AWS config.')
    process.exit(1)
  }
  const env = {}
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const at = trimmed.indexOf('=')
    if (at === -1) continue
    env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1).trim()
  }
  return env
}

const env = loadEnv()

const region = env.AWS_REGION || 'us-east-1'
const bucket = env.AWS_BUCKET_ID
const distribution = env.AWS_CLOUDFRONT_ID

const awsEnv = {
  ...process.env,
  AWS_ACCESS_KEY_ID: env.AWS_ACCESS_KEY,
  AWS_SECRET_ACCESS_KEY: env.AWS_SECRET_KEY,
  AWS_DEFAULT_REGION: region
}

if (!bucket) {
  console.error('AWS_BUCKET_ID is not set in .env')
  process.exit(1)
}

function aws(args, label) {
  if (label) console.log(`\n> ${label}`)
  const result = spawnSync('aws', args, { env: awsEnv, stdio: 'inherit', shell: false })
  if (result.error) {
    console.error(`aws ${args[0]} failed to launch: ${result.error.message}`)
    process.exit(1)
  }
  if (result.status !== 0) {
    console.error(`aws ${args[0]} exited with code ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

function requireBuild() {
  if (!existsSync(resolve(dist, 'index.html'))) {
    console.error('No build found at npm-vite/dist. Run `npm run build` from the repo root first.')
    process.exit(1)
  }
}

function deployS3() {
  requireBuild()
  aws(['s3', 'sync', dist, `s3://${bucket}`, '--delete', '--region', region], `Syncing npm-vite/dist -> s3://${bucket}`)

  // Hashed build assets are immutable, so let browsers and CloudFront keep them.
  aws(
    ['s3', 'sync', resolve(dist, '_astro'), `s3://${bucket}/_astro`,
      '--cache-control', 'public, max-age=31536000, immutable',
      '--metadata-directive', 'REPLACE', '--region', region],
    'Caching hashed _astro assets (1 year, immutable)'
  )

  // HTML must never be stale, or a deploy silently does nothing.
  aws(
    ['s3', 'cp', resolve(dist, 'index.html'), `s3://${bucket}/index.html`,
      '--cache-control', 'no-cache, no-store, must-revalidate',
      '--content-type', 'text/html; charset=utf-8',
      '--metadata-directive', 'REPLACE', '--region', region],
    'Un-caching index.html'
  )
}

function invalidateCloudFront() {
  if (!distribution) {
    console.error('AWS_CLOUDFRONT_ID is not set in .env')
    process.exit(1)
  }
  aws(
    ['cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*'],
    `Invalidating CloudFront ${distribution}`
  )
}

const target = process.argv[2] || 'all'

if (target === 's3') {
  deployS3()
} else if (target === 'cloudfront') {
  invalidateCloudFront()
} else if (target === 'all') {
  deployS3()
  invalidateCloudFront()
} else {
  console.error(`Unknown target "${target}". Use s3, cloudfront, or all.`)
  process.exit(1)
}

console.log('\nDone.')
