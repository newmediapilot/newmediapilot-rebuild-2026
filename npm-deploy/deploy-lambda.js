// Deploys the contact-form Lambda and its Function URL, then writes the resulting
// URL back into the root .env as PUBLIC_LAMBDA_URL so the Astro build can inline it.
//
// Function name is derived from the source filename:
//   npm-lambda/newmediapilot-emailer.js  ->  newmediapilot-emailer

import {
    LambdaClient,
    CreateFunctionCommand,
    UpdateFunctionCodeCommand,
    UpdateFunctionConfigurationCommand,
    GetFunctionCommand,
    GetFunctionConfigurationCommand,
    CreateFunctionUrlConfigCommand,
    UpdateFunctionUrlConfigCommand,
    GetFunctionUrlConfigCommand,
    AddPermissionCommand,
} from '@aws-sdk/client-lambda';
import * as esbuild from 'esbuild';
import { ZipArchive } from 'archiver';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const envPath = path.join(repoRoot, '.env');
dotenv.config({ path: envPath });

const REGION = process.env.AWS_REGION || 'us-east-1';
const LAMBDA_DIR = path.join(repoRoot, 'npm-lambda');
const ENTRY = path.join(LAMBDA_DIR, 'newmediapilot-emailer.js');
const FUNCTION_NAME = path.basename(ENTRY, '.js');
const ROLE_ARN = process.env.LAMBDA_EXECUTION_ROLE_ARN;

const CONTACT_TO = process.env.CONTACT_TO || 'marcin@newmediapilot.com';
const CONTACT_FROM = process.env.CONTACT_FROM || CONTACT_TO;
const FORM_TOKEN = process.env.FORM_TOKEN || '';
const ALLOWED_ORIGINS =
    process.env.ALLOWED_ORIGINS ||
    ['https://newmediapilot.com', 'https://www.newmediapilot.com', 'http://localhost:4321', 'http://127.0.0.1:4321'].join(
        ','
    );

if (!ROLE_ARN) throw new Error('LAMBDA_EXECUTION_ROLE_ARN is not set in .env');
if (!FORM_TOKEN) throw new Error('FORM_TOKEN is not set in .env; the function would reject every submission');
if (!process.env.NMP_AWS_ACCESS_KEY_ID || !process.env.NMP_AWS_SECRET_ACCESS_KEY) {
    throw new Error('NMP_AWS_ACCESS_KEY_ID / NMP_AWS_SECRET_ACCESS_KEY are not set in .env');
}

const client = new LambdaClient({
    region: REGION,
    credentials: {
        accessKeyId: process.env.NMP_AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.NMP_AWS_SECRET_ACCESS_KEY,
    },
});

const createZip = (filename, content) =>
    new Promise((resolve, reject) => {
        // archiver 8 is ESM-only and exposes named classes; there is no default export.
        const archive = new ZipArchive({ zlib: { level: 9 } });
        const chunks = [];
        archive.on('data', (c) => chunks.push(c));
        archive.on('end', () => resolve(Buffer.concat(chunks)));
        archive.on('error', reject);
        archive.append(content, { name: filename });
        archive.finalize();
    });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function retryOnConflict(fn, maxRetries = 10) {
    for (let i = 0; ; i++) {
        try {
            return await fn();
        } catch (err) {
            if (err.name === 'ResourceConflictException' && i < maxRetries) {
                const delay = Math.min(1000 * 2 ** i, 15000);
                console.log(`  update in progress, retrying in ${delay}ms (${i + 1}/${maxRetries})`);
                await wait(delay);
            } else {
                throw err;
            }
        }
    }
}

async function waitForActive() {
    for (let i = 0; i < 40; i++) {
        const res = await client.send(new GetFunctionConfigurationCommand({ FunctionName: FUNCTION_NAME }));
        if (res.State === 'Active') return;
        await wait(1500);
    }
    throw new Error('function never reached Active state');
}

// Rewrites PUBLIC_LAMBDA_URL in the root .env without disturbing anything else,
// and without printing the rest of the file (it holds AWS secrets).
function writeEnvValue(key, value) {
    const raw = readFileSync(envPath, 'utf8');
    const line = new RegExp(`^${key}=.*$`, 'm');
    const next = line.test(raw) ? raw.replace(line, `${key}=${value}`) : `${raw.replace(/\s*$/, '')}\n${key}=${value}\n`;
    writeFileSync(envPath, next);
}

