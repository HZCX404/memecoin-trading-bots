import { Wallet, web3 } from "@project-serum/anchor";
import { BaseMpl } from "./base/baseMpl";
import base58 from "bs58"
import { Result } from "./base/types";
import { AddLiquidityInput, BundleRes, CreateAndBuy, CreateMarketInput, CreatePoolInput, CreatePoolInputAndProvide, CreateTokenInput, RemoveLiquidityInput, SwapInput } from "./types";
import { calcDecimalValue, calcNonDecimalValue, deployJsonData, sendAndConfirmTransaction, sleep } from "./utils";
// import { ENV, RPC_ENDPOINT_DEV, RPC_ENDPOINT_MAIN } from "./constants";
import { BaseRay } from "./base/baseRay";
import { Metadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
import { AccountLayout, MintLayout, NATIVE_MINT, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createBurnInstruction, createCloseAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { BaseSpl } from "./base/baseSpl";
import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import { bundle } from "jito-ts";
import { Liquidity, LiquidityPoolInfo, LiquidityPoolKeysV4, Percent, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import BN from "bn.js";
import fs from 'fs'
import { ComputeBudgetProgram, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58'
import { BLOCKENGINE_URL, JITO_AUTH_KEYPAIR, solanaConnection, devConnection } from "../config";
import { VersionedTransaction } from "@solana/web3.js";
import { isError } from "jito-ts/dist/sdk/block-engine/utils";
const log = console.log;

// const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
// const PRIVATE_KEY = data.privKey
// const keypair = Keypair.fromSecretKey(bs58.decode(PRIVATE_KEY));
// const updateCuIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2_000_000 })

export async function createToken(input: CreateTokenInput): Promise<Result<{ tokenId: string, txSignature: string }, string>> {
    try {
        const { decimals, name, image, symbol, website, telegram, twitter, url, initialMintingAmount, metaUri, keypair } = input;
        const wallet = new Wallet(keypair)
        const endpoint = url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint
        const baseMpl = new BaseMpl(wallet, { endpoint })

        console.log("Creating token")
        const res = await baseMpl.createToken({
            name,
            uri: metaUri,
            symbol,
            sellerFeeBasisPoints: 0,
            tokenStandard: TokenStandard.Fungible,
            creators: [{ address: wallet.publicKey, share: 100 }]
        }, {
            decimal: decimals,
            mintAmount: initialMintingAmount ?? 0,
            revokeAuthorities: input.revokeAuthorities
        })

        console.log(res)
        if (!res) {
            return { Err: "Failed to send the transation" }
        }

        return {
            Ok: {
                txSignature: res.txSignature,
                tokenId: res.token
            }
        }
    }
    catch (error) {
        log({ error })
        return { Err: "failed to create the token" }
    }
}

// export async function freezeAccount(input:) {

// }

export async function removeLiquidity(input: RemoveLiquidityInput): Promise<Result<{ txSignature: string }, string>> {
    const { amount, poolId, url, keypair } = input
    const user = keypair.publicKey
    const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
    const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
    const poolKeys = await baseRay.getPoolKeys(poolId).catch(getPoolKeysError => { log({ getPoolKeysError }); return null })
    if (!poolKeys) return { Err: "Pool not found" }
    const txInfo = await baseRay.removeLiquidity({ amount, poolKeys, user }).catch(removeLiquidityError => { log({ removeLiquidityError }); return null })
    if (!txInfo) return { Err: "failed to prepare tx" }
    if (txInfo.Err) return { Err: txInfo.Err }
    if (!txInfo.Ok) return { Err: "failed to prepare tx" }
    const ixs = txInfo.Ok.ixs
    const userSolAta = getAssociatedTokenAddressSync(NATIVE_MINT, user)
    if (input.unwrapSol) ixs.push(createCloseAccountInstruction(userSolAta, user, user))
    const updateCPIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
    const updateCLIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 })
    const tx = new web3.Transaction().add(updateCPIx, updateCLIx, ...ixs)

    // speedup
    tx.feePayer = keypair.publicKey
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    tx.recentBlockhash = recentBlockhash
    tx.sign(keypair)

    const simRes = (await connection.simulateTransaction(tx))
    console.log('remove lp sim', simRes.value.logs)

    const txSignature = (await sendAndConfirmTransaction(tx, connection)
        .catch(async () => {
            console.log("remove liq tx1 failed")
            await sleep(500)
            console.log("sending remove liq tx2")
            return await sendAndConfirmTransaction(tx, connection)
                .catch((createPoolAndBuyTxFail) => {
                    log({ createPoolAndBuyTxFail })
                    return null
                })
        }))

    console.log("confirmed remove liq tx")
    // const res = await connection.sendTransaction(tx, [keypair]).catch(sendTxError => { log({ sendTxError }); return null });
    if (!txSignature) return { Err: "failed to send the transaction" }
    return { Ok: { txSignature } }
}

export async function createMarket(input: CreateMarketInput): Promise<Result<{ marketId: string, txSignature: string }, string>> {
    const { baseMint, orderSize, priceTick, quoteMint, url, keypair } = input

    const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
    const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
    const preTxInfo = await baseRay.createMarket({ baseMint, quoteMint, tickers: { lotSize: orderSize, tickSize: priceTick } }, keypair.publicKey).catch(createMarketError => { return null })
    if (!preTxInfo) {
        return { Err: "Failed to prepare market creation transaction" }
    }
    if (preTxInfo.Err) {
        log(preTxInfo.Err)
        return { Err: preTxInfo.Err }
    }
    if (!preTxInfo.Ok) return { Err: "failed to prepare tx" }
    const { marketId } = preTxInfo.Ok
    try {
        console.log("preparing create market")
        const payer = keypair.publicKey
        const info = preTxInfo.Ok
        // speedup
        const recentBlockhash1 = (await connection.getLatestBlockhash()).blockhash;
        const updateCPIx1 = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000_000 })
        const updateCLIx1 = ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 })
        const tx1 = new web3.Transaction().add(updateCPIx1, updateCLIx1, ...info.vaultInstructions)
        tx1.feePayer = keypair.publicKey
        tx1.recentBlockhash = recentBlockhash1
        tx1.sign(keypair)
        console.log("sending vault instructions tx")
        const txSignature1 = await connection.sendTransaction(tx1, [keypair, ...info.vaultSigners], { skipPreflight: true })
        console.log("awaiting vault instructions tx")
        await connection.confirmTransaction(txSignature1)
        console.log("confirmed vault instructions tx")


        const recentBlockhash2 = (await connection.getLatestBlockhash()).blockhash;
        const updateCPIx2 = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000_000 })
        const updateCLIx2 = ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 })
        const tx2 = new web3.Transaction().add(updateCPIx2, updateCLIx2, ...info.marketInstructions)
        tx2.feePayer = keypair.publicKey
        tx2.recentBlockhash = recentBlockhash2
        tx2.sign(keypair)
        // const tx2 = new web3.Transaction().add(...info.marketInstructions)
        console.log("sending create market tx")
        const txSignature = await connection.sendTransaction(tx2, [keypair, ...info.marketSigners], { skipPreflight: true })
        console.log("awaiting create market tx")
        await connection.confirmTransaction(txSignature, 'finalized')
        console.log("confirmed create market tx")

        let accountInfo = await connection.getAccountInfo(info.marketId)
        let cnt = 0
        while (!accountInfo) {
            console.log('sleep')
            await sleep(1_000)
            accountInfo = await connection.getAccountInfo(info.marketId)
            if (cnt++ > 10) break
        }

        if (accountInfo) {
            const result = {
                Ok: {
                    marketId: marketId.toBase58(),
                    txSignature: txSignature
                }
            }

            console.log(result)
            return result
        } else {
            return { Err: "failed to send the transaction" }
        }
    } catch (error) {
        log({ error })
        return { Err: "failed to send the transaction" }
    }
}

