import { PublicKey } from "@solana/web3.js"

export const monitor = async (poolId: PublicKey) => {
  setInterval(() => {
    (async () => {
      if (poolId)
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${poolId?.toBase58()}`, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json'
            }
          })
          const data = await res.clone().json()
          const solPrice = data.pair.priceUsd / data.pair.priceNative
          console.log("token price : ", data.pair.priceUsd, "usd / ", data.pair.priceNative, "sol")
          console.log("liquidity : ", data.pair.liquidity.usd, "usd / ", data.pair.liquidity.usd / solPrice, "sol")


        } catch (e) {
          console.log("error in fetching price of pool", e)
        }
    })()
  }, 1000)


}