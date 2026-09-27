import {
    IAMClient,
    CreateRoleCommand,
    UpdateAssumeRolePolicyCommand,
    GetRoleCommand,
    PutRolePolicyCommand
} from '@aws-sdk/client-iam'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) })

const REGION = process.env.AWS_REGION || 'us-east-1'
const ROLE_NAME = process.env.LAMBDA_ROLE_NAME || 'nmp-lambda-emailer'
// Must match the filename stem in npm-lambda/, which is what the deploy script
// uses as the Lambda function name. Lambda writes its logs under /aws/lambda/<name>.
const FUNCTION_NAME = 'newmediapilot-emailer'
const POLICY_NAME = 'nmp-emailer-ses'
const FROM = process.env.CONTACT_FROM || 'marcin@newmediapilot.com'

const client = new IAMClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.NMP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NMP_AWS_SECRET_ACCESS_KEY
    }
})

const trustPolicy = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
        {
            Effect: 'Allow',
            Principal: { Service: 'lambda.amazonaws.com' },
            Action: 'sts:AssumeRole'
        }
    ]
})

const permissions = JSON.stringify({
    Version: '2012-10-17',
    Statement: [
        {
            Sid: 'WriteOwnLogs',
            Effect: 'Allow',
            Action: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
            // Account id left as a wildcard so no STS call is needed just to build
            // the ARN; the log group is still pinned to this one function.
            Resource: `arn:aws:logs:${REGION}:*:log-group:/aws/lambda/${FUNCTION_NAME}*`
        },
        {
            Sid: 'SendOnlyFromVerifiedIdentity',
            Effect: 'Allow',
            Action: ['ses:SendEmail', 'ses:SendRawEmail'],
            Resource: '*',
            // SES has no per-identity resource ARN for sending, so the From address
            // is what actually limits this to the verified identity.
            Condition: { StringEquals: { 'ses:FromAddress': FROM } }
        }
    ]
})

const upsertRole = async () => {
    let arn
    try {
        const existing = await client.send(new GetRoleCommand({ RoleName: ROLE_NAME }))
        arn = existing.Role.Arn
        console.log(`Role ${ROLE_NAME} exists, refreshing trust policy`)
        await client.send(
            new UpdateAssumeRolePolicyCommand({ RoleName: ROLE_NAME, PolicyDocument: trustPolicy })
        )
    } catch (err) {
        // IAM surfaces a missing role as NoSuchEntityException, not NoSuchEntity.
        if (err.name !== 'NoSuchEntity' && err.name !== 'NoSuchEntityException') throw err
        console.log(`Creating role ${ROLE_NAME}`)
        const created = await client.send(
            new CreateRoleCommand({
                RoleName: ROLE_NAME,
                AssumeRolePolicyDocument: trustPolicy,
                Description: 'Execution role for the newmediapilot contact form emailer (SES send).',
                MaxSessionDuration: 3600
            })
        )
        arn = created.Role.Arn
    }
    return arn
}

const run = async () => {
    if (!process.env.NMP_AWS_ACCESS_KEY_ID || !process.env.NMP_AWS_SECRET_ACCESS_KEY) {
        console.error('NMP_AWS_ACCESS_KEY_ID / NMP_AWS_SECRET_ACCESS_KEY are not set in .env')
        process.exit(1)
    }

    const arn = await upsertRole()

    console.log('  attaching ses send policy')
    await client.send(
        new PutRolePolicyCommand({
            RoleName: ROLE_NAME,
            PolicyName: POLICY_NAME,
            PolicyDocument: permissions
        })
    )

    const described = await client.send(new GetRoleCommand({ RoleName: ROLE_NAME }))
    console.log(`\nRole ready: ${described.Role.Arn}`)
    console.log(`Set LAMBDA_EXECUTION_ROLE_ARN=${described.Role.Arn} in .env`)
}

run().catch((err) => {
    console.error('Role creation failed:', err.name, '-', err.message)
    process.exit(1)
})
