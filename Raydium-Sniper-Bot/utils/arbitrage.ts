import { SOL_ADDRESS, USDC_ADDRESS } from "./token"

export const getRoute4Swap = async (inputMint: string, outputMint: string, amount: number | string, bps: number, maxAccounts: number, direction: Boolean = false, swapMode: String = 'ExactIn') => {
    const quoteResponse = swapMode == 'ExactIn' ? await (await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${bps}&maxAccounts=${maxAccounts}&onlyDirectRoutes=${direction}&swapMode=${swapMode}`
    )).json() :
        await (await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${bps}&onlyDirectRoutes=${direction}&swapMode=${swapMode}`
        )).json();
    return quoteResponse

}

const arbitrageSwap = async () => {
    console.log(`start calculation...`)
    const swapRoutes = [SOL_ADDRESS, USDC_ADDRESS]
    const initAmount = 100000000

    const quote1 = await getRoute4Swap(swapRoutes[0].toBase58(), swapRoutes[1].toBase58(), initAmount, 50, 20);
    const nextAmount = quote1.outAmount;
    const quote2 = await getRoute4Swap(swapRoutes[1].toBase58(), swapRoutes[0].toBase58(), nextAmount, 50, 20);

    if (!quote1 || !quote2) {
        console.log("failed to get quote");
        return;
    }

    console.log("estimated profit: ", quote2.outAmount - initAmount);
}

const sleep = (time: number) => {
    return new Promise(resolve => setTimeout(resolve, time))
  }

export const main = async () => {
    try {
        do {
            await arbitrageSwap()
            await sleep(3000)
        } while (true)
    } catch (e) {
        console.log("err ", e)
    }
}