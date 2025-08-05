import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js'
import fs from 'fs'
import { swap } from '../txHandler'
import { PublicKey } from '@metaplex-foundation/js'
import { Percent } from '@raydium-io/raydium-sdk'
import { solanaConnection, devConnection } from '../../config'
import { getAssociatedTokenAddress } from '@solana/spl-token'
import { sokcetServer } from '../../sockets'

export const startAutoBuy = async (idx: number, net: 'mainnet' | 'devnet') => {
  const connection = net == 'mainnet' ? solanaConnection : devConnection
  try {
    const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
    const rand = Math.random() * (Number(mintingData.wallets[idx].buy2) - Number(mintingData.wallets[idx].buy1)) + Number(mintingData.wallets[idx].buy1)
    const wallet: Keypair = Keypair.fromSecretKey(new Uint8Array(mintingData.wallets[idx].secretkey.split(',').map(Number)))
    const balance = await connection.getBalance(wallet.publicKey)
    if (balance > rand && rand > 0) {
      console.log('buying....', idx, rand)
      const result = await swap({ keypair: wallet, poolId: new PublicKey(mintingData.poolId), buyToken: 'base', amountSide: 'send', amount: rand, slippage: new Percent(5, 100), url: net })
      if (result.Ok) sokcetServer.emit(`autobuying${idx}`)
    }
  } catch (e) {
    console.log('startAutoBuy', e)
  }
}

export const startAutoSell = async (idx: number, net: 'mainnet' | 'devnet') => {
  const connection = net == 'mainnet' ? solanaConnection : devConnection
  try {
    const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
    const rand = Math.random() * (Number(mintingData.wallets[idx].sell2) - Number(mintingData.wallets[idx].sell1)) + Number(mintingData.wallets[idx].sell1)
    const wallet: Keypair = Keypair.fromSecretKey(new Uint8Array(mintingData.wallets[idx].secretkey.split(',').map(Number)))
    const ata = await getAssociatedTokenAddress(new PublicKey(mintingData.tokenId), wallet.publicKey)
    const bal = await connection.getTokenAccountBalance(ata)
    console.log('selling....', idx, rand)
    if (bal.value.uiAmount! && rand > 0) {
      const result = await swap({ keypair: wallet, poolId: new PublicKey(mintingData.poolId), buyToken: 'quote', amountSide: 'receive', amount: rand, slippage: new Percent(5, 100), url: net })
      if (result.Ok) sokcetServer.emit(`autoselling${idx}`)
    }
  } catch (e) {
    console.log('startAutoSell', e)
  }
}