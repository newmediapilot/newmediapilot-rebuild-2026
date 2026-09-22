import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkg = path.resolve(here, '..')
const repo = path.resolve(pkg, '..')

const findBin = (name) => {
  for (const dir of [path.join(repo, 'node_modules', '.bin'), path.join(pkg, 'node_modules', '.bin')]) {
    const p = path.join(dir, name + (process.platform === 'win32' ? '.cmd' : ''))
    if (fs.existsSync(p)) return p
  }
  throw new Error(`cannot find "${name}" binary — run npm install first`)
}

const kids = []
const run = (name, args) => {
  const child = spawn(findBin(name), args, {
    cwd: pkg,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, GIT_REPO_DIRECTORY: repo },
  })
  kids.push(child)
  return child
}

console.log('starting astro dev  -> http://localhost:4321')
console.log('starting decap-server -> http://localhost:8081 (used by /admin local_backend)')

run('astro', ['dev', '--host'])
run('decap-server', [])

const stop = () => {
  for (const c of kids) {
    try {
      c.kill()
    } catch {}
  }
}
process.on('SIGINT', () => {
  stop()
  process.exit(0)
})
process.on('SIGTERM', () => {
  stop()
  process.exit(0)
})
for (const c of kids) {
  c.on('exit', () => {
    stop()
    process.exit(0)
  })
}