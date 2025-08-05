import { TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';
import { Transaction } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { Keypair } from '@solana/web3.js';
import WebSocket from 'ws';
import { solanaConnection } from './config';

export function sendRequest(ws: WebSocket) {
  const request = {
    jsonrpc: "2.0",
    id: 420,
    method: "transactionSubscribe",
    params: [
      {
        failed: false,
        accountInclude: ["6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"]
      },
      {
        commitment: "processed",
        encoding: "jsonParsed",
        transactionDetails: "full",
        maxSupportedTransactionVersion: 0
      }
    ]
  };
  ws.send(JSON.stringify(request));
}

export type JitoRegion = 'mainnet' | 'amsterdam' | 'frankfurt' | 'ny' | 'tokyo';
export const JitoEndpoints = {
  mainnet: 'https://mainnet.block-engine.jito.wtf/api/v1/transactions',
  amsterdam: 'https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/transactions',
  frankfurt: 'https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/transactions',
  ny: 'https://ny.mainnet.block-engine.jito.wtf/api/v1/transactions',
  tokyo: 'https://tokyo.mainnet.block-engine.jito.wtf/api/v1/transactions',
};

export function getJitoEndpoint(region: JitoRegion) {
  return JitoEndpoints[region];
}

export async function sendTxUsingJito({
  encodedTx,
  region = 'mainnet'
}: {
  encodedTx: string;
  region: JitoRegion;
}) {
  let rpcEndpoint = getJitoEndpoint(region);

  let payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendTransaction",
    params: [encodedTx]
  };

  let res = await fetch(`${rpcEndpoint}?bundleOnly=false`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
    }
  });

  let json = await res.json();
  if (json.error) {
    console.log(json.error);
    throw new Error(json.error.message);
  }
  return json;
}
