import { TxVersion } from "@raydium-io/raydium-sdk";
import { Connection, PublicKey } from "@solana/web3.js";
import dotenv from "dotenv";
import fs from 'fs'
import { logger, retrieveEnvVariable } from "../utils/utils";
import { sokcetServer } from "../sockets";
import { initListener } from "../track/raydium";
import { Commitment } from "@solana/web3.js";
import { arbitrage } from "../arbitrage";
import { initMinting } from "../minting/init";
dotenv.config();

try {
  dotenv.config();
} catch (error) {
  console.error("Error loading environment variables:", error);
  process.exit(1);
}

export const MONGO_URL = process.env.MONGO_URL || ""
export const PORT = process.env.PORT || 9000
export const JWT_SECRET = process.env.JWT_SECRET || "JWT_SECRET";
export const Raydium = new PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);
export const RaydiumAuthority = new PublicKey(
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1"
);
export const WSOL = new PublicKey('So11111111111111111111111111111111111111112')
export const makeTxVersion = TxVersion.V0

export const NETWORK = 'mainnet-beta';

export const LOG_LEVEL = retrieveEnvVariable('LOG_LEVEL', logger);
export const SNIPE_LIST_REFRESH_INTERVAL = Number(retrieveEnvVariable('SNIPE_LIST_REFRESH_INTERVAL', logger));
export const QUOTE_MINT = retrieveEnvVariable('QUOTE_MINT', logger);
export const blockEngineUrl = retrieveEnvVariable('BLOCKENGINE_URL', logger)
// export const jito_auth_keypair = retrieveEnvVariable('JITO_KEY', logger);
export const jito_fee = retrieveEnvVariable('JITO_FEE', logger);
export const RPC_WEBSOCKET_ENDPOINT = retrieveEnvVariable('WEBSOCKET_ENDPOINT', logger)
export const COMMITMENT_LEVEL: Commitment = retrieveEnvVariable('COMMITMENT_LEVEL', logger) as Commitment
export const CHECK_IF_MINT_IS_RENOUNCED = retrieveEnvVariable('CHECK_IF_MINT_IS_RENOUNCED', logger) === 'true'
export const CHECK_IF_MINT_IS_FROZEN = retrieveEnvVariable('CHECK_IF_MINT_IS_FROZEN', logger) === 'true'
export const USE_SNIPE_LIST = retrieveEnvVariable('USE_SNIPE_LIST', logger) === 'true'
export const MAX_SELL_RETRIES = Number(retrieveEnvVariable('MAX_SELL_RETRIES', logger))
export const CHECK_IF_MINT_IS_MUTABLE = retrieveEnvVariable('CHECK_IF_MINT_IS_MUTABLE', logger) === 'true'
export const CHECK_IF_MINT_IS_BURNED = retrieveEnvVariable('CHECK_IF_MINT_IS_BURNED', logger) === 'true'
export const BLOCKENGINE_URL = retrieveEnvVariable('BLOCKENGINE_URL', logger)
export const JITO_AUTH_KEYPAIR = retrieveEnvVariable('JITO_KEY', logger)
export const JITO_FEE = Number(retrieveEnvVariable('JITO_FEE', logger))
export const PRICE_CHECK_INTERVAL = Number(retrieveEnvVariable('PRICE_CHECK_INTERVAL', logger))
export const PRICE_CHECK_DURATION = Number(retrieveEnvVariable('PRICE_CHECK_DURATION', logger))
export const TAKE_PROFIT1 = Number(retrieveEnvVariable('TAKE_PROFIT1', logger))
export const TAKE_PROFIT2 = Number(retrieveEnvVariable('TAKE_PROFIT2', logger))
export const SELL_SLIPPAGE = Number(retrieveEnvVariable('SELL_SLIPPAGE', logger))

export const RPC_ENDPOINT = retrieveEnvVariable('RPC_ENDPOINT', logger);
export const WEBSOCKET_ENDPOINT = retrieveEnvVariable('WEBSOCKET_ENDPOINT', logger);
export const RPC_SUB_ENDPOINT = retrieveEnvVariable('RPC_SUB_ENDPOINT', logger);
export const WEBSOCKET_SUB_ENDPOINT = retrieveEnvVariable('WEBSOCKET_SUB_ENDPOINT', logger);

export const DEV_NET_RPC = retrieveEnvVariable('DEV_NET_RPC', logger);
export const DEV_NET_WSS = retrieveEnvVariable('DEV_NET_WSS', logger);
export const DEV_NET_SUB_RPC = retrieveEnvVariable('DEV_NET_SUB_RPC', logger);
export const DEV_NET_SUB_WSS = retrieveEnvVariable('DEV_NET_SUB_WSS', logger);
// export const DEV_NET_RPC = 'https://devnet.helius-rpc.com/?api-key=fa916d1d-42a4-4cf6-a3c3-e73ddaadf394'
// export const DEV_NET_WSS = 'wss://devnet.helius-rpc.com/?api-key=fa916d1d-42a4-4cf6-a3c3-e73ddaadf394'

export const solanaConnection = new Connection(RPC_ENDPOINT, { wsEndpoint: WEBSOCKET_ENDPOINT, commitment: "confirmed" });
export const solanaSubcribeConnection = new Connection(RPC_SUB_ENDPOINT, { wsEndpoint: WEBSOCKET_SUB_ENDPOINT, commitment: "confirmed" });
export const devConnection = new Connection(DEV_NET_RPC, { wsEndpoint: DEV_NET_WSS, commitment: "confirmed" });
export const devSubcribeConnection = new Connection(DEV_NET_SUB_RPC, { wsEndpoint: DEV_NET_SUB_WSS, commitment: "confirmed" });

export const sandwiches = ['arsc4jbDnzaqcCLByyGo7fg7S2SmcFsWUzQuDtLZh2y']

export const init = () => {
  fs.writeFileSync('raydium.json', JSON.stringify({}))
  initListener()
  // arbitrage()
  initMinting()
}