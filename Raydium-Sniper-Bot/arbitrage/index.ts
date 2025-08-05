import { AddressLookupTableAccount, ComputeBudgetProgram, Connection, Keypair, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import fs from 'fs';
import bs58 from 'bs58'
import fetch from 'cross-fetch';
import { Wallet, web3 } from '@project-serum/anchor';
import { solanaConnection as connection } from '../config';
require('dotenv').config();

let data = JSON.parse(fs.readFileSync("data.json", `utf8`))

let walletKeypair = Keypair.fromSecretKey(bs58.decode(data.privKey));
let wallet = new Wallet(walletKeypair);

let baseToken = new PublicKey(data.baseToken)
let quoteToken = new PublicKey(data.quoteToken)
let arbitrageAmount = data.arbitrageAmount

let decimal: number
let amount: number

// const retrieveRouteMap = async () => {

//     // Retrieve the `indexed-route-map`
//     const indexedRouteMap = await (await fetch('https://quote-api.jup.ag/v6/indexed-route-map')).json();
//     // console.log("indexedRouteMap ", indexedRouteMap)

//     const getMint = (index: any) => indexedRouteMap["mintKeys"][index];
//     const getIndex = (mint: any) => indexedRouteMap["mintKeys"].indexOf(mint);

//     // Generate the route map by replacing indexes with mint addresses
//     var generatedRouteMap = {};
//     Object.keys(indexedRouteMap['indexedRouteMap']).forEach((key, index) => {
//         // @ts-ignore
//         generatedRouteMap[getMint(key)] = indexedRouteMap["indexedRouteMap"][key].map((index) => getMint(index))
//     });

//     // List all possible input tokens by mint address
//     const allInputMints = Object.keys(generatedRouteMap);
//     // console.log("allInputMints ", allInputMints)

//     // List all possition output tokens that can be swapped from the mint address for SOL.
//     // SOL -> X
//     // @ts-ignore
//     const swappableOutputForSOL = generatedRouteMap['So11111111111111111111111111111111111111112'];
// }

const getRoute4Swap = async (inputMint: string, outputMint: string, amount: number | string, bps: number, maxAccounts: number, direction: Boolean = false, swapMode: String = 'ExactIn') => {
    const quoteResponse = swapMode == 'ExactIn' ? await (await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${bps}&maxAccounts=${maxAccounts}&onlyDirectRoutes=${direction}&swapMode=${swapMode}`
    )).json() :
        await (await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${bps}&onlyDirectRoutes=${direction}&swapMode=${swapMode}`
        )).json();

    console.log('swapInfo',quoteResponse.routePlan[0].swapInfo)
    console.log('quoteResponse', quoteResponse)

    return quoteResponse
}

// const getSerializedTx = async (quoteResponse: any) => {
//     // get serialized transactions for the swap
//     const result = await (
//         await fetch('https://quote-api.jup.ag/v6/swap', {
//             method: 'POST',
//             headers: {
//                 'Content-Type': 'application/json'
//             },
//             body: JSON.stringify({
//                 // quoteResponse from /quote api
//                 quoteResponse,
//                 // user public key to be used for the swap
//                 userPublicKey: wallet.publicKey.toString(),
//                 // auto wrap and unwrap SOL. default is true
//                 wrapAndUnwrapSol: true,
//                 // feeAccount is optional. Use if you want to charge a fee.  feeBps must have been passed in /quote API.
//                 // feeAccount: "fee_account_public_key",
//                 asLegacyTransaction: true
//             })
//         })
//     ).json();
//     return result.swapTransaction
// }

// const deserializeAndSignTx = async (swapTransaction: any) => {
//     // deserialize the transaction
//     const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
//     var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
//     // transaction.message
//     console.log(transaction);

//     // sign the transaction
//     transaction.sign([wallet.payer]);
//     return transaction
// }

// const execTx = async (transaction: VersionedTransaction, blockhash: {
//     blockhash: string;
//     lastValidBlockHeight: number;
// }) => {
//     // Execute the transaction

//     const rawTransaction = transaction.serialize()

