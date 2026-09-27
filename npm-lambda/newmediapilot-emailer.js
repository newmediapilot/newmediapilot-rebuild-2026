import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import crypto from 'node:crypto'

// The deploy script derives the function name from this filename:
//   npm-lambda/newmediapilot-emailer.js  ->  newmediapilot-emailer

const REGION = process.env.AWS_REGION || 'us-east-1'
const TO = process.env.CONTACT_TO || 'marcin@newmediapilot.com'
const FROM = process.env.CONTACT_FROM || TO

const ALLOWED_ORIGINS = (
    process.env.ALLOWED_ORIGINS ||
    'https://newmediapilot.com,https://www.newmediapilot.com,http://localhost:4321,http://127.0.0.1:4321'
)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

const LIMITS = { name: 100, email: 254, number: 25, message: 5000 }
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Shared header the browser must present. NOTE: this ships in the page source,
// so it only deters naive copy-paste, not a determined caller.
const TOKEN_HEADER = 'x-nmp-form-token'
const FORM_TOKEN = process.env.FORM_TOKEN || ''

if (!FORM_TOKEN) {
    console.error('FORM_TOKEN is not set on the function; every submission will be rejected')
}

const ses = new SESClient({ region: REGION })

const oneLine = (value) => (typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim() : '')

// Never echo a raw header into logs: a newline in Origin would forge log lines.
const safeLog = (value) => oneLine(value).slice(0, 120)

const clip = (value, max) => (value.length > max ? value.slice(0, max) : value)

const escapeHtml = (value) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')

const headerValue = (headers, key) => {
    if (!headers) return undefined
    const target = key.toLowerCase()
    for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === target) return headers[name]
    }
    return undefined
}

const methodOf = (event) => {
    // Lambda Function URLs use payload format 2.0; API Gateway v1 uses httpMethod.
    return (event?.requestContext?.http?.method || event?.httpMethod || 'POST').toUpperCase()
}

// Constant-time compare so a wrong token cannot be recovered byte by byte.
const tokensMatch = (provided) => {
    if (!FORM_TOKEN) return false
    const a = Buffer.from(oneLine(provided))
    const b = Buffer.from(FORM_TOKEN)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}

const cors = (origin) =>
    ALLOWED_ORIGINS.includes(origin)
        ? {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Headers': `content-type, ${TOKEN_HEADER}`,
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              Vary: 'Origin'
          }
        : {}

const respond = (statusCode, body, headers) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
})

export const handler = async (event = {}) => {
    const origin = headerValue(event.headers, 'origin') || ''
    const headers = cors(origin)

    if (methodOf(event) === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' }
    }

    if (methodOf(event) !== 'POST') {
        return respond(405, { ok: false, error: 'Method not allowed' }, headers)
    }

    // CORS is not authentication, but a browser will never omit Origin, so a
    // missing or unlisted Origin means a non-browser client. SES quota is the
    // real backstop here.
    if (!ALLOWED_ORIGINS.includes(origin)) {
        console.warn('Rejected contact submission from origin:', safeLog(origin) || 'none')
        return respond(403, { ok: false, error: 'Forbidden' }, headers)
    }

    if (!tokensMatch(headerValue(event.headers, TOKEN_HEADER))) {
        console.warn('Rejected contact submission with a bad or missing form token')
        return respond(403, { ok: false, error: 'Forbidden' }, headers)
    }

    let payload = {}
    try {
        const raw = event.isBase64Encoded
            ? Buffer.from(event.body || '', 'base64').toString('utf8')
            : event.body || '{}'
        payload = JSON.parse(raw)
    } catch (err) {
        return respond(400, { ok: false, error: 'Invalid JSON body' }, headers)
    }

    if (!payload || typeof payload !== 'object') {
        return respond(400, { ok: false, error: 'Invalid payload' }, headers)
    }

    // Honeypot: hidden from humans, so answer as if it worked.
    if (oneLine(payload.website)) {
        console.log('Contact submission discarded by honeypot')
        return respond(200, { ok: true }, headers)
    }

    const name = clip(oneLine(payload.name), LIMITS.name)
    const email = clip(oneLine(payload.email), LIMITS.email)
    const number = clip(oneLine(payload.number), LIMITS.number)
    const message = clip(typeof payload.message === 'string' ? payload.message.trim() : '', LIMITS.message)

    const errors = []
    if (!name) errors.push('name is required')
    if (!email) errors.push('email is required')
    else if (!EMAIL_PATTERN.test(email)) errors.push('email is not valid')
    if (!message) errors.push('message is required')

    if (errors.length > 0) {
        return respond(400, { ok: false, error: errors.join('; ') }, headers)
    }

    const details = [
        ['Name', name],
        ['Email', email],
        ['Phone', number || 'not provided'],
        ['Sent', new Date().toISOString()]
    ]

    const text = [
        'New message from newmediapilot.com',
        '',
        ...details.map(([label, value]) => `${label}: ${value}`),
        '',
        'Message:',
        message
    ].join('\n')

    const html = [
        '<p><strong>New message from newmediapilot.com</strong></p>',
        '<table cellpadding="4" cellspacing="0" style="border-collapse:collapse">',
        ...details.map(
            ([label, value]) =>
                `<tr><td style="color:#666">${escapeHtml(label)}</td><td><strong>${escapeHtml(value)}</strong></td></tr>`
        ),
        '</table>',
        '<p style="white-space:pre-wrap;border-top:1px solid #ddd;padding-top:12px">',
        escapeHtml(message),
        '</p>'
    ].join('')

    try {
        await ses.send(
            new SendEmailCommand({
                Source: FROM,
                Destination: { ToAddresses: [TO] },
                ReplyToAddresses: [email],
                Message: {
                    Subject: { Data: `Contact form: ${clip(name, 60)}` },
                    Body: {
                        Text: { Data: text },
                        Html: { Data: html }
                    }
                }
            })
        )

        console.log('Contact email sent', JSON.stringify({ origin }))
        return respond(200, { ok: true }, headers)
    } catch (err) {
        console.error('Contact email failed', err.name, err.message)
        return respond(502, { ok: false, error: 'Could not send your message. Please try again.' }, headers)
    }
}
