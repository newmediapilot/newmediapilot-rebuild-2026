import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const client = new CloudFrontClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.NMP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NMP_AWS_SECRET_ACCESS_KEY
    }
})

const distribution = process.env.CLOUDFRONT_DIST_ID

const invalidate = async () => {
    if (!distribution) {
        console.error('CLOUDFRONT_DIST_ID is not set in .env')
        process.exit(1)
    }

    const result = await client.send(
        new CreateInvalidationCommand({
            DistributionId: distribution,
            InvalidationBatch: {
                CallerReference: String(Date.now()),
                Paths: {
                    Quantity: 1,
                    Items: ['/*']
                }
            }
        })
    )

    console.log('CloudFront invalidation created:', result.Invalidation?.Id)
}

invalidate().catch((err) => {
    console.error('Error creating invalidation:', err)
    process.exit(1)
})