// export async function addLiquidity(input: AddLiquidityInput): Promise<Result<{ txSignature: string }, string>> {
//     const { amount, amountSide, poolId, url, slippage } = input
//     const user = keypair.publicKey
//     const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
//     const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
//     const poolKeys = await baseRay.getPoolKeys(poolId).catch(getPoolKeysError => { log({ getPoolKeysError }); return null })
//     if (!poolKeys) return { Err: "Pool not found" }
//     const amountInfo = await baseRay.computeAnotherAmount({ amount, fixedSide: amountSide, poolKeys, isRawAmount: false, slippage }).catch(computeAnotherAmountError => { log({ computeAnotherAmount: computeAnotherAmountError }); return null })
//     if (!amountInfo) return { Err: "Failed to clculate the amount" }
//     const { baseMintAmount, liquidity, quoteMintAmount, } = amountInfo
//     const txInfo = await baseRay.addLiquidity({ baseMintAmount, fixedSide: amountSide, poolKeys, quoteMintAmount, user }).catch(addLiquidityError => { log({ addLiquidityError }); return null })
//     if (!txInfo) return { Err: 'failed to prepare tx' }
//     const { ixs } = txInfo

//     // speedup
//     const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
//     const tx = new web3.Transaction().add(updateCuIx, ...ixs)
//     tx.feePayer = keypair.publicKey
//     tx.recentBlockhash = recentBlockhash
//     tx.sign(keypair)

//     // const res = await connection.sendTransaction(tx, [keypair]).catch(sendTxError => { log({ sendTxError }); return null });
//     const res = await sendAndConfirmTransaction(tx, connection).catch((sendAndConfirmTransactionError) => {
//         log({ sendAndConfirmTransactionError })
//     })
//     if (!res) return { Err: "failed to send the transaction" }
//     return { Ok: { txSignature: res } }
// }

// export async function removeLiquidityFaster(input: RemoveLiquidityInput): Promise<Result<{ txSignature: string }, string>> {
//     const { amount, poolId, url, } = input
//     const user = keypair.publicKey
//     const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
//     const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
//     const poolKeys = await baseRay.getPoolKeys(poolId).catch(getPoolKeysError => { log({ getPoolKeysError }); return null })
//     if (!poolKeys) return { Err: "Pool not found" }
//     const txInfo = await baseRay.removeLiquidityFaster({ amount, poolKeys, user }).catch(removeLiquidityError => { log({ removeLiquidityError }); return null })
//     if (!txInfo) return { Err: "failed to prepare tx" }
//     if (txInfo.Err) return { Err: txInfo.Err }
//     if (!txInfo.Ok) return { Err: "failed to prepare tx" }
//     const userSplAta = getAssociatedTokenAddressSync(NATIVE_MINT, user)
//     const initSplAta = createAssociatedTokenAccountInstruction(user, userSplAta, user, NATIVE_MINT)
//     const ixs = [initSplAta, ...txInfo.Ok.ixs]
//     const userSolAta = getAssociatedTokenAddressSync(NATIVE_MINT, user)
//     if (input.unwrapSol) ixs.push(createCloseAccountInstruction(userSolAta, user, user))

//     // speedup
//     const updateCuIx = web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5_000_000 })
//     const tx = new web3.Transaction().add(updateCuIx, ...ixs)
//     tx.feePayer = keypair.publicKey
//     const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
//     tx.recentBlockhash = recentBlockhash
//     tx.sign(keypair)
//     const handlers: Promise<void>[] = []
//     for (let i = 0; i < 4; ++i) {
//         const handle = connection.sendTransaction(tx, [keypair], { skipPreflight: true }).catch(sendTxError => { return null }).then((res) => {
//             if (res) {
//                 log(`lightning try: ${i + 1} | txSignature: ${res}`)
//             }
//         });
//         handlers.push(handle)
//     }
//     for (let h of handlers) {
//         await h
//     }

//     const rawTx = tx.serialize()
//     const txSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
//         .catch(async () => {
//             console.log("remove liq tx1 failed")
//             await sleep(500)
//             console.log("sending remove liq tx2")
//             return await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
//                 .catch((createPoolAndBuyTxFail) => {
//                     log({ createPoolAndBuyTxFail })
//                     return null
//                 })
//         }))
//     console.log("confirmed remove liq tx")
//     // const res = await connection.sendTransaction(tx, [keypair]).catch(sendTxError => { log({ sendTxError }); return null });
//     if (!txSignature) return { Err: "failed to send the transaction" }
//     return { Ok: { txSignature } }
// }