//     const txid = await connection.sendRawTransaction(rawTransaction, {
//         skipPreflight: true,
//         maxRetries: 2,
//         preflightCommitment: "processed"
//     });
//     console.log(`https://solscan.io/tx/${txid}`);
//     // const confirmed = await connection.confirmTransaction(txid, "confirmed");

//     // console.log("confirmed ", confirmed)
//     // console.log("err ", confirmed.value.err)
// }

const getAdressLookupTableAccounts = async (
    keys: string[]
): Promise<AddressLookupTableAccount[]> => {
    const addressLookupTableAccountInfos = await connection.getMultipleAccountsInfo(keys.map((key) => new PublicKey(key)));

    return addressLookupTableAccountInfos.reduce((acc, accountInfo, index) => {
        const addressLookupTableAddress = keys[index];
        if (accountInfo) {
            const addressLookupTableAccount = new AddressLookupTableAccount({
                key: new PublicKey(addressLookupTableAddress),
                state: AddressLookupTableAccount.deserialize(accountInfo.data),
            });
            acc.push(addressLookupTableAccount);
        }

        return acc;
    }, new Array<AddressLookupTableAccount>());
};

const getSwapInx = async (quoteResponse: any) => {
    let inxAccounts: string[] = [];
    let slot = await connection.getSlot();

    const instructions = await (
        await fetch('https://quote-api.jup.ag/v6/swap-instructions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // quoteResponse from /quote api
                quoteResponse: {
                    ...quoteResponse,
                    // contextSlot: slot
                },
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                useSharedAccounts: false
            })
        })
    ).json();

    if (instructions.error) {
        console.log("error: ", instructions.error);
    }

    const {
        tokenLedgerInstruction: tokenLedgerInstructionPayload, // If you are using `useTokenLedger = true`.
        computeBudgetInstructions: computeBudgetInstructionsPayload, // The necessary instructions to setup the compute budget.
        setupInstructions: setupInstructionsPayload, // Setup missing ATA for the users.
        swapInstruction: swapInstructionPayload, // The actual swap instruction.
        cleanupInstruction: cleanupInstructionPayload, // Unwrap the SOL if `wrapAndUnwrapSol = true`.
        addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
    } = instructions;

    // console.log(swapInstructionPayload);

    const swapInstruction = new TransactionInstruction({
        programId: new PublicKey(swapInstructionPayload.programId),
        // @ts-ignore
        keys: swapInstructionPayload.accounts.map((key) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
        })),
        data: Buffer.from(swapInstructionPayload.data, "base64"),
    });

    // @ts-ignore
    swapInstructionPayload.accounts.map((key) => {
        if (!inxAccounts.includes(key.pubkey)) {
            inxAccounts.push(key.pubkey)
        }
    })

    let setupInstructions: TransactionInstruction[] = [];

    // @ts-ignore
    setupInstructionsPayload.map(setupInstructionPayload => {
        setupInstructions.push(new TransactionInstruction({
            programId: new PublicKey(setupInstructionPayload.programId),
            // @ts-ignore
            keys: setupInstructionPayload.accounts.map((key) => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
            })),
            data: Buffer.from(setupInstructionPayload.data, "base64"),
        }));

        // @ts-ignore
        setupInstructionPayload.accounts.map((key) => {
            if (!inxAccounts.includes(key.pubkey)) {
                inxAccounts.push(key.pubkey)
            }
        })
    })

    const cleanupInstructions = cleanupInstructionPayload ? [new TransactionInstruction({
        programId: new PublicKey(cleanupInstructionPayload.programId),
        // @ts-ignore
        keys: cleanupInstructionPayload.accounts.map((key) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
        })),
        data: Buffer.from(cleanupInstructionPayload.data, "base64"),
    })] : [];
    if (cleanupInstructionPayload) {
        // @ts-ignore
        cleanupInstructionPayload.accounts.map((key) => {
            if (!inxAccounts.includes(key.pubkey)) {
                inxAccounts.push(key.pubkey)
            }
        })
    }

    return {
        swapInstruction,
        setupInstructions,
        cleanupInstructions,
        inxAccounts,
        addressLookupTableAddresses
    }

}

