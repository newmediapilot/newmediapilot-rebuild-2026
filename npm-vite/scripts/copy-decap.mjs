import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.resolve(here, '..')
const repo = path.resolve(pkg, '..')

const candidate = [
  path.join(repo, 'node_modules', 'decap-cms', 'dist'),
  path.join(pkg, 'node_modules', 'decap-cms', 'dist'),
].find((d) => fs.existsSync(d))

if (!candidate) {
  console.error('decap-cms is not installed (npm install)')
  process.exit(1)
}

const admin = path.join(pkg, 'public', 'admin')
fs.mkdirSync(admin, { recursive: true })

for (const file of fs.readdirSync(candidate)) {
  if (file.endsWith('.map') || file.endsWith('.LICENSE.txt')) continue
  if (file === 'cms.js') continue
  if (file.endsWith('.cms.js') && !file.endsWith('.decap-cms.js')) continue
  fs.copyFileSync(path.join(candidate, file), path.join(admin, file))
}

console.log('Decap assets copied to', admin)