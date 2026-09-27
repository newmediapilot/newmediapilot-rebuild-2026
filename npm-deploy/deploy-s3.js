import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import fs from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { globSync } from 'glob'
import dotenv from 'dotenv'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const REGION = process.env.AWS_REGION || 'us-east-1'
const DIST = fileURLToPath(new URL('../npm-vite/dist', import.meta.url))
const CONCURRENCY = 8

const client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: process.env.NMP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NMP_AWS_SECRET_ACCESS_KEY
    }
})

const bucket = process.env.AMAZON_S3_BUCKET

const CONTENT_TYPES = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'application/javascript; charset=utf-8',
    mjs: 'application/javascript; charset=utf-8',
    json: 'application/json',
    map: 'application/json',
    xml: 'application/xml',
    wasm: 'application/wasm',
    yml: 'text/yaml; charset=utf-8',
    yaml: 'text/yaml; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    apng: 'image/apng',
    ico: 'image/x-icon',
    mp4: 'video/mp4',
    webm: 'video/webm',
    pdf: 'application/pdf',
    zip: 'application/zip',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf'
}

const getContentType = (key) => {
    const extension = key.split('.').pop().toLowerCase()
    return CONTENT_TYPES[extension] || 'application/octet-stream'
}

// Hashed build output can be cached forever. HTML must not be cached at all, or
// a deploy silently fails to show up. Everything else is unhashed (uploads, admin
// assets), so a long max-age would pin stale content.
const getCacheControl = (key) => {
    if (getContentType(key).startsWith('text/html')) return 'no-cache, no-store, must-revalidate'
    if (key.startsWith('_astro/')) return 'public, max-age=31536000, immutable'
    return 'public, max-age=3600'
}

const files = globSync('**/*', { cwd: DIST, nodir: true })

let uploaded = 0
const failures = []

const upload = async (key) => {
    const body = fs.readFileSync(join(DIST, key))
    try {
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: body,
                ContentType: getContentType(key),
                CacheControl: getCacheControl(key)
            })
        )
        uploaded++
        if (uploaded % 25 === 0) console.log(`  ${uploaded}/${files.length}`)
    } catch (err) {
        failures.push({ key, message: err.message })
    }
}

const run = async () => {
    if (!bucket) {
        console.error('AMAZON_S3_BUCKET is not set in .env')
        process.exit(1)
    }
    if (!fs.existsSync(new URL('index.html', DIST))) {
        console.error('No build found at npm-vite/dist. Run `npm run build` first.')
        process.exit(1)
    }

    console.log(`Uploading ${files.length} files to s3://${bucket}`)

    const queue = files.slice()
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0) {
            await upload(queue.shift())
        }
    })

    await Promise.all(workers)

    console.log(`Uploaded ${uploaded} file(s)`)

    if (failures.length > 0) {
        console.error(`\n${failures.length} upload(s) failed:`)
        for (const failure of failures) console.error(`  ${failure.key}: ${failure.message}`)
        process.exit(1)
    }
}

run().catch((err) => {
    console.error('Deploy failed:', err)
    process.exit(1)
})
