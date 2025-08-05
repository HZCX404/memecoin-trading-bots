import { createAssociatedTokenAccountIdempotentInstruction, createFreezeAccountInstruction, getAssociatedTokenAddress, getAssociatedTokenAddressSync } from "@solana/spl-token"
import { ParsedTransactionWithMeta } from "@solana/web3.js"
import { ComputeBudgetProgram, Keypair, sendAndConfirmTransaction } from "@solana/web3.js"
import { Connection, Logs, PublicKey, Transaction } from "@solana/web3.js"
import fs from 'fs'

export const freeze = async (connection: Connection, subConnection: Connection, baseVault: PublicKey, keypair: Keypair, tokenId: PublicKey) => {
  const data = JSON.parse(fs.readFileSync("minting.json", `utf8`))
  let wallets = []
  if (data.wallets && data.wallets.length > 0)
    wallets = data.wallets.map((val: any) => val.pubkey)
  const userData = JSON.parse(fs.readFileSync("data.json", `utf8`))
  wallets.push(userData.pubKey)
  console.log('start freezing...')
  const freezesubscribeId = subConnection.onLogs(
    baseVault,
    async (logs) => {
      handleFreezeAccount(connection, logs, baseVault, keypair, tokenId, wallets)
    },
    'confirmed'
  )

  console.log('freezesubscribeId', freezesubscribeId)
  fs.writeFileSync('freezedata.json', JSON.stringify({ freezesubscribeId }, null, 4))
}

const handleFreezeAccount = async (connection: Connection, log: Logs, baseVault: PublicKey, keypair: Keypair, tokenId: PublicKey, wallets: Array<string>) => {
  const { logs, err, signature } = log
  if (err) { }
  else {
    try {
      console.log('freezing...')
      let parsedData: ParsedTransactionWithMeta | null = null
      while (!parsedData) parsedData = await connection.getParsedTransaction(
        signature,
        {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed"
        }
      );
      console.log('freeze parsed data...')

      const meta = parsedData?.meta?.innerInstructions;
      console.log('freeze meta data...')

      let ata: string = "";

      meta?.map((item, i) => {
        item.instructions.map((nx: any, j) => {
          if (nx.parsed?.type == "transfer" && nx.parsed?.info.source == baseVault) {
            ata = nx.parsed?.info.destination;
          }
          if (nx.parsed?.type == "transfer" && nx.parsed?.info.destination == baseVault) {
            ata = nx.parsed?.info.source;
          }
        })
      })
      console.log('freeze ata data...', ata)

      const signer = parsedData?.transaction.message.accountKeys.filter((elem: any) => {
        return elem.signer == true
      })[0].pubkey.toBase58();
      console.log('freeze signer data...', signer)

      if (signer && wallets.includes(signer)) return

      if (signer != null && signer != baseVault.toString()) {

        if (ata) {
          while (true) {
            try {
              const transaction = new Transaction().add(
                ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_500_000 }),
                ComputeBudgetProgram.setComputeUnitLimit({ units: 10_000 }),
                createFreezeAccountInstruction(new PublicKey(ata), tokenId, keypair.publicKey)
              );

              const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
              transaction.recentBlockhash = recentBlockhash;

              const sig = await sendAndConfirmTransaction(connection, transaction, [keypair], { skipPreflight: true })
              const freezelog = `freeze ${baseVault} : ${signer} ---> ${sig}\n`
              console.log(freezelog)
              fs.appendFileSync('freezeLog.txt', freezelog)
              break;

            } catch (error: any) {
              console.log(`${new Date()}===>>${error}`);

              if (error.message.indexOf("block height exceeded") === -1) {
                break;
              }
            }

          }
        }
      }
    } catch (error) {
      console.log("onLogError=====>>>", error);
    }
  }
}

export const stopFreeze = async (connection: Connection) => {
  const freezesubscribeIdData = JSON.parse(fs.readFileSync("freezedata.json", `utf8`))
  if (freezesubscribeIdData && freezesubscribeIdData.freezesubscribeId != undefined)
    try {
      console.log('stopping freeze...')
      connection.removeOnLogsListener(freezesubscribeIdData.freezesubscribeId)
      fs.writeFileSync('freezedata.json', JSON.stringify({ freezesubscribeId: undefined }, null, 4))
    } catch (e) {
      console.log(e)
    }
  else {
    console.log('no freezing')
    fs.writeFileSync('freezedata.json', JSON.stringify({ freezesubscribeId: undefined }, null, 4))

  }
}

export const freezeWallet = async (sandwiches: String[], connection: Connection, tokenMint: PublicKey, keypair: Keypair) => {
  for (let i = 0; i < sandwiches.length; i++) {
    try {
      const ata = getAssociatedTokenAddressSync(tokenMint, new PublicKey(sandwiches[i]))

      const transaction = new Transaction().add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1_500_000 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 50_000 }),
        createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, ata, new PublicKey(sandwiches[i]), tokenMint),
        createFreezeAccountInstruction(new PublicKey(ata), tokenMint, keypair.publicKey)
      );

      const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.recentBlockhash = recentBlockhash;
      transaction.feePayer = keypair.publicKey;

      const sig = await sendAndConfirmTransaction(connection, transaction, [keypair], { skipPreflight: true })
      console.log(sandwiches[i].toString(), '---> ', sig)

    } catch (error: any) {
      console.log(`${new Date()}===>>${error}`);

      if (error.message.indexOf("block height exceeded") === -1) {
      }
    }

  }
}