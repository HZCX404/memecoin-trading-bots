# 🦀 Solana Arbitrage Bot

A high-performance arbitrage bot that scans token prices across multiple Solana-based DEXs, identifies profitable swap routes, and executes transactions programmatically.

This repository includes both off-chain and on-chain components for detecting and executing arbitrage opportunities efficiently and securely.

---

## 📁 Folder Structure

- `offchain/` – Core logic for the off-chain arbitrage engine  
- `swap/` – On-chain swap program for executing transactions  
- `pools/` – DEX liquidity pool metadata and configurations  
- `onchain/` – Analysis and reference logic from other on-chain arbitrage strategies  
- `mainnet/` – Forked Solana mainnet state for swap simulation and output estimation 

---

## ✅ Supported DEXs (Current Version)

- [Serum](https://projectserum.com)
- [Aldrin](https://aldrin.com)
- [Saber](https://saber.so)
- [Mercurial](https://mercurial.finance)
- [Orca](https://www.orca.so)

---

## 🚀 Supported DEXs (Advanced Version)

- [Raydium](https://raydium.io)
- [Meteora](https://meteora.ag)
- [Serum](https://projectserum.com)
- [Aldrin](https://aldrin.com)
- [Saber](https://saber.so)
- [Mercurial](https://mercurial.finance)
- [Orca](https://www.orca.so)

---

## 🧠 Features

- Real-time token price discovery across multiple Solana DEXs  
- Profit route calculation and swap execution  
- Modular architecture supporting both off-chain and on-chain logic  
- Mainnet-fork testing environment for safe output verification  

---

## ⚠️ Disclaimer

> This project is provided for research and educational purposes only. Use at your own risk. The authors are not responsible for any financial losses or damages resulting from the use of this software.

---

## 📬 Contributions

Pull requests, issues, and forks are welcome. Let’s build better Solana DeFi tools together!