// export async function createPool(input: CreatePoolInput): Promise<Result<{ poolId: string, txSignature: string, baseAmount: BN, quoteAmount: BN, baseDecimals: number, quoteDecimals: number }, string>> {
//     let { baseMintAmount, quoteMintAmount, marketId, keypair } = input
//     const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint)
//     const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
//     const marketState = await baseRay.getMarketInfo(marketId).catch((getMarketInfoError) => { log({ getMarketInfoError }); return null })
//     // log({marketState})
//     if (!marketState) {
//         return { Err: "market not found" }
//     }
//     const { baseMint, quoteMint } = marketState
//     log({
//         baseToken: baseMint.toBase58(),
//         quoteToken: quoteMint.toBase58(),
//     })
//     const txInfo = await baseRay.createPool({ baseMint, quoteMint, marketId, baseMintAmount, quoteMintAmount }, keypair.publicKey).catch((innerCreatePoolError) => { log({ innerCreatePoolError }); return null })
//     if (!txInfo) return { Err: "Failed to prepare create pool transaction" }
//     // speedup
//     const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
//     const txMsg = new web3.TransactionMessage({
//         instructions: [updateCuIx, ...txInfo.ixs],
//         payerKey: keypair.publicKey,
//         recentBlockhash,
//     }).compileToV0Message()
//     const tx = new web3.VersionedTransaction(txMsg)
//     tx.sign([keypair, ...txInfo.signers])
//     const rawTx = tx.serialize()
//     console.log("PoolId: ", txInfo.poolId.toBase58())
//     console.log("SENDING CREATE POOL TX")
//     const simRes = (await connection.simulateTransaction(tx)).value
//     const txSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
//         .catch(async () => {
//             await sleep(500)
//             return await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
//                 .catch((createPoolAndBuyTxFail) => {
//                     log({ createPoolAndBuyTxFail })
//                     return null
//                 })
//         }))
//     console.log("CONFIRMED CREATE POOL TX")
//     if (!txSignature) log("Tx failed")
//     // const txSignature = await connection.sendTransaction(tx).catch((error) => { log({ createPoolTxError: error }); return null });
//     if (!txSignature) {
//         return { Err: "Failed to send transaction" }
//     }

//     const result = {
//         Ok: {
//             poolId: txInfo.poolId.toBase58(),
//             txSignature,
//             baseAmount: txInfo.baseAmount,
//             quoteAmount: txInfo.quoteAmount,
//             baseDecimals: txInfo.baseDecimals,
//             quoteDecimals: txInfo.quoteDecimals,
//         }
//     }

//     log(result)

//     return result
// }

