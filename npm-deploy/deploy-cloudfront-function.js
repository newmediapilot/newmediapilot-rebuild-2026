import {
    CloudFrontClient,
    CreateFunctionCommand,
    UpdateFunctionCommand,
    DescribeFunctionCommand,
    PublishFunctionCommand,
    GetDistributionConfigCommand,
    UpdateDistributionCommand,
    GetDistributionCommand
} from '@aws-sdk/client-cloudfront'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const REGION = process.env.AWS_REGION || 'us-east-1'
const FUNCTION_NAME = 'nmp-index-resolver'
const EVENT_TYPE = 'viewer-request'
const CODE_PATH = fileURLToPath(new URL('../npm-cloudfront/nmp_indexResolver.js', import.meta.url))

const client = new CloudFrontClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.NMP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NMP_AWS_SECRET_ACCESS_KEY
    }
})

const distributionId = process.env.CLOUDFRONT_DIST_ID

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll until the distribution reports Deployed, so we never race a second change. */
const waitForDeployed = async (label) => {
    for (let attempt = 1; attempt <= 40; attempt++) {
        const result = await client.send(new GetDistributionCommand({ Id: distributionId }))
        const status = result.Distribution?.Status
        if (status === 'Deployed') {
            console.log(`  ${label}: distribution Deployed`)
            return
        }
        process.stdout.write(`  ${label}: status=${status} (${attempt}/40)\r`)
        await wait(15000)
    }
    throw new Error(`${label}: distribution did not reach Deployed state in time`)
}

const upsertFunction = async () => {
    const code = fs.readFileSync(CODE_PATH, 'utf8')
    // The SDK models FunctionCode as a blob, so it must be bytes, not a string.
    const bytes = new TextEncoder().encode(code)
    const config = {
        Runtime: 'cloudfront-js-2.0',
        Comment: 'Rewrites /, trailing-slash and extensionless URIs to index.html'
    }

    let etag
    try {
        const existing = await client.send(new DescribeFunctionCommand({ Name: FUNCTION_NAME }))
        etag = existing.ETag
        console.log(`Updating function ${FUNCTION_NAME}`)
        await client.send(
            new UpdateFunctionCommand({ Name: FUNCTION_NAME, IfMatch: etag, FunctionConfig: config, FunctionCode: bytes })
        )
    } catch (err) {
        if (err.name !== 'NoSuchEntity' && err.name !== 'NoSuchFunctionExists') throw err
        console.log(`Creating function ${FUNCTION_NAME}`)
        await client.send(new CreateFunctionCommand({ Name: FUNCTION_NAME, FunctionConfig: config, FunctionCode: bytes }))
    }

    // Publish to LIVE. A freshly created function only exists in DEVELOPMENT, and
    // an unassociated association is rejected unless the function is live.
    const described = await client.send(new DescribeFunctionCommand({ Name: FUNCTION_NAME }))
    const stage = described.FunctionMetadata?.Stage
    if (stage !== 'LIVE') {
        const published = await client.send(
            new PublishFunctionCommand({ Name: FUNCTION_NAME, IfMatch: described.ETag })
        )
        console.log(`  published to LIVE (was ${stage})`)
        return published.FunctionSummary?.FunctionMetadata?.FunctionARN
    }
    console.log('  already LIVE')
    return described.FunctionMetadata?.FunctionARN
}

const associateFunction = async (functionArn) => {
    const current = await client.send(new GetDistributionConfigCommand({ Id: distributionId }))
    const config = current.DistributionConfig

    const existing = config.DefaultCacheBehavior?.FunctionAssociations?.Items ?? []
    const already = existing.find((item) => item.EventType === EVENT_TYPE)

    if (already?.FunctionARN === functionArn) {
        console.log(`  already associated on ${EVENT_TYPE}`)
        return false
    }

    // Replace any other viewer-request association, keep other event types intact.
    const kept = existing.filter((item) => item.EventType !== EVENT_TYPE)
    kept.push({ FunctionARN: functionArn, EventType: EVENT_TYPE })

    config.DefaultCacheBehavior.FunctionAssociations = { Quantity: kept.length, Items: kept }

    console.log(`  associating on ${EVENT_TYPE}`)
    await client.send(
        new UpdateDistributionCommand({ Id: distributionId, IfMatch: current.ETag, DistributionConfig: config })
    )
    return true
}

const run = async () => {
    if (!distributionId) {
        console.error('CLOUDFRONT_DIST_ID is not set in .env')
        process.exit(1)
    }
    if (!fs.existsSync(CODE_PATH)) {
        console.error(`Missing function source at ${CODE_PATH}`)
        process.exit(1)
    }

    const arn = await upsertFunction()
    if (!arn) {
        console.error('Could not determine function ARN')
        process.exit(1)
    }

    await waitForDeployed('after publish')

    if (await associateFunction(arn)) {
        await waitForDeployed('after associate')
    }

    console.log(`CloudFront function ${FUNCTION_NAME} live and associated.`)
}

run().catch((err) => {
    console.error('CloudFront function deploy failed:', err.name, '-', err.message)
    process.exit(1)
})
