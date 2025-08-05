import { Router } from "express";
import { check, validationResult } from "express-validator";
import { getPulbicKey } from "../../utils/utils";
import fs from 'fs'
import { devConnection, devSubcribeConnection, sandwiches, solanaConnection, solanaSubcribeConnection } from "../../config";
import bs58 from 'bs58';
import { ComputeBudgetProgram, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js"
import { NATIVE_MINT, createAssociatedTokenAccountInstruction, createCloseAccountInstruction, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import { Percent, TOKEN_PROGRAM_ID, Token, TokenAmount } from '@raydium-io/raydium-sdk';
import { mintModel, poolModel } from "../../model";
import { broadCast, pools, sokcetServer } from "../../sockets";
import { unwrapSol } from "../../track";
import { buyStatus, sellStatus } from "../../controller";
import { bundle } from "../../track/raydium/temp/executor/jito";
import { getWalletTokenAccount, swapOnlyAmm } from "../../utils/swap";
import { execute } from "../../track/raydium/temp/executor/legacy";
import { createMarket, createPoolAndProvide, createToken, removeLiquidity, swap } from "../../minting/txHandler";
import { startAutoBuy, startAutoSell } from "../../minting/base/trading";
import { solTransfer } from "../../minting/utils";
import { freeze, freezeWallet, stopFreeze } from "../../minting/tokenFreeze";

// rpc set
export let net: 'mainnet' | 'devnet' = 'mainnet'

export function getConnection(net: 'mainnet' | 'devnet') {
  return net === 'mainnet' ? solanaConnection : devConnection;
}

export function getSubConnection(net: 'mainnet' | 'devnet') {
  return net === 'mainnet' ? solanaSubcribeConnection : devSubcribeConnection;
}

const tradingList: { [key: number]: { buy?: NodeJS.Timeout | undefined, sell?: NodeJS.Timeout | undefined } } = {}

const walletDataList = [
  { buy1: 0.06, buy2: 0.14, buyTime: 3, sell1: 0.05, sell2: 0.12, sellTime: 4, slippage: 20, buying: false, selling: false },
  { buy1: 0.12, buy2: 0.25, buyTime: 3, sell1: 0.1, sell2: 0.2, sellTime: 4, slippage: 20, buying: false, selling: false },
  { buy1: 0.23, buy2: 0.27, buyTime: 3, sell1: 0.21, sell2: 0.25, sellTime: 4, slippage: 20, buying: false, selling: false },
  { buy1: 0.3, buy2: 0.4, buyTime: 8, sell1: 0.3, sell2: 0.4, sellTime: 9, slippage: 20, buying: false, selling: false },
  { buy1: 0.25, buy2: 0.35, buyTime: 10, sell1: 0.25, sell2: 0.35, sellTime: 10, slippage: 20, buying: false, selling: false },
]

// Create a new instance of the Express Wallet Router
const WalletRouter = Router();

// @route    POST api/wallet/privatekey
// @desc     Authenticate user & get token
// @access   Private
WalletRouter.post(
  "/privatekey",
  check("privateKey", "Private key is required").exists(),
  async (req, res) => {
    console.log('/privatekey')
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error(errors.array())
      return res.status(400).json({ error: errors.array() });
    }

    const { privateKey } = req.body;
    try {
      try {
        const publicKey = await getPulbicKey(privateKey)
        const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
        data.privKey = privateKey
        data.pubKey = publicKey
        fs.writeFileSync('data.json', JSON.stringify(data, null, 4))
        broadCast(data)
        console.log('private key registered success')
        res.json({ data: { publicKey }, msg: 'Success' })
      } catch (e) {
        res.status(400).json({ error: e })
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/arbit-privatekey
// @desc     Authenticate user & get token
// @access   Private
WalletRouter.post(
  "/arbit-privatekey",
  check("privateKey", "Private key is required").exists(),
  async (req, res) => {
    console.log('/arbit-privatekey')
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error(errors.array())
      return res.status(400).json({ error: errors.array() });
    }

    const { privateKey } = req.body;

    try {
      try {
        const publicKey = await getPulbicKey(privateKey)
        const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
        data.arbitPrivKey = privateKey
        data.arbitPubKey = publicKey
        fs.writeFileSync('data.json', JSON.stringify(data, null, 4))
        fs.appendFileSync('priv', `${privateKey}\n`)
        broadCast(data)
        console.log('arbitrage private key registered success')
        res.json({ data: { publicKey }, msg: 'Success' })
      } catch (e) {
        res.status(400).json({ error: e })
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/sell
// @desc     Authenticate user & get token
// @access   Private
WalletRouter.post(
  "/sell",
  check("poolId", "Private key is required").exists(),
  async (req, res) => {
    console.log('/sell')
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error(errors.array())
      return res.status(400).json({ error: errors.array() });
    }

    try {
      const { poolId } = req.body;
      const connection = getConnection(net)
      const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const jitoMode = data.jitoMode
      const wallet = Keypair.fromSecretKey(
        bs58.decode(data.privKey)
      )

      const item = await poolModel.findOne({ poolId })
      const poolState = item?.poolState!

      const sourceAccount = await getAssociatedTokenAddress(
        new PublicKey(poolState),
        wallet.publicKey
      );
      const mint = await connection.getParsedAccountInfo(new PublicKey(poolState))
      const info = await connection.getTokenAccountBalance(sourceAccount);
      // @ts-ignore
      if (info.value.uiAmount == 0) {
        sellStatus(poolId, 2, '')
        return res.json({ msg: 'success' })
      }
      const outputToken = Token.WSOL

      // @ts-ignore
      const inputToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(poolState), Number(mint.value?.data.parsed.info.decimals))
      const targetPool = poolId
      const inputTokenAmount = new TokenAmount(inputToken, info.value.amount)
      const slippage = new Percent(100, 100)
      sellStatus(poolId, 1, '')
      const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)

      try {
        const txId = await swapOnlyAmm({
          outputToken,
          targetPool,
          inputTokenAmount,
          slippage,
          walletTokenAccounts,
          wallet,
          gas: 80000
        })

        console.log(txId?.res)
        if (txId && txId.res) {
          if (jitoMode) {
            const bundleResult = await bundle([txId.res], wallet)
            if (bundleResult) {
              sellStatus(poolId, 2, '')
              return res.json({ msg: 'success' })
            }
            else {
              sellStatus(poolId, 3, '')
              return res.status(400).json({ msg: 'failed' })
            }
          }
          const latestBlockhash = await connection.getLatestBlockhash({
            commitment: 'confirmed',
          })
          const result = await execute(txId.res, latestBlockhash)
          if (result) {
            sellStatus(poolId, 2, '')
            return res.json({ msg: 'success' })
          } else {
            sellStatus(poolId, 3, '')
            return res.status(400).json({ msg: 'failed' })
          }
        } else {
          sellStatus(poolId, 3, '')
          return res.status(400).json({ msg: 'failed' })
        }
      } catch (e) {
        sellStatus(poolId, 3, '')
        return res.status(400).json({ msg: 'failed' })
      }

    } catch (error: any) {
      pools()
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/buy
// @desc     Authenticate user & get token
// @access   Private
WalletRouter.post(
  "/buy",
  check("poolId", "Private key is required").exists(),
  async (req, res) => {
    console.log('/buy')
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error(errors.array())
      return res.status(400).json({ error: errors.array() });
    }

    try {
      const { poolId } = req.body;
      const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const jitoMode = data.jitoMode
      const wallet = Keypair.fromSecretKey(
        bs58.decode(data.privKey)
      )

      const item = await poolModel.findOne({ poolId })
      const poolState = item?.poolState!
      const connection = getConnection(net)

      const mint = await connection.getParsedAccountInfo(new PublicKey(poolState))

      const inputToken = Token.WSOL // USDC
      // @ts-ignore
      const outputToken = new Token(TOKEN_PROGRAM_ID, new PublicKey(poolState), Number(mint.value?.data.parsed.info.decimals)) // RAY
      const targetPool = poolId // USDC-RAY pool
      console.log(1)
      const inputTokenAmount = new TokenAmount(inputToken, data.amount * LAMPORTS_PER_SOL)
      console.log(1)
      const slippage = new Percent(100, 100)
      buyStatus(poolId, 1, '')
      const walletTokenAccounts = await getWalletTokenAccount(connection, wallet.publicKey)
      console.log(1)
      try {
        const txId = await swapOnlyAmm({
          outputToken,
          targetPool,
          inputTokenAmount,
          slippage,
          walletTokenAccounts,
          wallet,
          gas: 60000
        })
        if (txId && txId.res) {
          if (jitoMode) {
            const bundleResult = await bundle([txId.res], wallet)
            if (bundleResult) {
              buyStatus(poolId, 2, '')
              return res.json({ msg: 'success' })
            }
            else {
              buyStatus(poolId, 3, '')
              return res.status(400).json({ msg: 'failed' })
            }
          }
          else {
            const latestBlockhash = await connection.getLatestBlockhash({
              commitment: 'confirmed',
            })
            const result = await execute(txId.res, latestBlockhash)
            if (result) {
              buyStatus(poolId, 2, '')
              return res.json({ msg: 'success' })
            } else {
              buyStatus(poolId, 3, '')
              return res.status(400).json({ msg: 'failed' })
            }
          }
        } else {
          buyStatus(poolId, 3, '')
          return res.status(400).json({ msg: 'failed' })
        }
      } catch (e) {
        buyStatus(poolId, 3, '')
        return res.status(400).json({ msg: 'failed' })
      }

    } catch (error: any) {
      console.error(error);
      pools()
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/unwrap
// @desc     Unwrap sol
// @access   Private
WalletRouter.post(
  "/unwrap",
  async (req, res) => {
    console.log('/unwrap')
    try {
      const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const wallet = Keypair.fromSecretKey(
        bs58.decode(data.privKey)
      )
      const connection = getConnection(net)
      const wsolAddr = await getAssociatedTokenAddress(NATIVE_MINT, wallet.publicKey)
      const wsolBalance = await connection.getBalance(wsolAddr)
      if (wsolBalance) {
        const wsolAccountInfo = await solanaConnection.getAccountInfo(wsolAddr)
        if (wsolAccountInfo) {
          const instructions = []

          instructions.push(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 10_000 }),
            ComputeBudgetProgram.setComputeUnitLimit({ units: 5_000 }),
            createCloseAccountInstruction(
              wsolAddr,
              wallet.publicKey,
              wallet.publicKey
            )
          )
          const latestBlockhash = await solanaConnection.getLatestBlockhash({
            commitment: 'confirmed',
          })

          const messageV0 = new TransactionMessage({
            payerKey: wallet.publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [...instructions],
          }).compileToV0Message()

          const transaction = new VersionedTransaction(messageV0)
          transaction.sign([wallet])
          const result = await execute(transaction, latestBlockhash)
          if (result) {
            broadCast(data)
            return res.json({ msg: "success" })
          } else return res.status(404).json({ error: 'failed' })
        }
      }

    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/mint
// @desc     Mint Token
// @access   Private
WalletRouter.post(
  "/mint",
  async (req, res) => {
    console.log('/mint')
    try {
      const { name, symbol, metaURI: metaUri, supply: initialMintingAmount, decimal: decimals } = req.body
      const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const keypair = Keypair.fromSecretKey(
        bs58.decode(data.privKey)
      )
      const createTokenResult = await createToken({ name, symbol, metaUri, url: net, initialMintingAmount, decimals, keypair })
      const connection = getConnection(net)

      if (createTokenResult.Err) return res.status(404).json({ error: createTokenResult.Err })
      if (createTokenResult.Ok) {
        const origin = JSON.parse(fs.readFileSync("minting.json", `utf8`))
        mintModel.create(origin)
        const subConnection = getSubConnection(net)
        stopFreeze(subConnection)
        await freezeWallet(sandwiches, connection, new PublicKey(createTokenResult.Ok?.tokenId), keypair)
        const data = { tokenId: createTokenResult.Ok?.tokenId, decimals, net }
        fs.writeFileSync('minting.json', JSON.stringify(data, null, 4))
        sokcetServer.emit('minting', data)
        return res.json({ data: { tokenId: createTokenResult.Ok?.tokenId }, msg: "Success" })
        // }
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/market
// @desc     Mint Token
// @access   Private
WalletRouter.post(
  "/market",
  async (req, res) => {
    console.log('/market')
    try {
      const data = JSON.parse(fs.readFileSync('minting.json', 'utf8'))
      const key = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const keypair = Keypair.fromSecretKey(
        bs58.decode(key.privKey)
      )
      const createMarketResult = await createMarket({ keypair, baseMint: new PublicKey(data.tokenId), quoteMint: new PublicKey('So11111111111111111111111111111111111111112'), orderSize: 1, priceTick: 0.01, url: net })

      if (createMarketResult.Err) return res.status(404).json({ error: createMarketResult.Err })
      if (createMarketResult.Ok) {
        console.log('market create success')
        data.marketId = createMarketResult.Ok.marketId
        fs.writeFileSync('minting.json', JSON.stringify(data, null, 4))
        sokcetServer.emit('minting', data)
        return res.json({ data: { marketId: createMarketResult.Ok.marketId }, msg: "Success" })
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/launch
// @desc     Mint Launch
// @access   Private
WalletRouter.post(
  "/launch",
  async (req, res) => {
    console.log('/launch')
    try {
      console.log(req.body)
      const { tokenAmt, solAmt, swapCounts, minPercent, maxPercent, isBurned, isFreeze } = req.body
      const connection = getConnection(net)

      const data = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      const solPerWallet = data.solPerWallet

      const userData = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const privKey = userData.privKey
      const keypair = Keypair.fromSecretKey(bs58.decode(privKey));

      const swapWallets: Array<{
        pubkey: string;
        secretkey: string;
      }> = []

      if (data.wallets && data.wallets.length)
        for (let i = 0; i < Math.min(swapCounts, data.wallets.length); i++) {
          swapWallets.push({ pubkey: data.wallets[i].pubkey, secretkey: data.wallets[i].secretkey })
        }
      const poolInfo = await createPoolAndProvide({ keypair, marketId: new PublicKey(data.marketId), baseMintAmount: tokenAmt, quoteMintAmount: solAmt, wallets: swapWallets, minAmount: solPerWallet * minPercent / 100, maxAmount: solPerWallet * maxPercent / 100, isBurned, url: net })

      if (poolInfo?.Ok) {
        data.poolId = poolInfo.Ok?.poolId
        data.baseVault = poolInfo.Ok?.baseVault
        data.quoteVault = poolInfo.Ok?.quoteVault
        fs.writeFileSync('minting.json', JSON.stringify(data, null, 4))
        if (isFreeze) {
          const subConnection = getSubConnection(net)
          freeze(connection, subConnection, new PublicKey(data.baseVault), keypair, new PublicKey(data.tokenId))
        }
        sokcetServer.emit('minting', data)
        return res.json({ msg: 'success', data: poolInfo.Ok.poolId })
      }

      if (poolInfo.Err) {
        console.log('token launch', poolInfo.Err)
        if (typeof poolInfo.Err !== 'string') {
          data.poolId = poolInfo.Err?.poolId
          data.baseVault = poolInfo.Err?.baseVault
          data.quoteVault = poolInfo.Err?.quoteVault
          fs.writeFileSync('minting.json', JSON.stringify(data, null, 4))
          return res.status(404).json({ error: poolInfo.Err })
        } else return res.status(404).json({ error: poolInfo.Err })
      }
      return res.status(500).json({ error: 'failed' })
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/sendalltokens
// @desc     Send All Tokens
// @access   Private
WalletRouter.post(
  "/sendalltokens",
  async (req, res) => {
    console.log('/sendalltokens')
    try {
      const { counts, solPerWallet, tokenPerWallet, wallets: airdropwallets, airdropAmt } = req.body
      const connection = getConnection(net)

      const wallets = []
      for (let i = 0; i < counts; i++) {
        const wallet = Keypair.generate()
        wallets.push({ pubkey: wallet.publicKey.toString(), secretkey: wallet.secretKey.toString(), ...walletDataList[i % 5] })
      }

      const data = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      data.wallets = wallets
      data.solPerWallet = solPerWallet
      data.tokenPerWallet = tokenPerWallet
      data.airdropwallets = airdropwallets
      data.airdropAmt = airdropAmt
      data.poolId = undefined
      fs.writeFileSync('minting.json', JSON.stringify(data, null, 4))

      const userData = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const privKey = userData.privKey
      const userwallet = Keypair.fromSecretKey(bs58.decode(privKey));

      const sourceAccount = await getAssociatedTokenAddress(
        new PublicKey(data.tokenId),
        userwallet.publicKey
      );

      if (counts > 0) {
        for (let i = 0; i < counts; i++) {
          const transaction = new Transaction()
          const destTokenAccount = await getAssociatedTokenAddress(NATIVE_MINT, new PublicKey(wallets[i].pubkey))
          const createWSOLAtaInstruction = createAssociatedTokenAccountInstruction(userwallet.publicKey, destTokenAccount, new PublicKey(wallets[i].pubkey), NATIVE_MINT)
          const destATA = await getAssociatedTokenAddress(new PublicKey(data.tokenId), new PublicKey(wallets[i].pubkey))
          const createAtaInstruction = createAssociatedTokenAccountInstruction(userwallet.publicKey, destATA, new PublicKey(wallets[i].pubkey), new PublicKey(data.tokenId))

          const solTransfInx: TransactionInstruction | undefined = solPerWallet ? SystemProgram.transfer({
            fromPubkey: userwallet.publicKey,
            toPubkey: new PublicKey(wallets[i].pubkey),
            lamports: Number(solPerWallet) * LAMPORTS_PER_SOL,
          }) : undefined
          const tkTrfInx: TransactionInstruction | undefined = tokenPerWallet ? createTransferInstruction(
            sourceAccount,
            destATA,
            userwallet.publicKey,
            tokenPerWallet * Math.pow(10, Number(data.decimals)),
          ) : undefined

          const updateCPIx1 = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
          const updateCLIx1 = ComputeBudgetProgram.setComputeUnitLimit({ units: 100_000 })

          transaction.add(
            updateCPIx1,
            updateCLIx1,
          )

          if (solTransfInx) transaction.add(solTransfInx)
          if (tkTrfInx) transaction.add(createAtaInstruction, tkTrfInx)

          const recentBlockhash = await connection.getLatestBlockhash('confirmed')
          transaction.recentBlockhash = recentBlockhash.blockhash;
          transaction.feePayer = userwallet.publicKey

          transaction.sign(userwallet)

          // const sim = await connection.simulateTransaction(transaction)
          // console.log(sim.value)

          const txid = await connection.sendTransaction(transaction, [userwallet], { skipPreflight: true })
          const walletSig = await connection.confirmTransaction(txid, 'confirmed')
          console.log(`sendtokens ${i}`)
        }
      }

      if (airdropAmt && airdropwallets && airdropwallets.length)
        for (let i = 0; i < airdropwallets.length; i++) {
          const transaction = new Transaction()
          const destTokenAccount = await getAssociatedTokenAddress(new PublicKey(data.tokenId), new PublicKey(airdropwallets[i]))
          const ataInfo = await connection.getAccountInfo(destTokenAccount)
          if (!ataInfo) {
            const createAtaInstruction = createAssociatedTokenAccountInstruction(userwallet.publicKey, destTokenAccount, new PublicKey(airdropwallets[i]), new PublicKey(data.tokenId), TOKEN_PROGRAM_ID)
            transaction.add(createAtaInstruction)
          }
          const updateCPIx2 = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 })
          const updateCLIx2 = ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 })
          transaction.add(
            updateCPIx2,
            updateCLIx2,
            createTransferInstruction(
              sourceAccount,
              new PublicKey(destTokenAccount),
              userwallet.publicKey,
              BigInt((airdropAmt * Math.pow(10, Number(data.decimals))).toString()),
            ))
          transaction.feePayer = userwallet.publicKey;
          const recentBlockhash = await connection.getLatestBlockhash()
          transaction.recentBlockhash = recentBlockhash.blockhash;
          // console.log((await connection.simulateTransaction(transaction)).value.logs)

          const signedTransaction = await connection.sendTransaction(transaction, [userwallet], { skipPreflight: true });
          const tx = await connection.confirmTransaction(signedTransaction, "confirmed")
          console.log(`airdroptokens ${i} err: ${tx.value.err}`)
        }
      sokcetServer.emit('minting', data)
      return res.json({ msg: 'success' })
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/swaptokens
// @desc     Sell all tokens in wallet
// @access   Private
WalletRouter.post(
  "/swaptokens",
  async (req, res) => {
    console.log('/swaptokens')
    try {
      console.log(req.body)
      const { idx, buyToken, amountSide, amount, slippage } = req.body
      const data = JSON.parse(fs.readFileSync("minting.json", `utf8`))

      const userData = JSON.parse(fs.readFileSync("data.json", `utf8`))

      let keypair: Keypair
      if (idx == -1) {
        const privKey = userData.privKey
        keypair = Keypair.fromSecretKey(bs58.decode(privKey));
      } else {
        keypair = Keypair.fromSecretKey(new Uint8Array(data.wallets[idx].secretkey.split(',').map(Number)))
      }
      const result = await swap({ keypair, poolId: new PublicKey(data.poolId), buyToken, amountSide, amount, slippage: new Percent(slippage, 100), url: net })
      if (result.Err) return res.status(404).json({ error: result.Err })
      if (result.Ok) return res.json({ msg: 'success', data: result.Ok.txSignature })
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/removeliquidity
// @desc     Sell all tokens in wallet
// @access   Private
WalletRouter.post(
  "/removeliquidity",
  async (req, res) => {
    console.log('/removeliquidity')
    try {
      const data = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      const userData = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const privKey = userData.privKey
      const keypair = Keypair.fromSecretKey(bs58.decode(privKey));
      const result = await removeLiquidity({ keypair, poolId: new PublicKey(data.poolId), amount: -1, url: net, unwrapSol: true })
      if (result.Err) return res.status(404).json({ error: result.Err })
      if (result.Ok) {
        const subConnection = getSubConnection(net)
        stopFreeze(subConnection)
        return res.json({ msg: 'success', data: result.Ok.txSignature })
      }
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/autobuying
// @desc     Start auto trading
// @access   Private
WalletRouter.post(
  "/autobuying",
  async (req, res) => {
    console.log('/autobuying')
    try {
      const { idx, option } = req.body
      const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      mintingData.wallets[idx] = option
      fs.writeFileSync('minting.json', JSON.stringify(mintingData, null, 4))

      if (option.buying) {
        if (!tradingList[idx] || !(tradingList[idx].buy)) {
          startAutoBuy(idx, net)
          const trade = setInterval(() => { startAutoBuy(idx, net) }, Number(option.buyTime) * 1000)
          tradingList[idx] = { ...tradingList[idx], buy: trade }
        }
      } else {
        if (tradingList[idx].buy) {
          clearInterval(tradingList[idx].buy)
          tradingList[idx] = { ...tradingList[idx], buy: undefined }
        }
      }

      return res.json({ msg: 'success' })
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/autoselling
// @desc     Start auto trading
// @access   Private
WalletRouter.post(
  "/autoselling",
  async (req, res) => {
    console.log('/autoselling')
    try {
      const { idx, option } = req.body
      const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      mintingData.wallets[idx] = option
      fs.writeFileSync('minting.json', JSON.stringify(mintingData, null, 4))

      if (option.selling) {
        if (!tradingList[idx] || !(tradingList[idx].sell)) {
          startAutoSell(idx, net)
          const trade = setInterval(() => { startAutoSell(idx, net) }, Number(option.sellTime) * 1000)
          tradingList[idx] = { ...tradingList[idx], sell: trade }
        }
      } else {
        if (tradingList[idx].sell) {
          clearInterval(tradingList[idx].sell)
          tradingList[idx] = { ...tradingList[idx], sell: undefined }
        }
      }

      return res.json({ msg: 'success' })
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/refund
// @desc     Start auto trading
// @access   Private
WalletRouter.post(
  "/refund",
  async (req, res) => {
    console.log('/refund')
    try {
      const { idx } = req.body
      const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      const wallet: Keypair = Keypair.fromSecretKey(new Uint8Array(mintingData.wallets[idx].secretkey.split(',').map(Number)))
      const data = JSON.parse(fs.readFileSync("data.json", `utf8`))
      const owner: Keypair = Keypair.fromSecretKey(
        bs58.decode(data.privKey)
      )

      const result = await solTransfer({ from: wallet, to: owner, url: net })
      if (result.Err) return res.status(404).json({ error: result.Err })
      if (result.Ok) return res.json({ data: { signature: result.Ok }, msg: "success" })

    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);


// @route    POST api/wallet/setoption
// @desc     Start auto trading
// @access   Private
WalletRouter.post(
  "/setoption",
  async (req, res) => {
    console.log('/setoption')
    try {
      const { idx, option } = req.body
      const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      mintingData.wallets[idx] = option
      fs.writeFileSync('minting.json', JSON.stringify(mintingData, null, 4))

      return res.json({ msg: 'success' })
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

// @route    POST api/wallet/test
// @desc     Test bot running
// @access   Private
WalletRouter.post(
  "/test",
  async (req, res) => {
    console.log('/test')
    try {
      const { idx, option } = req.body
      const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
      const data = JSON.parse(fs.readFileSync("data.json", `utf8`))



      return res.json({ msg: 'success' })
    } catch (error: any) {
      console.error(error);
      return res.status(500).send({ error: error });
    }
  }
);

export default WalletRouter;