export async function createPoolAndProvide(input: CreatePoolInputAndProvide) {
    let { baseMintAmount, quoteMintAmount, marketId, minAmount, maxAmount, url, isBurned, keypair } = input
    const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint)
    const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })

    const marketState = await baseRay.getMarketInfo(marketId).catch((getMarketInfoError) => { log({ getMarketInfoError }); return null })
    // log({marketState})
    if (!marketState) {
        return { Err: "market not found" }
    }
    const { baseMint, quoteMint } = marketState
    const txInfo = await baseRay.createPool({ baseMint, quoteMint, marketId, baseMintAmount, quoteMintAmount }, keypair.publicKey).catch((innerCreatePoolError) => { log({ innerCreatePoolError }); return null })
    if (!txInfo) return { Err: "Failed to prepare create pool transaction" }


    const createPoolRecentBlockhash = (await connection.getLatestBlockhash().catch(async () => {
        await sleep(2_000)
        return await connection.getLatestBlockhash().catch(getLatestBlockhashError => {
            log({ getLatestBlockhashError })
            return null
        })
    }))?.blockhash;
    if (!createPoolRecentBlockhash) return { Err: "Failed to prepare transaction" }
    // create pool tx msg
    const createPoolTxMsg = new web3.TransactionMessage({
        instructions: txInfo.ixs,
        payerKey: keypair.publicKey,
        recentBlockhash: createPoolRecentBlockhash
    }).compileToV0Message()
    const createPoolTx = new web3.VersionedTransaction(createPoolTxMsg)
    createPoolTx.sign([keypair, ...txInfo.signers])

    // bundling
    if (url == 'devnet') {
        const simRes = (await connection.simulateTransaction(createPoolTx))
        fs.writeFileSync('./cretePoollog.json', JSON.stringify(simRes, null, 4))
        const rawTx = createPoolTx.serialize()
        const txSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'finalized', skipPreflight: true }))
        console.log('create pool txSignature', txSignature)
    }

    const { poolId, baseAmount: initialBaseMintAmount, quoteAmount: initialQuoteMintAmount } = txInfo;

    const poolKeys = await baseRay.getPoolKeys(poolId)

    const buyTxes: VersionedTransaction[] = []

    buyTxes.push(createPoolTx)

    for (let i = 0; i < input.wallets.length; i++) {
        const wallet: Keypair = Keypair.fromSecretKey(new Uint8Array(input.wallets[i].secretkey.split(',').map(Number)))

        // buy tx
        let amountIn: TokenAmount
        let amountOut: TokenAmount
        let tokenAccountIn: web3.PublicKey
        let tokenAccountOut: web3.PublicKey
        const baseR = new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, poolKeys.baseDecimals)
        const quoteR = new Token(TOKEN_PROGRAM_ID, poolKeys.quoteMint, poolKeys.quoteDecimals)
        const poolInfo: LiquidityPoolInfo = {
            baseDecimals: poolKeys.baseDecimals,
            quoteDecimals: poolKeys.quoteDecimals,
            lpDecimals: poolKeys.lpDecimals,
            lpSupply: new BN(0),
            baseReserve: initialBaseMintAmount,
            quoteReserve: initialQuoteMintAmount,
            startTime: null as any,
            status: null as any
        }

        const amount = Math.random() * (maxAmount - minAmount) + minAmount
        amountIn = new TokenAmount(quoteR, (amount).toString(), false)
        amountOut = new TokenAmount(baseR, 0, false)
        tokenAccountOut = getAssociatedTokenAddressSync(poolKeys.baseMint, wallet.publicKey)
        tokenAccountIn = getAssociatedTokenAddressSync(poolKeys.quoteMint, wallet.publicKey)

        // const [userAccountInfo, ataInfo] = await connection.getMultipleAccountsInfo([wallet.publicKey, tokenAccountIn]).catch(() => [null, null, null])
        const buyFromPoolTxInfo = await baseRay.buyFromPool({
            amountIn, amountOut, fixedSide: 'in', poolKeys, tokenAccountIn, tokenAccountOut, user: wallet.publicKey
        }).catch((innerBuyTxError) => { log({ innerBuyTxError }); return null })
        if (!buyFromPoolTxInfo) return { Err: "Failed to create buy transaction" }

        const buyRecentBlockhash = (await connection.getLatestBlockhash().catch(async () => {
            await sleep(2_000)
            return await connection.getLatestBlockhash().catch(getLatestBlockhashError => {
                log({ getLatestBlockhashError })
                return null
            })
        }))?.blockhash;
        if (!buyRecentBlockhash) return { Err: "Failed to prepare transaction" }
        const buyTxMsg = new web3.TransactionMessage({
            instructions: buyFromPoolTxInfo.ixs,
            payerKey: wallet.publicKey,
            recentBlockhash: buyRecentBlockhash
        }).compileToV0Message()
        const buyTx = new web3.VersionedTransaction(buyTxMsg)
        buyTx.sign([wallet, ...buyFromPoolTxInfo.signers])

        if (url == 'devnet') {
            const buysimRes = (await connection.simulateTransaction(buyTx))
            console.log('provide result\n', buysimRes.value.logs?.slice(-10))
            const rawBuyTx = buyTx.serialize()
            const buyTxSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawBuyTx), { commitment: 'finalized' }))
            log('provide Signature', buyTxSignature)
        }
        buyTxes.push(buyTx)
    }

    if (isBurned && url == 'devnet') {

        const lpAccount = getAssociatedTokenAddressSync(poolKeys.lpMint, keypair.publicKey)
        const lpAmount = await connection.getTokenAccountBalance(lpAccount, 'confirmed')
        const amount = calcNonDecimalValue(lpAmount.value?.uiAmount!, poolKeys.lpDecimals)

        const burnLpTokenInx = createBurnInstruction(lpAccount, poolKeys.lpMint, keypair.publicKey, amount)

        // burn lp token tx msg
        const burnLpTokenRecentBlockhash = (await connection.getLatestBlockhash().catch(async () => {
            await sleep(2_000)
            return await connection.getLatestBlockhash().catch(getLatestBlockhashError => {
                log({ getLatestBlockhashError })
                return null
            })
        }))?.blockhash;
        if (!burnLpTokenRecentBlockhash) return { Err: "Failed to prepare transaction" }

        const updateCPIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 })
        const updateCLIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 })

        const burnLpTokenTxMsg = new web3.TransactionMessage({
            instructions: [updateCPIx, updateCLIx, burnLpTokenInx],
            payerKey: keypair.publicKey,
            recentBlockhash: burnLpTokenRecentBlockhash
        }).compileToV0Message()

        const burnLpTokenTx = new web3.VersionedTransaction(burnLpTokenTxMsg)
        burnLpTokenTx.sign([keypair, ...txInfo.signers])

        if (url == 'devnet') {
            const burnLpTokensimRes = (await connection.simulateTransaction(burnLpTokenTx))
            console.log('burn result', burnLpTokensimRes.value.logs)
            const rawBurnTx = burnLpTokenTx.serialize()
            const burnTxSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawBurnTx), { commitment: 'confirmed' }))
            log('burnTxSignature', burnTxSignature)
        }

        buyTxes.push(burnLpTokenTx)
    }

    if (url == 'mainnet') {
        const bundleTips = 2_000_000

        const bundleTxRes = await sendSimpleBundle(buyTxes, keypair, bundleTips, solanaConnection)

        let confirmCnt = 120

        for (let i = 0; i < confirmCnt; i++) {
            try {
                const currnetPoolStatus = await connection.getAccountInfo(poolId, 'finalized')
                if (currnetPoolStatus) {

                    if (isBurned) {

                        const lpAccount = getAssociatedTokenAddressSync(poolKeys.lpMint, keypair.publicKey)
                        const lpAmount = await connection.getTokenAccountBalance(lpAccount, 'confirmed')
                        const amount = calcNonDecimalValue(lpAmount.value?.uiAmount!, poolKeys.lpDecimals)

                        const burnLpTokenInx = createBurnInstruction(lpAccount, poolKeys.lpMint, keypair.publicKey, amount)

                        // burn lp token tx msg
                        const burnLpTokenRecentBlockhash = (await connection.getLatestBlockhash().catch(async () => {
                            await sleep(2_000)
                            return await connection.getLatestBlockhash().catch(getLatestBlockhashError => {
                                log({ getLatestBlockhashError })
                                return null
                            })
                        }))?.blockhash;
                        if (!burnLpTokenRecentBlockhash) return { Err: "Failed to prepare transaction" }

                        const updateCPIx = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_000_000 })
                        const updateCLIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 })

                        const burnLpTokenTxMsg = new web3.TransactionMessage({
                            instructions: [updateCPIx, updateCLIx, burnLpTokenInx],
                            payerKey: keypair.publicKey,
                            recentBlockhash: burnLpTokenRecentBlockhash
                        }).compileToV0Message()

                        const burnLpTokenTx = new web3.VersionedTransaction(burnLpTokenTxMsg)
                        burnLpTokenTx.sign([keypair, ...txInfo.signers])

                        const burnLpTokensimRes = (await connection.simulateTransaction(burnLpTokenTx))
                        console.log('burn result', burnLpTokensimRes.value.logs)
                        const rawBurnTx = burnLpTokenTx.serialize()
                        const burnTxSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawBurnTx), { commitment: 'confirmed' }))
                        log('burnTxSignature', burnTxSignature)

                    }

                    return {
                        Ok: {
                            bundleId: bundleTxRes.Ok,
                            poolId: poolId.toBase58(),
                            baseVault: poolKeys.baseVault.toString(),
                            quoteVault: poolKeys.quoteVault.toString(),
                            lpMint: poolKeys.lpMint.toString(),
                            lpCault: poolKeys.lpVault.toString()
                        }
                    }
                } else {
                    await sleep(500)
                }
            } catch (e) {

            }
        }

        return {
            Err: {
                bundleId: bundleTxRes?.Ok,
                poolId: poolId.toBase58(),
                baseVault: poolKeys.baseVault.toString(),
                quoteVault: poolKeys.quoteVault.toString(),
                lpMint: poolKeys.lpMint.toString(),
                lpCault: poolKeys.lpVault.toString()
            }
        }
    } else {
        return {
            Ok: {
                poolId: poolId.toBase58(),
                baseVault: poolKeys.baseVault.toString(),
                quoteVault: poolKeys.quoteVault.toString(),
                lpMint: poolKeys.lpMint.toString(),
                lpCault: poolKeys.lpVault.toString()
            }
        }
    }
}