const swap = async () => {
    const swapRoutes = [baseToken, quoteToken]
    // const bal = await connection.getBalance(wallet.publicKey)
    // if (bal < amount) {
    //     console.log(`${bal} < ${amount}`)
    //     return
    // }
    if (swapRoutes.length != 2) {
        console.log("need 2 tokens!")
        return;
    }

    const quote1 = await getRoute4Swap(swapRoutes[0].toBase58(), swapRoutes[1].toBase58(), amount, 50, 20);
    const nextAmount = quote1.outAmount;
    const quote2 = await getRoute4Swap(swapRoutes[1].toBase58(), swapRoutes[0].toBase58(), nextAmount, 50, 20);

    if (!quote1 || !quote2) {
        console.log("Failed to get quote");
        return;
    }

    console.log(amount, quote2.outAmount)

    if (quote2.outAmount < amount * 1.1) {
        console.log('failed')
        return;
    } else console.log('success')

    console.log(amount, quote2.outAmount)
    console.log('quote1', quote1.routePlan)
    console.log('quote2', quote2.routePlan)

    quote1.outputMint = quote2.outputMint;
    quote1.outAmount = quote2.outAmount;
    quote1.routePlan.push(...quote2.routePlan);

    const ixs: TransactionInstruction[] = [];

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1000000
    });

    const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 50000
    });

    ixs.push(modifyComputeUnits);
    ixs.push(addPriorityFee);

    const {
        swapInstruction,
        setupInstructions,
        cleanupInstructions,
        inxAccounts: inxAccountAddressesPayload,
        addressLookupTableAddresses: addressLookupTableAddressesPayload,
    } = await getSwapInx(quote1);

    ixs.push(...setupInstructions)
    ixs.push(swapInstruction)
    if (cleanupInstructions)
        ixs.push(...cleanupInstructions)

    const addressLookupTableAccounts: AddressLookupTableAccount[] = [];
    addressLookupTableAccounts.push(
        ...(await getAdressLookupTableAccounts(addressLookupTableAddressesPayload))
    );

    const blockhash = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: blockhash.blockhash,
        instructions: ixs,
    }).compileToV0Message(addressLookupTableAccounts);
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet.payer])

    const res = await connection.simulateTransaction(transaction);

    console.log('logs')
    console.table(res.value.logs)
    console.log('unitsConsumed', res.value.unitsConsumed)
    console.log("estimated profit: ", quote2.outAmount - amount);

    // try {
    //     await execTx(transaction, blockhash)
    // } catch (e) {
    //     console.log("err exception: ", e)
    // }
}

export const sleep = (time: number) => {
    return new Promise(resolve => setTimeout(resolve, time))
}

export const arbitrage = async () => {
    data = JSON.parse(fs.readFileSync("data.json", `utf8`))

    walletKeypair = Keypair.fromSecretKey(bs58.decode(data.privKey));
    wallet = new Wallet(walletKeypair);

    baseToken = new PublicKey(data.baseToken)
    quoteToken = new PublicKey(data.quoteToken)
    arbitrageAmount = data.arbitrageAmount
    const info = await connection.getParsedAccountInfo(new PublicKey(baseToken))
    // @ts-ignore
    decimal = info.value?.data.parsed.info.decimals
    amount = arbitrageAmount * Math.pow(10, decimal)

    swap()
    try {
        do {
            await swap()
            await sleep(3000)
        } while (true)
    } catch (e) {
        console.log("err ", e)
    }
}

export const watcher = fs.watch('data.json', async () => {
    data = JSON.parse(fs.readFileSync("data.json", `utf8`))

    walletKeypair = Keypair.fromSecretKey(bs58.decode(data.privKey));
    wallet = new Wallet(walletKeypair);

    baseToken = new PublicKey(data.baseToken)
    quoteToken = new PublicKey(data.quoteToken)
    arbitrageAmount = data.arbitrageAmount
    const info = await connection.getParsedAccountInfo(new PublicKey(baseToken))
    // @ts-ignore
    decimal = info.value?.data.parsed.info.decimals
    amount = arbitrageAmount * Math.pow(10, decimal)
})