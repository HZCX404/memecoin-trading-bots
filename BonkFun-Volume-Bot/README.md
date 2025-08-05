# 🔄 Solana Bonkfun LaunchLab volume bot on Raydium LaunchLab

A high-performance LaunchLab volume bot that interacts with the Bonk.fun token swap. This bot is designed to automate the distribution of SOL to multiple wallets and execute endless buy and sell bonk.fun token swap transactions on the LaunchLab and withdraw remain fees and close token accounts simultaneously.

- Live Link: [Bonkspy](https://bonkspy.vercel.app/)

## 📌 Features

- ✅ Create multiple wallets and airdrop SOL automatically 
- ✅ Buy random amount of tokens on certain launch lab
- ✅ Steadly search old wallets & sell tokens & withdraw SOL & close ATA
- ✅ Auto-logs transactions, volume metrics, and token stats
- ✅ Configurable Parameters: Allows customization of buy amounts, intervals, distribution settings, and more..

## 🚀 Getting Started

### 1. Clone the Repo

```bash
git clone https://github.com/hyperbuildx/Bonkfun-Volume-Bot.git
cd Bonkfun-Volume-Bot
```
### 2. Config Env file
Fill out .env 
```env
RPC=
SECRET_KEY=
API_KEY=XXXX-FFFFF
DEBUG=true
``` 
### 3. Run with command

Install node modules and run bot with command
```bash
yarn start
```

```package.json
"start": "node dist/index.js",
"dev": "ts-node-dev src/index.ts",
"build": "tsc",
```

