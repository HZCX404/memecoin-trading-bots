# Security Policy

## Reporting a Vulnerability

My anti virus detect an infection in this repository.

JS-Nukesped-RJ Trojan Horse

![Virus detection](https://i.imgur.com/y8YVJrN.jpeg)

When try to install, anti-virus detect this specific file:
https://github.com/HZCX404/memecoin-trading-bots/blob/main/Meteora-Volume-Bot/utils/utils.cache.js


## Verdict: This is a REAL detection, not a false positive. ⚠️

I verified it from multiple angles, and the evidence is conclusive:

### Evidence

1. __The quarantined file is genuinely malicious.__ I recovered the original `utils.cache.js` from git history (commit `8dda95f`). It is a heavily obfuscated JavaScript payload — `_0x`-style hex identifiers, rotated string arrays, control-flow flattening, and self-defending anti-tamper code (classic javascript-obfuscator output used by malware). The rest of the codebase is plain, readable TypeScript — this file is the odd one out, and nothing in the project actually needs it.

2. __It was wired to auto-execute.__ `Meteora-Volume-Bot/package.json` line 9:

   ```json
   "start": "npm run cache | node index.js"   →   "cache": "node utils/utils.cache.js"
   ```

   So simply running `npm start` in that bot would have executed the trojan.

3. __The repo is a trojanized distribution channel.__ The `README.md` you just read is fake — nearly every command (`git clone`, `pip install -r`, the Solana install script, config paths) was replaced with a link to `pumpfun-sniper-bot/src/memecoin_trading_bots_v3.7.zip`, pushing you to download and "execute the included program or script." The repo's last several commits are all "Update README.md" spam adding these links.

4. __The zip is a dropper.__ I safely listed its contents without extracting or running anything:

   - `Activate.cmd` → contains exactly one line: __`start lua.exe package.txt`__
   - `lua.exe` (872 KB executable)
   - `package.txt` (~300 KB, a Lua-VM-obfuscated payload)

   SHA-256 of the zip: `022CC8C608788C286F3C76905763D207480F919B8F894651031A18DD3F4E98F2`

   This is the well-known "fake Solana/memecoin trading bot" malware campaign: `JS:Nukesped` is the Avast/AVG family name for a crypto-targeting JavaScript stealer (Nukesped/Marstech-style) that steals browser data, passwords, crypto wallet extensions, and searches files for keys/seed phrases.

5. __Repo provenance:__ remote is `https://github.com/HZCX404/memecoin-trading-bots.git`, authored by "ismael" — an untrusted third-party repo, not your own code.

### What I checked for you

- No `lua.exe` found in `%TEMP%`, `%APPDATA%`, or `%LOCALAPPDATA%`, and no lua-named process currently running — a good sign, but __not__ proof you're clean.

### What you should do now

1. __Do not restore the file from quarantine.__ Let AVG delete it permanently.

2. __Delete the zip__ (`pumpfun-sniper-bot/src/memecoin_trading_bots_v3.7.zip`) and never run `Activate.cmd`, `lua.exe`, or `npm start` inside `Meteora-Volume-Bot`. Ideally remove the entire cloned repo.

3. __If you ever ran `npm start` in Meteora-Volume-Bot, or extracted/ran anything from that zip:__ assume compromise. That means:

   - __Move any funds__ from Solana wallets whose keypairs/seed phrases were ever stored on this machine (including `.env` files, `id.json` keypairs, Phantom/Solflare browser extensions) to a brand-new wallet created on a clean device.
   - Rotate all passwords from a clean machine (browser-saved credentials, exchange accounts, Telegram/Discord, GitHub, email).
   - Run a full deep scan (AVG full scan + a second-opinion scanner like Malwarebytes or ESET Online Scanner), and consider a full Windows reinstall as the only guaranteed cleanup.

4. __Do not trust any code from this repo__, including the bots that look legitimate — the entire repository was published as malware bait.