export async function swap(input: SwapInput): Promise<Result<{ txSignature: string }, string>> {
    if (input.sellToken) {
        if (input.sellToken == 'base') {
            input.buyToken = "quote"
        } else {
            input.buyToken = "base"
        }
    }
    const user = input.keypair.publicKey
    const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
    const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
    const slippage = input.slippage
    const poolKeys = await baseRay.getPoolKeys(input.poolId).catch(getPoolKeysError => { log({ getPoolKeysError }); return null })
    if (!poolKeys) { return { Err: "Pool info not found" } }

    const { amount, amountSide, buyToken, } = input
    // console.log('tx handler swap input', amount, amountSide, buyToken)
    const swapAmountInfo = await baseRay.computeBuyAmount({
        amount, buyToken, inputAmountType: amountSide, poolKeys, user, slippage
    }).catch((computeBuyAmountError => log({ computeBuyAmountError })))

    if (!swapAmountInfo) return { Err: "failed to calculate the amount" }

    const { amountIn, amountOut, fixedSide, tokenAccountIn, tokenAccountOut } = swapAmountInfo

    const txInfo = await baseRay.buyFromPool({ amountIn, amountOut, fixedSide, poolKeys, tokenAccountIn, tokenAccountOut, user }).catch(buyFromPoolError => { log({ buyFromPoolError }); return null })
    if (!txInfo) return { Err: "failed to prepare swap transaction" }
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const txMsg = new web3.TransactionMessage({
        instructions: txInfo.ixs,
        payerKey: user,
        recentBlockhash,
    }).compileToV0Message()
    const tx = new web3.VersionedTransaction(txMsg)
    tx.sign([input.keypair, ...txInfo.signers])
    // const buysimRes = (await connection.simulateTransaction(tx))
    // console.log('swap log', buysimRes.value.logs?.slice(-10))
    const txSignature = await sendAndConfirmTransaction(tx, connection).catch((sendAndConfirmTransactionError) => {
        console.log("Failed to send transaction")
        log({ sendAndConfirmTransactionError })
        return null
    })
    console.log(`swap sig -> ${txSignature}`)
    // const txSignature = await connection.sendTransaction(tx).catch((error) => { log({ createPoolTxError: error }); return null });
    if (!txSignature) {
        return { Err: "Failed to send transaction" }
    }
    return {
        Ok: {
            txSignature,
        }
    }
}

// export async function unwrapSol(url: 'mainnet' | 'devnet') {
//     const user = keypair.publicKey
//     const connection = new web3.Connection(url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
//     const ata = getAssociatedTokenAddressSync(NATIVE_MINT, user)
//     const ix = createCloseAccountInstruction(ata, user, user)
//     // speedup
//     const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
//     const tx = new web3.Transaction().add(updateCuIx, ix)
//     tx.feePayer = keypair.publicKey
//     tx.recentBlockhash = recentBlockhash
//     tx.sign(keypair)
//     const rawTx = tx.serialize()
//     const txSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
//         .catch(async () => {
//             await sleep(500)
//             return await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
//                 .catch((createPoolAndBuyTxFail) => {
//                     log({ createPoolAndBuyTxFail })
//                     return null
//                 })
//         }))
//     if (!txSignature) log("Tx failed")
//     log("Transaction successfull\nTx Signature: ", txSignature)
// }

// export async function mintTo(input: { token: web3.PublicKey, amount: number, url: 'mainnet' | 'devnet' }) {
//     const { token, url, amount } = input
//     const user = keypair.publicKey
//     const connection = new web3.Connection(url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
//     const baseSpl = new BaseSpl(connection)
//     const ixs = await baseSpl.getMintToInstructions({ mint: token, mintAuthority: user, amount, init_if_needed: true })
//     const tx = new web3.Transaction().add(...ixs)
//     // const res = await connection.scendTransaction(tx, [keypair]).catch((txError) => { log({ txError }); return null })
//     const res = await sendAndConfirmTransaction(tx, connection).catch(sendAndConfirmTransactionError => {
//         log({ sendAndConfirmTransactionError })
//         return null
//     })
//     if (!res) log("Tx failed")
//     log("Transaction successfull\nTx Signature: ", res)
// }

// export async function revokeAuthority(input: { token: web3.PublicKey, url: 'mainnet' | 'devnet' }) {
//     const { token, url } = input;
//     const user = keypair.publicKey
//     const wallet = new Wallet(keypair)
//     const connection = new web3.Connection(url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint, { commitment: "confirmed" })
//     const baseSpl = new BaseSpl(connection)
//     const baseMpl = new BaseMpl(wallet, { endpoint: connection.rpcEndpoint })
//     const [mintAccountInfo, metadataAccountInfo] = await connection.getMultipleAccountsInfo([token, BaseMpl.getMetadataAccount(token)]).catch(error => [null, null])
//     if (!mintAccountInfo) {
//         log("Token not found")
//         return
//     }
//     const ixs: web3.TransactionInstruction[] = []
//     const mintInfo = MintLayout.decode(mintAccountInfo.data);
//     if (mintInfo.mintAuthority.toBase58() == user.toBase58() && mintInfo.mintAuthorityOption == 1) {
//         ixs.push(baseSpl.revokeAuthority({ authorityType: 'MINTING', currentAuthority: user, mint: token }))
//     } else {
//         if (mintInfo.mintAuthorityOption == 0) {
//             log("Minting authority already been revoked")
//         } else {
//             log("You don't have minting authority")
//         }
//     }
//     if (mintInfo.freezeAuthority.toBase58() == user.toBase58() && mintInfo.freezeAuthorityOption == 1) {
//         ixs.push(baseSpl.revokeAuthority({ authorityType: 'FREEZING', currentAuthority: user, mint: token }))
//     } else {
//         if (mintInfo.freezeAuthorityOption == 0) {
//             log("Freezing authority already been revoked")
//         } else {
//             log("You don't have freezing authority")
//         }
//     }

