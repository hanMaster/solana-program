const os = require('os');
const fs = require('mz/fs');
const path = require('path');
const yaml = require('yaml');
const web3 = require('@solana/web3.js');
const borsh = require('borsh');

let connection;
let payer;
let programId;
let votesPubkey;

const PROGRAM_PATH = path.resolve(__dirname, '../target/deploy');
const PROGRAM_KEYPAIR_PATH = path.join(PROGRAM_PATH, 'votes-keypair.json');

const getConfig = async () => {
    const CONFIG_FILE_PATH = path.resolve(os.homedir(), '.config', 'solana', 'cli', 'config.yml');
    const configYml = await fs.readFile(CONFIG_FILE_PATH, {encoding: 'utf8'});
    return yaml.parse(configYml);
}

const getRpcUrl = async () => {
    try {
        const config = await getConfig();
        if (!config.json_rpc_url) throw new Error('Missing RPC URL');
        return config.json_rpc_url;
    } catch (err) {
        console.warn(
            'Failed to read RPC url from CLI config file, falling back to localhost',
        );
        return 'http://localhost:8899';
    }
}

const getPayer = async () => {
    try {
        const config = await getConfig();
        if (!config.keypair_path) throw new Error('Missing keypair path');
        return await createKeypairFromFile(config.keypair_path);
    } catch (err) {
        console.warn(
            'Failed to create keypair from CLI config file, falling back to new random keypair',
        );
        return undefined;
    }
}

const createKeypairFromFile = async (filePath) => {
    const secretKeyString = await fs.readFile(filePath, {encoding: 'utf8'});
    const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
    return web3.Keypair.fromSecretKey(secretKey);
}

/**
 * The state of a vote account managed by the vote program
 */
class VoteAccount {
    yes = 0;
    abstained = 0;
    no = 0;

    constructor(fields) {
        if (fields) {
            this.yes = fields.yes ? fields.yes : undefined;
            this.abstained = fields.abstained ? fields.abstained : undefined;
            this.no = fields.no ? fields.no : undefined;
        }
    }
}

/**
 * Borsh schema definition for votes account
 */
const VoteSchema = new Map([
    [
        VoteAccount,
        {
            kind: 'struct',
            fields: [
                ['yes', 'u32'],
                ['abstained', 'u32'],
                ['no', 'u32'],
            ]
        }
    ],
]);

const VOTE_SIZE = borsh.serialize(
    VoteSchema,
    new VoteAccount(),
).length;

const establishConnection = async () => {
    const rpcUrl = await getRpcUrl();
    connection = new web3.Connection(rpcUrl, 'confirmed');
    const version = await connection.getVersion();
    console.log('Connection to cluster established:', rpcUrl, version);
}

const createAccount = async () => {

    try {
        const programKeypair = await createKeypairFromFile(PROGRAM_KEYPAIR_PATH);
        programId = programKeypair.publicKey;
        console.log(`programId: ${programId.toBase58()}`);
    } catch (err) {
        const errMsg = err.message;
        throw new Error(
            `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed`,
        );
    }

    await establishConnection();
    payer = await getPayer();

    console.log(`payer: ${payer.publicKey.toBase58()}`)

    // Derive the address (public key) of a greeting account from the program so that it's easy to find later.
    const VOTE_SEED = 'vote';
    votesPubkey = await web3.PublicKey.createWithSeed(
        payer.publicKey,
        VOTE_SEED,
        programId,
    );

    // Check if the greeting account has already been created
    const votesAccount = await connection.getAccountInfo(votesPubkey);
    if (votesAccount === null) {
        console.log(`Creating votes account: ${votesPubkey.toBase58()}`);
        const lamports = await connection.getMinimumBalanceForRentExemption(VOTE_SIZE);

        const transaction = new web3.Transaction().add(
            web3.SystemProgram.createAccountWithSeed({
                fromPubkey: payer.publicKey,
                basePubkey: payer.publicKey,
                seed: VOTE_SEED,
                newAccountPubkey: votesPubkey,
                lamports,
                space: VOTE_SIZE,
                programId,
            }),
        );
        await web3.sendAndConfirmTransaction(connection, transaction, [payer]);
    }
}

const run = async () => {
    await createAccount()
}

run()
