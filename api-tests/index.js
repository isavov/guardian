const { spawn } = require('child_process');
const path = require('path');

function sleep(time) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, time);
    })
}

async function Run() {
    const pathArray = [
        [path.resolve(path.join('..', 'logger-service')), { GUARDIAN_ENV: 'develop' }],
        [path.resolve(path.join('..', 'notification-service')), { GUARDIAN_ENV: 'develop' }],
        [path.resolve(path.join('..', 'worker-service')), {
            IPFS_STORAGE_KEY: process.env.IPFS_STORAGE_KEY,
            IPFS_STORAGE_PROOF: process.env.IPFS_STORAGE_PROOF,
            GUARDIAN_ENV: 'develop'
        }],
        [path.resolve(path.join('..', 'auth-service')), {
            HASHICORP_ADDRESS: `http://${process.env.HASHICORP_HOST}:${process.env.HASHICORP_PORT}`,
            GUARDIAN_ENV: 'develop',
            ACCESS_TOKEN_UPDATE_INTERVAL: '30000000'
        }],
        [path.resolve(path.join('..', 'policy-service')), {
            OPERATOR_ID: process.env.OPERATOR_ID,
            OPERATOR_KEY: process.env.OPERATOR_KEY,
            GUARDIAN_ENV: 'develop'
        }],
        [path.resolve(path.join('..', 'guardian-service')), {
            OPERATOR_ID: process.env.OPERATOR_ID,
            OPERATOR_KEY: process.env.OPERATOR_KEY,
            GUARDIAN_ENV: 'develop'
        }],
        [path.resolve(path.join('..', 'api-gateway')), { GUARDIAN_ENV: 'develop' }]
    ];
    for (let p of pathArray) {
        const proc = spawn('npm start', {
            cwd: p[0],
            shell: true,
            detached: true,
            env: Object.assign(process.env, p[1])
        })
        proc.on('message', (message) => {
            console.log(p[0], message);
        });
        proc.on('error', (error) => {
            console.log(p[0], error);
        });
        proc.on('exit', (code) => {
            console.log(p[0], 'exit with code', code)
        })
        console.info(`"${path.parse(p[0]).name}"`, 'was started');
        await sleep(20000);
    }
    await sleep(10000);
}

Run().then(async () => {
    console.log('services started');
    while (true) {
        await sleep(10000);
    }
});