//     if (metadataAccountInfo) {
//         const metadataInfo = Metadata.deserialize(metadataAccountInfo.data)[0]
//         const metadataUpdateAuthStr = metadataInfo.updateAuthority.toBase58();
//         if (metadataUpdateAuthStr == user.toBase58() && metadataInfo.isMutable) {
//             ixs.push(baseMpl.getRevokeMetadataAuthIx(token, user))
//         } else if (!metadataInfo.isMutable) {
//             log('Update authority already been revoked')
//         } else {
//             log("You don't have metadata update authority")
//         }
//     }

//     if (ixs.length == 0) {
//         log("All authority are revoked")
//         return
//     }

//     // speedup
//     const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
//     const tx = new web3.Transaction().add(updateCuIx, ...ixs)
//     tx.feePayer = keypair.publicKey
//     tx.recentBlockhash = recentBlockhash
//     tx.sign(keypair)

//     console.log("SENDING REVOKE TX")
//     const txSignature = await connection.sendTransaction(tx, [keypair], { skipPreflight: true })
//     console.log("AWAITING REVOKE TX")
//     await connection.confirmTransaction(txSignature)
//     console.log("CONFIRMED REVOKE TX")
// }

// export async function createAndBuy(input: CreateAndBuy): Promise<Result<{
//     bundleId: string;
//     poolId: string;
//     createPoolTxSignature: string;
//     buyTxSignature: string;
//     bundleStatus: number;
// }, { bundleId: string, poolId: string } | string>> {
//     let { baseMintAmount, quoteMintAmount, marketId } = input
//     const user = keypair.publicKey
//     const connection = new web3.Connection(input.url == 'mainnet' ? solanaConnection.rpcEndpoint : devConnection.rpcEndpoint)
//     const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
//     const marketState = await baseRay.getMarketInfo(marketId).catch((getMarketInfoError) => { log({ getMarketInfoError }); return null })
//     if (!marketState) {
//         return { Err: "market not found" }
//     }
//     const { baseMint, quoteMint } = marketState
//     log({
//         baseToken: baseMint.toBase58(),
//         quoteToken: quoteMint.toBase58(),
//     })
//     const createPoolTxInfo = await baseRay.createPool({ baseMint, quoteMint, marketId, baseMintAmount, quoteMintAmount }, keypair.publicKey).catch((innerCreatePoolError) => { log({ innerCreatePoolError }); return null })
//     if (!createPoolTxInfo) return { Err: "Failed to prepare create pool transaction" }

//     //buy
//     const { poolId, baseAmount: initialBaseMintAmount, quoteAmount: initialQuoteMintAmount } = createPoolTxInfo;
//     const poolKeys = await baseRay.getPoolKeys(poolId)
//     let amountIn: TokenAmount
//     let amountOut: TokenAmount
//     let tokenAccountIn: web3.PublicKey
//     let tokenAccountOut: web3.PublicKey
//     const baseR = new Token(TOKEN_PROGRAM_ID, poolKeys.baseMint, poolKeys.baseDecimals)
//     const quoteR = new Token(TOKEN_PROGRAM_ID, poolKeys.quoteMint, poolKeys.quoteDecimals)
//     const poolInfo: LiquidityPoolInfo = {
//         baseDecimals: poolKeys.baseDecimals,
//         quoteDecimals: poolKeys.quoteDecimals,
//         lpDecimals: poolKeys.lpDecimals,
//         lpSupply: new BN(0),
//         baseReserve: initialBaseMintAmount,
//         quoteReserve: initialQuoteMintAmount,
//         startTime: null as any,
//         status: null as any
//     }
//     const { buyToken: buyTokenType, buyAmount } = input
//     let poolSolFund = 0;
//     if (baseMint.toBase58() == NATIVE_MINT.toBase58() || quoteMint.toBase58() == NATIVE_MINT.toBase58()) {
//         if (baseMint.toBase58() == NATIVE_MINT.toBase58()) {
//             poolSolFund = input.baseMintAmount
//         } else {
//             poolSolFund = input.quoteMintAmount
//         }
//     }
//     if (buyTokenType == 'base') {
//         amountOut = new TokenAmount(baseR, buyAmount.toString(), false)
//         amountIn = Liquidity.computeAmountIn({ amountOut, currencyIn: quoteR, poolInfo, poolKeys, slippage: new Percent(1, 100) }).maxAmountIn as TokenAmount
//         tokenAccountOut = getAssociatedTokenAddressSync(poolKeys.baseMint, user)
//         tokenAccountIn = getAssociatedTokenAddressSync(poolKeys.quoteMint, user)
//         const [userAccountInfo, ataInfo] = await connection.getMultipleAccountsInfo([user, tokenAccountIn]).catch(() => [null, null, null])
//         if (!userAccountInfo) return { Err: "wallet dosen't have enought Sol to create pool" }
//         const balance = calcDecimalValue(userAccountInfo.lamports, 9)
//         if (balance < poolSolFund) return { Err: "wallet dosen't have enought Sol to create pool" }
//         let minRequiredBuyerBalance = poolSolFund
//         if (amountIn.token.mint.toBase58() == NATIVE_MINT.toBase58()) {
//             minRequiredBuyerBalance += calcDecimalValue(amountIn.raw.toNumber(), 9)
//             if (balance < minRequiredBuyerBalance) return { Err: "Second wallet dosen't have enought Sol to buy the tokens" }
//         } else {
//             log("else")
//             if (!ataInfo) return { Err: "Second wallet dosen't have enought fund to buy another token" }
//             const tokenBalance = Number(AccountLayout.decode(ataInfo.data).amount.toString())
//             if (tokenBalance < amountIn.raw.toNumber()) {
//                 return { Err: "Second wallet dosen't have enought fund to buy another token" }
//             }
//         }
//     } else {
//         amountOut = new TokenAmount(quoteR, buyAmount.toString(), false)
//         amountIn = Liquidity.computeAmountIn({ amountOut, currencyIn: baseR, poolInfo, poolKeys, slippage: new Percent(1, 100) }).maxAmountIn as TokenAmount
//         tokenAccountOut = getAssociatedTokenAddressSync(poolKeys.quoteMint, user)
//         tokenAccountIn = getAssociatedTokenAddressSync(poolKeys.baseMint, user)
//         const [userAccountInfo, ataInfo] = await connection.getMultipleAccountsInfo([user, tokenAccountIn]).catch(() => [null, null])
//         if (!userAccountInfo) return { Err: "wallet dosen't have enought Sol to create pool" }
//         const balance = calcDecimalValue(userAccountInfo.lamports, 9)
//         if (balance < poolSolFund) return { Err: "wallet dosen't have enought Sol to create pool" }
//         let minRequiredBuyerBalance = poolSolFund
//         if (amountIn.token.mint.toBase58() == NATIVE_MINT.toBase58()) {
//             minRequiredBuyerBalance += calcDecimalValue(amountIn.raw.toNumber(), 9)
//             if (balance < minRequiredBuyerBalance) return { Err: "Second wallet dosen't have enought Sol to buy or distribute the tokens" }
//         } else {
//             log("else")
//             if (!ataInfo) return { Err: "Second wallet dosen't have enought fund to buy another token" }
//             const tokenBalance = Number(AccountLayout.decode(ataInfo.data).amount.toString())
//             if (tokenBalance < amountIn.raw.toNumber()) {
//                 return { Err: "Second wallet dosen't have enought fund to buy another token" }
//             }
//         }
//     }
//     const buyFromPoolTxInfo = await baseRay.buyFromPool({
//         amountIn, amountOut, fixedSide: 'out', poolKeys, tokenAccountIn, tokenAccountOut, user: user
//     }).catch((innerBuyTxError) => { log({ innerBuyTxError }); return null })
//     if (!buyFromPoolTxInfo) return { Err: "Failed to create buy transaction" }

