import fs from 'fs'
import { sokcetServer } from '../sockets'
import { freeze } from './tokenFreeze'
import { PublicKey } from '@solana/web3.js'
import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { devConnection, solanaConnection } from "../config";
import { net, getConnection, getSubConnection } from '../routes/WalletRoute'

export const initMinting = () => {
  try {
    const mintingData = JSON.parse(fs.readFileSync("minting.json", `utf8`))
    if (mintingData && mintingData.wallets && mintingData.wallets.length)
      for (let i = 0; i < mintingData.wallets.length; i++) {
        mintingData.wallets[i].buying = false
        mintingData.wallets[i].selling = false
      }
    fs.writeFileSync('minting.json', JSON.stringify(mintingData, null, 4))
    console.log('initialize minting')
    sokcetServer.emit('minting', mintingData)
    const freezedata = JSON.parse(fs.readFileSync("freezedata.json", `utf8`))
    const userData = JSON.parse(fs.readFileSync("data.json", `utf8`))
    const privKey = userData.privKey
    const keypair = Keypair.fromSecretKey(bs58.decode(privKey));
    console.log('init freezing...')
    if (freezedata.freezesubscribeId != undefined && mintingData.baseVault && mintingData.tokenId) {
      const connection = getConnection(net)
      const subConnection = getSubConnection(net)
      freeze(connection,subConnection, new PublicKey(mintingData.baseVault), keypair, new PublicKey(mintingData.tokenId))
    }
  } catch (e) {
    console.log('initMinting\n',e)
  }
}