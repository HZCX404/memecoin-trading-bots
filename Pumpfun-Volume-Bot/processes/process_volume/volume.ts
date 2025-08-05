import { Keypair, SystemProgram, Transaction, Connection, ComputeBudgetProgram, TransactionInstruction, TransactionMessage, AddressLookupTableProgram, PublicKey, SYSVAR_RENT_PUBKEY, Commitment, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createAssociatedTokenAccountIdempotentInstruction, createAssociatedTokenAccountInstruction, getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import { AnchorProvider } from "@coral-xyz/anchor";

import { PumpFunSDK } from "../../module/pumpfun_sdk/pumpfun";
import {
  // constants
  COMMITMENT,
  RETRY_MODE,
  GLOBAL_MINT,
  // executor
  distributeSol,
  // utils
  sleep,
  DEBUG_MODE,
  RPC_ENDPOINT,
  RPC_WEBSOCKET_ENDPOINT,
  VOLUME_DURATION,
  VOLUME_WALLET_NUM,
  VOLUME_BUY_AMOUNT_MAX,
  VOLUME_BUY_AMOUNT_MIN,
  Keys,
} from "../../module"
import { BN } from "bn.js";


const commitment: Commitment = COMMITMENT === "processed" ? "processed" : COMMITMENT === "confirmed" ? "confirmed" : "finalized"
const connection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT, commitment
})
const sdk = new PumpFunSDK(new AnchorProvider(connection, new NodeWallet(new Keypair()), { commitment }));
let solBalEnough: boolean = true
let volumeNum = 0


export const volume = async (keysData: Keys) => {

  const {volumes, mint: mintKp, mainKp} = keysData
  const global_mint = new PublicKey(GLOBAL_MINT)
  const microLamports = 620_500
  const distributionNum = 20
  const units = 120_000
  const fee = Math.floor(microLamports * units / 10 ** 6)
  const distSolAmount = ?????????
  console.log("Distribution amount", distSolAmount)

  const round = Math.ceil(VOLUME_WALLET_NUM / distributionNum)
  const volumeQueue = new Array(round).fill(true)

  const distributionInterval = Math.floor(VOLUME_DURATION / round * 1000)       // millisecond

  const mint = mintKp.publicKey

  let { feeRecipient } = await sdk.getGlobalAccount(commitment);
  const associatedBondingCurve = getAssociatedTokenAddressSync(
    mint,
    sdk.getBondingCurvePDA(mint),
    true
  );

}


// workerPool.worker({
//   executeScript: volume
// });


// volume()