//     const createPoolRecentBlockhash = (await connection.getLatestBlockhash().catch(async () => {
//         await sleep(2_000)
//         return await connection.getLatestBlockhash().catch(getLatestBlockhashError => {
//             log({ getLatestBlockhashError })
//             return null
//         })
//     }))?.blockhash;
//     if (!createPoolRecentBlockhash) return { Err: "Failed to prepare transaction" }
//     const createPoolTxMsg = new web3.TransactionMessage({
//         instructions: createPoolTxInfo.ixs,
//         payerKey: keypair.publicKey,
//         recentBlockhash: createPoolRecentBlockhash
//     }).compileToV0Message()
//     const createPoolTx = new web3.VersionedTransaction(createPoolTxMsg)
//     createPoolTx.sign([keypair, ...createPoolTxInfo.signers])

//     await sleep(1_000)
//     const buyRecentBlockhash = (await connection.getLatestBlockhash().catch(async () => {
//         await sleep(2_000)
//         return await connection.getLatestBlockhash().catch(getLatestBlockhashError => {
//             log({ getLatestBlockhashError })
//             return null
//         })
//     }))?.blockhash;
//     if (!buyRecentBlockhash) return { Err: "Failed to prepare transaction" }
//     const buyTxMsg = new web3.TransactionMessage({
//         instructions: buyFromPoolTxInfo.ixs,
//         payerKey: user,
//         recentBlockhash: buyRecentBlockhash
//     }).compileToV0Message()
//     const buyTx = new web3.VersionedTransaction(buyTxMsg)
//     buyTx.sign([keypair])

//     // {
//     //     const createPoolRes = await connection.sendTransaction(createPoolTx)
//     //     log({ createPoolRes })
//     //     await sleep(4_000)
//     //     const buyTxRes = await connection.sendTransaction(buyTx)
//     //     log({ buyTxRes })
//     // }

//     const bundleTips = 5_000_000
//     const bundleTxRes = await sendBundle([createPoolTx, buyTx], keypair, bundleTips, connection).catch(async () => {
//         return null
//     }).then(async (res) => {
//         if (res === null || typeof res.Err == 'string') {
//             await sleep(2_000)
//             return await sendBundle([createPoolTx, buyTx], keypair, bundleTips, connection).catch((sendBundleError) => {
//                 log({ sendBundleError })
//                 return null
//             })
//         }
//         return res
//     })
//     if (!bundleTxRes) {
//         return { Err: "Failed to send the bundle" }
//     }
//     if (bundleTxRes.Ok) {
//         const { bundleId, bundleStatus, txsSignature } = bundleTxRes.Ok
//         const createPoolTxSignature = txsSignature[0]
//         const buyTxSignature = txsSignature[1]
//         if (!createPoolTxSignature || !buyTxSignature) return { Err: { bundleId, poolId: poolId.toBase58() } }
//         return {
//             Ok: {
//                 bundleId,
//                 poolId: poolId.toBase58(),
//                 createPoolTxSignature,
//                 buyTxSignature,
//                 bundleStatus,
//             }
//         }
//     } else if (bundleTxRes.Err) {
//         console.log({ bundleTxRes })
//         const Err = bundleTxRes.Err
//         if (typeof Err == 'string') {
//             return { Err }
//         } else {
//             return {
//                 Err: {
//                     bundleId: Err.bundleId,
//                     poolId: poolId.toBase58(),
//                 }
//             }
//         }
//     }
//     return { Err: "Failed to send the bundle" }
// }