// AWS_REGION is deliberately absent: it is a reserved key that Lambda always
// provides, and setting it is rejected with InvalidParameterValueException.
const envVars = {
    CONTACT_TO,
    CONTACT_FROM,
    FORM_TOKEN,
    ALLOWED_ORIGINS,
};

const deploy = async () => {
    const result = await esbuild.build({
        entryPoints: [ENTRY],
        bundle: true,
        platform: 'node',
        target: 'node22',
        format: 'cjs',
        write: false,
        minify: true,
    });
    const zipBuffer = await createZip('index.js', result.outputFiles[0].text);

    console.log(`\nDeploying Lambda: ${FUNCTION_NAME}`);
    console.log(`  bundle: ${(zipBuffer.length / 1024).toFixed(1)} kB zip`);

    let exists = true;
    try {
        await client.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    } catch (err) {
        if (err.name !== 'ResourceNotFoundException') throw err;
        exists = false;
    }

    if (exists) {
        await retryOnConflict(() =>
            client.send(
                new UpdateFunctionCodeCommand({ FunctionName: FUNCTION_NAME, ZipFile: zipBuffer })
            )
        );
        await retryOnConflict(() =>
            client.send(
                new UpdateFunctionConfigurationCommand({
                    FunctionName: FUNCTION_NAME,
                    Handler: 'index.handler',
                    Runtime: 'nodejs22.x',
                    Role: ROLE_ARN,
                    Timeout: 15,
                    MemorySize: 128,
                    Environment: { Variables: envVars },
                })
            )
        );
        console.log('  updated code + config');
    } else {
        await client.send(
            new CreateFunctionCommand({
                FunctionName: FUNCTION_NAME,
                Runtime: 'nodejs22.x',
                Role: ROLE_ARN,
                Handler: 'index.handler',
                Code: { ZipFile: zipBuffer },
                Timeout: 15,
                MemorySize: 128,
                Publish: true,
                Environment: { Variables: envVars },
            })
        );
        console.log('  created function');
    }

    try {
        await client.send(
            new CreateFunctionUrlConfigCommand({ FunctionName: FUNCTION_NAME, AuthType: 'NONE' })
        );
        console.log('  created function URL (AuthType NONE)');
    } catch (err) {
        if (err.name === 'ResourceConflictException') {
            await client.send(
                new UpdateFunctionUrlConfigCommand({ FunctionName: FUNCTION_NAME, AuthType: 'NONE' })
            );
            console.log('  updated function URL (AuthType NONE)');
        } else {
            throw err;
        }
    }

    // The Lambda console's "allow public access" toggle creates TWO statements, not
    // one. The lambda:InvokeFunctionUrl grant alone is not enough: without the paired
    // lambda:InvokeFunction grant the URL front door still answers AccessDeniedException
    // to every caller, even a bare GET. Verified against the working killarneylodge
    // function, which carries both (plus a duplicate of the first from its own script).
    const grants = [
        {
            StatementId: 'public-invoke',
            Action: 'lambda:InvokeFunctionUrl',
            FunctionUrlAuthType: 'NONE',
        },
        {
            StatementId: 'public-invoke-action',
            Action: 'lambda:InvokeFunction',
            Condition: { Bool: { 'lambda:InvokedViaFunctionUrl': 'true' } },
        },
    ];

    for (const grant of grants) {
        try {
            await client.send(
                new AddPermissionCommand({
                    FunctionName: FUNCTION_NAME,
                    StatementId: grant.StatementId,
                    Action: grant.Action,
                    Principal: '*',
                    FunctionUrlAuthType: grant.FunctionUrlAuthType,
                    Condition: grant.Condition,
                })
            );
            console.log(`  added ${grant.StatementId} (${grant.Action})`);
        } catch (err) {
            if (err.name !== 'ResourceConflictException') throw err;
            console.log(`  ${grant.StatementId} already present`);
        }
    }

    await waitForActive();

    const urlConfig = await client.send(
        new GetFunctionUrlConfigCommand({ FunctionName: FUNCTION_NAME })
    );
    const url = urlConfig.FunctionUrl;
    console.log(`  URL: ${url}`);

    writeEnvValue('PUBLIC_LAMBDA_URL', url);
    console.log('  wrote PUBLIC_LAMBDA_URL to .env');
    console.log('\nRebuild the site so the endpoint and token are inlined, then deploy S3.');
};

deploy().catch((err) => {
    console.error('Deploy failed:', err.name, err.message);
    process.exit(1);
});
