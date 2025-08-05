# 🔁 Meteora Volume Bot

A high-performance Solana bot designed to **automate SOL distribution** and execute **endless buy/sell swaps** on the Raydium DEX using **Jupiter V6 aggregation**. This bot creates more natural trading activity, increases the number of unique makers, and generates realistic volume pressure across pools.

---

## ⚙️ Overview

The Meteora Volume Bot distributes SOL to newly generated wallets, then performs randomized buy and sell operations to simulate organic trading behavior. It’s optimized to:
- Increase pool volume
- Enhance maker diversity
- Apply controlled buy/sell pressure
- Reclaim token rent for efficient wallet gathering

---

## 🔄 What’s Improved in the New Version?

### 🛑 Previous Version Limitations
- **Single Wallet Usage**: Reused the same wallet for all swaps, making on-chain behavior obvious and repetitive.
- **No Maker Growth**: Failed to increase unique market makers — only volume changed.
- **Inefficient Gathering**: Did not convert leftover tokens to SOL before gathering.
- **1:1 Buy/Sell Ratio**: Equal buys and sells often left pools with net sell pressure.

---

### ✅ Latest Enhancements
- **Rotating Wallets**: After each round of swaps, SOL is sent to a new wallet to continue operations.
- **More Makers**: Each new round uses a fresh wallet, increasing the number of unique pool participants.
- **Smart Gathering**: Tokens are sold before gathering; only SOL is returned to the main wallet. Token account rent (≈ 0.00203 SOL) is also reclaimed.
- **Buy Bias**: Performs two buys per wallet before a single sell, creating net buy pressure across the volume run.

---

## ❤️ Key Features

- 🔹 **Automated SOL Distribution**: Dynamically creates and funds wallets.
- 🔹 **Endless Buy/Sell Swaps**: Executes randomized volume operations continuously.
- 🔹 **Jupiter V6 Integration**: Utilizes the latest Jupiter aggregator for best trade routing.
- 🔹 **Configurable Settings**: Easily adjust distribution amount, buy frequency, delay intervals, and more.

---

## ⚠️ Disclaimer

> This tool is provided for educational and testing purposes only. Use responsibly. The authors are not liable for any misuse or financial loss.

---

## 🛠️ Contributing

We welcome contributions and suggestions. If you’d like to help improve this bot, feel free to submit an issue or pull request.

---