export async function sendSimpleBundle(txs: web3.VersionedTransaction[], feePayerAuthority: web3.Keypair, bundleTips: number, connection: web3.Connection) {
    const jito_auth_keypair_array = JITO_AUTH_KEYPAIR.split(',')
    const keyapair_num = Math.floor(Math.random() * jito_auth_keypair_array.length)
    const jito_auth_keypair = jito_auth_keypair_array[keyapair_num]
    const jitoKey = Keypair.fromSecretKey(base58.decode(jito_auth_keypair))

    const blochengine_url_array = BLOCKENGINE_URL.split(',')
    const blockengine_num = Math.floor(Math.random() * blochengine_url_array.length)
    const blochengine_url = blochengine_url_array[blockengine_num]

    const jitoClient = searcherClient(blochengine_url, jitoKey)
    const jitoTipAccounts = await jitoClient.getTipAccounts().catch(getTipAccountsError => { log({ getTipAccountsError }); return null });
    if (!jitoTipAccounts) return { Err: "Unable to prepare the bunde transaction" }
    const jitoTipAccount = new web3.PublicKey(
        jitoTipAccounts[Math.floor(Math.random() * jitoTipAccounts.length)]
    );
    // log("tip Account: ", jitoTipAccount.toBase58())
    const jitoLeaderNextSlot = (await jitoClient.getNextScheduledLeader().catch(getNextScheduledLeaderError => { log({ getNextScheduledLeaderError }); return null }))?.nextLeaderSlot;
    if (!jitoLeaderNextSlot) return { Err: "Unable to prepare the bunde transaction" }
    // log("jito LedgerNext slot", jitoLeaderNextSlot)
    const recentBlockhash = (await (connection.getLatestBlockhash())).blockhash
    let b = new bundle.Bundle(txs, txs.length + 1).addTipTx(
        feePayerAuthority,
        bundleTips,
        jitoTipAccount,
        recentBlockhash
    )
    if (isError(b)) {
        log({ bundleError: b })
        return { Err: "Failed to prepare the bunde transaction" }
    }
    const bundleId = await jitoClient.sendBundle(b)
    return { Ok: bundleId }
}

// export async function sendBundle(txs: web3.VersionedTransaction[], feePayerAuthority: web3.Keypair, bundleTips: number, connection: web3.Connection): Promise<Result<{
//     bundleId: string, txsSignature: string[], bundleStatus: number
// }, { bundleId: string } | string>> {
//     const jito_auth_keypair_array = JITO_AUTH_KEYPAIR.split(',')
//     const keyapair_num = Math.floor(Math.random() * jito_auth_keypair_array.length)
//     const jito_auth_keypair = jito_auth_keypair_array[keyapair_num]
//     const jitoKey = Keypair.fromSecretKey(base58.decode(jito_auth_keypair))

//     const blochengine_url_array = BLOCKENGINE_URL.split(',')
//     const blockengine_num = Math.floor(Math.random() * blochengine_url_array.length)
//     const blochengine_url = blochengine_url_array[blockengine_num]

//     const jitoClient = searcherClient(blochengine_url, jitoKey)
//     const jitoTipAccounts = await jitoClient.getTipAccounts().catch(getTipAccountsError => { log({ getTipAccountsError }); return null });
//     if (!jitoTipAccounts) return { Err: "Unable to prepare the bunde transaction" }
//     const jitoTipAccount = new web3.PublicKey(
//         jitoTipAccounts[Math.floor(Math.random() * jitoTipAccounts.length)]
//     );
//     // log("tip Account: ", jitoTipAccount.toBase58())
//     const jitoLeaderNextSlot = (await jitoClient.getNextScheduledLeader().catch(getNextScheduledLeaderError => { log({ getNextScheduledLeaderError }); return null }))?.nextLeaderSlot;
//     if (!jitoLeaderNextSlot) return { Err: "Unable to prepare the bunde transaction" }
//     // log("jito LedgerNext slot", jitoLeaderNextSlot)
//     const recentBlockhash = (await (connection.getLatestBlockhash())).blockhash
//     let b = new bundle.Bundle(txs, txs.length + 1).addTipTx(
//         feePayerAuthority,
//         bundleTips,
//         jitoTipAccount,
//         recentBlockhash
//     )
//     if (b instanceof Error) {
//         log({ bundleError: b })
//         return { Err: "Failed to prepare the bunde transaction" }
//     }
//     const bundleId = await jitoClient.sendBundle(b).catch(async () => {
//         await sleep(3_000)
//         return await jitoClient.sendBundle(b as any).catch((sendBunderError) => {
//             log({ sendBunderError })
//             return null
//         })
//     })
//     console.log("🚀 ~ sendBundle ~ bundleId:", bundleId)
//     if (!bundleId) {
//         return { Err: "Bundle transaction failed" }
//     }
//     // const bundleId = "6f2145c078bf21e7d060d348ff785a42da3546a69ee2201844c9218211360c0d"
//     await sleep(5_000)
//     const bundleRes = await getBundleInfo(bundleId).catch(async () => {
//         await sleep(5_000)
//         return await getBundleInfo(bundleId).catch((getBundleInfoError) => {
//             log({ getBundleInfoError })
//             return null
//         })
//     })
//     if (bundleRes === undefined) {
//         //TODO: Bundle failed
//         return { Err: { bundleId } }
//     }
//     if (!bundleRes) {
//         return { Err: { bundleId } }
//     }
//     const { transactions, status } = bundleRes;
//     if (!transactions || !status) {
//         return { Err: { bundleId } }
//     }
//     return {
//         Ok: {
//             bundleId,
//             bundleStatus: status,
//             txsSignature: transactions
//         }
//     }
// }

// export async function getBundleInfo(bundleId: string): Promise<BundleRes> {
//     const bundleRes = await fetch("https://explorer.jito.wtf/api/graphqlproxy", {
//         "headers": {
//             "accept": "*/*",
//             "accept-language": "en-GB,en;q=0.5",
//             "content-type": "application/json",
//             "Referer": `https://explorer.jito.wtf/bundle/${bundleId}`
//         },
//         "body": `{\"operationName\":\"getBundleById\",\"variables\":{\"id\":\"${bundleId}\"},\"query\":\"query getBundleById($id: String!) {\\n  getBundle(req: {id: $id}) {\\n    bundle {\\n      uuid\\n      timestamp\\n      validatorIdentity\\n      transactions\\n      slot\\n      status\\n      landedTipLamports\\n      signer\\n      __typename\\n    }\\n    __typename\\n  }\\n}\"}`,
//         "method": "POST"
//     });
//     const bundleResJ = await bundleRes.json()
//     return bundleResJ?.data?.getBundle?.bundle
// }
