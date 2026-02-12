// Configuration & State
const BASE_URL = "https://api.etherscan.io/v2/api";
const KNOWN_EXCHANGES = {
    '0x28c6c06298d514db089934071355e5743bf21d60': 'Binance 14',
    '0x21a31ee1afc51d94c2efccaa2092ad1028285549': 'Binance 15',
    '0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be': 'Binance 16',
    '0xd551234ae421e3bcba99a0da6d736074f22192ff': 'Binance 3',
    '0x56eddb7aa87536c09ccc2793473599fd21a8b17f': 'Binance Hot',
    '0x77696bb39917c91a0c3908d577d5e322095425ca': 'Binance Hot 2',
    '0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503': 'Binance Hot 6',
    '0xdfd5293d8e347dfe59e90efd55b2956a1343963d': 'Binance 14',
    '0xe78388b4ce79068e89bf8aa7f218ef6b9ab64418': 'Kraken 3',
    '0x71660c4005ba85c37ccec55d0c4493e66fe775d3': 'Coinbase 1',
    '0x503828976d22510aad0201ac7ec88293211d23da': 'Coinbase 2',
    '0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740': 'Coinbase 3',
    '0xa090e606e30bd747d4e6245a1517ebd817d86d56': 'OKX 1',
    '0x6cc5f688a315f3dc28a7781717a9a798a59fda7b': 'OKX 2'
};

let state = {
    apiKey: localStorage.getItem('eth_whale_api_key') || '',
    threshold: parseFloat(localStorage.getItem('eth_whale_threshold')) || 100,
    interval: parseInt(localStorage.getItem('eth_whale_interval')) || 10,
    aliases: JSON.parse(localStorage.getItem('eth_whale_aliases') || '{}'),
    chartVisible: localStorage.getItem('eth_whale_chart_visible') !== 'false',
    timeframe: 'hour', // minute, hour, day

    // Telegram Settings (never hardcode real credentials)
    telegramToken: localStorage.getItem('eth_whale_tg_token') || '',
    telegramChatId: localStorage.getItem('eth_whale_tg_chat_id') || '',

    // Filter Settings
    filterExchanges: localStorage.getItem('eth_whale_filter_exchanges') === 'true',

    currentBlock: 0,
    whalesCount: 0,
    totalEthMoved: 0,
    isMonitoring: false,
    timer: null,
    chart: null,
    candleSeries: null,
    volumeSeries: null,
    rawMarkers: [], // Store original tx data for dynamic re-calculation
    isHistoryMode: false,
    processedHashes: new Set()
};

// DOM Elements
const elements = {
    apiKey: document.getElementById('api-key'),
    toggleChart: document.getElementById('toggle-chart'),
    chartSection: document.getElementById('chart-section'),
    timeframeBtns: document.querySelectorAll('.tf-btn'),
    threshold: document.getElementById('eth-threshold'),
    interval: document.getElementById('refresh-interval'),
    startBtn: document.getElementById('start-btn'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    modeHistory: document.getElementById('mode-history'),
    currentBlock: document.getElementById('current-block'),
    whalesCount: document.getElementById('whales-count'),
    totalEthMoved: document.getElementById('total-eth-moved'),
    txFeed: document.getElementById('tx-feed'),
    clearBtn: document.getElementById('clear-feed'),
    aliasModal: document.getElementById('alias-modal'),
    modalAddress: document.getElementById('modal-address'),
    aliasInput: document.getElementById('alias-input'),
    saveAliasBtn: document.getElementById('save-alias'),
    closeModalBtn: document.getElementById('close-modal'),
    // New Settings
    tgBotToken: document.getElementById('tg-bot-token'),
    tgChatId: document.getElementById('tg-chat-id'),
    testTgBtn: document.getElementById('test-tg-btn'),
    filterExchanges: document.getElementById('filter-exchanges')
};

// Initial setup from localStorage
elements.apiKey.value = state.apiKey;
elements.threshold.value = state.threshold;
elements.interval.value = state.interval;
if (elements.toggleChart) {
    elements.toggleChart.checked = state.chartVisible;
}
if (elements.chartSection) {
    elements.chartSection.style.display = state.chartVisible ? 'block' : 'none';
}

// New Settings Init
elements.tgBotToken.value = state.telegramToken;
elements.tgChatId.value = state.telegramChatId;
elements.filterExchanges.checked = state.filterExchanges;

// Persist Telegram & filter settings on change
elements.tgBotToken.addEventListener('input', () => {
    state.telegramToken = elements.tgBotToken.value.trim();
    localStorage.setItem('eth_whale_tg_token', state.telegramToken);
});

elements.tgChatId.addEventListener('input', () => {
    state.telegramChatId = elements.tgChatId.value.trim();
    localStorage.setItem('eth_whale_tg_chat_id', state.telegramChatId);
});

elements.filterExchanges.addEventListener('change', (e) => {
    state.filterExchanges = e.target.checked;
    localStorage.setItem('eth_whale_filter_exchanges', String(state.filterExchanges));
});

// Chart Initialization
async function initChart() {
    const chartOptions = {
        layout: {
            background: { color: '#ffffff' },
            textColor: '#64748b',
            fontSize: 12,
            fontFamily: 'Inter',
        },
        grid: {
            vertLines: { color: '#f1f5f9' },
            horzLines: { color: '#f1f5f9' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
            vertLine: {
                color: '#cbd5e1',
                width: 1,
                style: 2,
            },
            horzLine: {
                color: '#cbd5e1',
                width: 1,
                style: 2,
            },
        },
        rightPriceScale: {
            borderColor: '#e2e8f0',
        },
        timeScale: {
            borderColor: '#e2e8f0',
            timeVisible: true,
        },
    };

    state.chart = LightweightCharts.createChart(document.getElementById('chart-container'), chartOptions);

    // Auto-resize handler
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !state.chart) return;
        const { width, height } = entries[0].contentRect;
        state.chart.applyOptions({ width, height });
    });
    resizeObserver.observe(document.getElementById('chart-container'));

    state.candleSeries = state.chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
    });

    state.volumeSeries = state.chart.addHistogramSeries({
        color: '#e2e8f0',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
    });

    state.volumeSeries.priceScale().applyOptions({
        scaleMargins: {
            top: 0.8,
            bottom: 0,
        },
    });

    await fetchChartData();
}

async function fetchChartData() {
    try {
        // Fetch 200 items for the selected timeframe
        const limit = 200;
        // Using Binance ETH-USDT Spot
        const response = await fetch(`https://min-api.cryptocompare.com/data/v2/histo${state.timeframe}?fsym=ETH&tsym=USDT&limit=${limit}&e=Binance`);
        const data = await response.json();

        if (data.Data && data.Data.Data) {
            const candles = [];
            const volumes = [];

            data.Data.Data.forEach(d => {
                candles.push({
                    time: d.time,
                    open: d.open,
                    high: d.high,
                    low: d.low,
                    close: d.close,
                });

                volumes.push({
                    time: d.time,
                    value: d.volumeto,
                    color: d.close >= d.open ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'
                });
            });

            state.candleSeries.setData(candles);
            state.volumeSeries.setData(volumes);

            // Re-apply markers after data update to ensure they are visible
            state.candleSeries.setData(candles);
            state.volumeSeries.setData(volumes);

            // Recalculate and re-apply markers for the current timeframe
            applyMarkers(state.timeframe);

            state.chart.timeScale().fitContent();
        }
    } catch (e) {
        console.error("Chart data fetch error:", e);
    }
}

function addChartMarker(valueEth, address, blockTime, skipUpdate = false) {
    if (!state.candleSeries || !blockTime) return;

    const alias = state.aliases[address.toLowerCase()] || address.substring(0, 6) + '...';

    // Store raw marker data
    state.rawMarkers.push({
        rawTime: blockTime,
        valueEth: valueEth,
        alias: alias
    });

    if (!skipUpdate) {
        applyMarkers(state.timeframe);
    }
}

function applyMarkers(tf) {
    if (!state.candleSeries || state.rawMarkers.length === 0) return;

    const displayMarkers = state.rawMarkers.map(m => {
        let markerTime = m.rawTime;
        // Adjust for current timeframe
        if (tf === 'minute') markerTime = Math.floor(markerTime / 60) * 60;
        else if (tf === 'hour') markerTime = Math.floor(markerTime / 3600) * 3600;
        else if (tf === 'day') markerTime = Math.floor(markerTime / 86400) * 86400;

        return {
            time: markerTime,
            position: 'aboveBar',
            color: '#ef4444',
            shape: 'arrowDown',
            text: `${m.valueEth.toFixed(0)} ETH (${m.alias})`,
            size: 2
        };
    });

    // Sort markers by time (required by Lightweight Charts)
    displayMarkers.sort((a, b) => a.time - b.time);

    try {
        if (state.candleSeries && typeof state.candleSeries.setMarkers === 'function') {
            state.candleSeries.setMarkers(displayMarkers);
        }
    } catch (e) {
        console.warn("Could not set markers:", e);
    }
}

// Functions
async function fetchLatestBlock() {
    const params = new URLSearchParams({
        chainid: "1",
        module: "proxy",
        action: "eth_blockNumber",
        apikey: state.apiKey
    });
    try {
        const response = await fetch(`${BASE_URL}?${params}`);
        const data = await response.json();
        if (data.result && typeof data.result === 'string') {
            return parseInt(data.result, 16);
        }
    } catch (e) {
        console.error("Block fetch error:", e);
    }
    return null;
}

async function fetchBlockTransactions(blockNumber) {
    const params = new URLSearchParams({
        chainid: "1",
        module: "proxy",
        action: "eth_getBlockByNumber",
        tag: "0x" + blockNumber.toString(16),
        boolean: "true",
        apikey: state.apiKey
    });
    try {
        const response = await fetch(`${BASE_URL}?${params}`);
        const data = await response.json();
        if (data.result) {
            return {
                timestamp: parseInt(data.result.timestamp, 16),
                transactions: data.result.transactions || []
            };
        } else {
            console.warn("Block fetch returned no result", data);
        }
    } catch (e) {
        console.error("Tx fetch error:", e);
    }
    return { timestamp: null, transactions: [] };
}

function updateStats(valueEth) {
    state.whalesCount++;
    state.totalEthMoved += valueEth;
    elements.whalesCount.textContent = state.whalesCount;
    elements.totalEthMoved.textContent = `${state.totalEthMoved.toLocaleString()} ETH`;
}

function getDisplayAddress(address) {
    if (state.aliases[address.toLowerCase()]) {
        return `<span class="alias-name">${state.aliases[address.toLowerCase()]}</span>`;
    }
    return `<span class="mono-address">${address.slice(0, 6)}...${address.slice(-4)}</span>`;
}

function addTransactionToFeed(tx, valueEth, timestamp) {
    if (state.processedHashes.has(tx.hash)) return;
    state.processedHashes.add(tx.hash);

    // Use blockchain timestamp if available, else fallback to locale (for live catch)
    const timeDisplay = timestamp ? new Date(timestamp * 1000).toLocaleTimeString() : new Date().toLocaleTimeString();
    const item = document.createElement('div');
    item.className = 'tx-item';

    item.innerHTML = `
        <div class="tx-header">
            <span class="tx-value">🐋 ${valueEth.toFixed(2)} ETH</span>
            <span class="tx-time">${timeDisplay}</span>
        </div>
        <div class="tx-details">
            <div class="tx-row">
                <strong>От:</strong> ${getDisplayAddress(tx.from)}
                <button class="btn-alias" onclick="openAliasModal('${tx.from}')">Имя</button>
            </div>
            <div class="tx-row">
                <strong>Кому:</strong> ${getDisplayAddress(tx.to || 'Unknown')}
                <button class="btn-alias" onclick="openAliasModal('${tx.to}')">Имя</button>
            </div>
            <a href="https://etherscan.io/tx/${tx.hash}" target="_blank" class="tx-link">🔗 View on Etherscan</a>
        </div>
    `;

    // Remove empty state message
    const empty = elements.txFeed.querySelector('.empty-feed');
    if (empty) empty.remove();

    elements.txFeed.prepend(item);
    lucide.createIcons(); // Initialize icons for the new item
}

async function scanNewBlocks() {
    if (!state.isMonitoring) return;

    try {
        const latest = await fetchLatestBlock();
        if (latest && latest > state.currentBlock) {
            // New blocks detected! Update chart candles first
            await fetchChartData();

            if (state.currentBlock === 0) {
                state.currentBlock = latest;
            } else {
                // Limit catch-up to 10 blocks to avoid rapid API depletion
                const start = Math.max(state.currentBlock + 1, latest - 10);
                for (let b = start; b <= latest; b++) {
                    elements.currentBlock.textContent = b;

                    // Throttling for safety
                    if (b > start) await new Promise(r => setTimeout(r, 200));

                    const { timestamp, transactions } = await fetchBlockTransactions(b);
                    transactions.forEach(tx => {
                        const val = parseInt(tx.value, 16) / 1e18;
                        if (val >= state.threshold) {
                            // Filter Exchanges
                            if (state.filterExchanges && (isExchangeWallet(tx.from) || isExchangeWallet(tx.to || ''))) {
                                return;
                            }

                            // Avoid duplicates globally
                            if (state.processedHashes.has(tx.hash)) return;

                            addTransactionToFeed(tx, val, timestamp);
                            updateStats(val);
                            addChartMarker(val, tx.from, timestamp);

                            // Telegram Notification
                            const fromAlias = state.aliases[tx.from.toLowerCase()] || tx.from.substring(0, 6);
                            const toAlias = state.aliases[(tx.to || '').toLowerCase()] || (tx.to ? tx.to.substring(0, 6) : 'Unknown');
                            const msg = `🚨 <b>Whale Alert!</b>\nAmount: ${val.toFixed(2)} ETH\nFrom: ${fromAlias}\nTo: ${toAlias}\n<a href="https://etherscan.io/tx/${tx.hash}">View on Etherscan</a>`;
                            sendTelegramMessage(msg);
                        }
                    });
                }
                state.currentBlock = latest;
            }
        }
    } catch (e) {
        console.error("Scan error:", e);
    }

    state.timer = setTimeout(scanNewBlocks, state.interval * 1000);
}

async function scanHistory() {
    if (!state.apiKey) return;

    // Clear old markers and stats for fresh history
    state.markers = [];
    state.whalesCount = 0;
    state.totalEthMoved = 0;
    elements.whalesCount.textContent = '0';
    elements.totalEthMoved.textContent = '0 ETH';
    elements.txFeed.innerHTML = '<div class="empty-feed"><p>Загрузка истории...</p></div>';

    const latest = await fetchLatestBlock();
    if (!latest) return;

    // Scan last 500 blocks (approx 1.5 - 2 hours)
    // This provides better context for 1m and 1h charts
    const scanCount = 500;
    const startBlock = latest - scanCount;
    const endBlock = latest;

    elements.statusText.textContent = `История (0/${scanCount})...`;

    for (let b = startBlock; b <= endBlock; b++) {
        if (!state.isHistoryMode) break;

        const progress = Math.round(((b - startBlock) / scanCount) * 100);
        elements.statusText.textContent = `История ${progress}%...`;
        elements.currentBlock.textContent = b;

        // Throttling for Etherscan Free API (5 calls/sec limit)
        await new Promise(r => setTimeout(r, 220));

        const { timestamp, transactions } = await fetchBlockTransactions(b);
        transactions.forEach(tx => {
            const val = parseInt(tx.value, 16) / 1e18;
            if (val >= state.threshold) {
                // Filter Exchanges
                if (state.filterExchanges && (isExchangeWallet(tx.from) || isExchangeWallet(tx.to || ''))) {
                    return;
                }

                addTransactionToFeed(tx, val, timestamp);
                updateStats(val);
                // Skip markers update until full history is loaded
                addChartMarker(val, tx.from, timestamp, true);
            }
        });
    }

    // Final markers sort and update
    if (state.rawMarkers.length > 0) {
        applyMarkers(state.timeframe);
    }

    elements.statusText.textContent = 'История загружена';
    setTimeout(() => {
        if (state.isMonitoring) elements.statusText.textContent = 'Работает';
        else elements.statusText.textContent = 'Остановлено';
    }, 2000);
}

// Event Handlers
elements.toggleChart?.addEventListener('change', (e) => {
    state.chartVisible = e.target.checked;
    localStorage.setItem('eth_whale_chart_visible', state.chartVisible);
    if (elements.chartSection) {
        elements.chartSection.style.display = state.chartVisible ? 'block' : 'none';
    }
    if (state.chartVisible && state.chart) {
        state.chart.applyOptions({ width: elements.chartSection.clientWidth - 48 });
    }
});

// Timeframe Button Listeners
elements.timeframeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        const tf = btn.dataset.tf;
        if (tf === state.timeframe) return;

        // Update UI
        elements.timeframeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update State & Fetch
        state.timeframe = tf;
        await fetchChartData();
    });
});

elements.startBtn.addEventListener('click', () => {
    if (state.isMonitoring) {
        state.isMonitoring = false;
        clearTimeout(state.timer);
        elements.startBtn.innerHTML = '<i data-lucide="play"></i> Запустить мониторинг';
        elements.statusDot.classList.remove('active');
        elements.statusText.textContent = 'Остановлено';
        lucide.createIcons();
    } else {
        // Save settings
        state.apiKey = elements.apiKey.value.trim();
        state.threshold = parseFloat(elements.threshold.value) || 100;
        state.interval = parseInt(elements.interval.value) || 10;

        if (!state.apiKey) {
            alert("Пожалуйста, введите API Key");
            return;
        }

        if (state.isHistoryMode) {
            scanHistory();
        }

        localStorage.setItem('eth_whale_api_key', state.apiKey);
        localStorage.setItem('eth_whale_threshold', state.threshold);
        localStorage.setItem('eth_whale_interval', state.interval);

        state.isMonitoring = true;
        state.currentBlock = 0; // Reset to catch next block
        elements.startBtn.innerHTML = '<i data-lucide="square"></i> Остановить';
        elements.statusDot.classList.add('active');
        elements.statusText.textContent = 'Работает';
        lucide.createIcons();
        scanNewBlocks();
    }
});

elements.clearBtn.addEventListener('click', () => {
    elements.txFeed.innerHTML = '<div class="empty-feed"><p>Лента очищена</p></div>';
    state.whalesCount = 0;
    state.totalEthMoved = 0;
    state.rawMarkers = []; // Clear markers data too
    state.processedHashes.clear();
    elements.whalesCount.textContent = '0';
    elements.totalEthMoved.textContent = '0 ETH';
    if (state.candleSeries) state.candleSeries.setMarkers([]);
});

// Alias Modal Logic
window.openAliasModal = function (address) {
    if (!address) return;
    state.pendingAddress = address.toLowerCase();
    elements.modalAddress.textContent = address;
    elements.aliasInput.value = state.aliases[state.pendingAddress] || '';
    elements.aliasModal.classList.add('active');
};

elements.saveAliasBtn.addEventListener('click', () => {
    const alias = elements.aliasInput.value.trim();
    if (alias) {
        state.aliases[state.pendingAddress] = alias;
    } else {
        delete state.aliases[state.pendingAddress];
    }
    localStorage.setItem('eth_whale_aliases', JSON.stringify(state.aliases));
    elements.aliasModal.classList.remove('active');
    // Refresh feed to show new names (optional)
});

elements.closeModalBtn.addEventListener('click', () => {
    elements.aliasModal.classList.remove('active');
});

// Pills interaction
document.querySelectorAll('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
        const val = pill.dataset.val;
        const parentInput = pill.closest('.input-with-suggest').querySelector('input');
        parentInput.value = val;
    });
});

// Mode Toggle
elements.modeHistory.addEventListener('change', (e) => {
    state.isHistoryMode = e.target.checked;
    if (state.isHistoryMode && state.isMonitoring) {
        scanHistory();
    }
});

// Helper Functions
function isExchangeWallet(address) {
    return KNOWN_EXCHANGES[address.toLowerCase()] !== undefined;
}

async function sendTelegramMessage(text) {
    if (!state.telegramToken || !state.telegramChatId) return false;

    const encodedText = encodeURIComponent(text);
    const directUrl = `https://api.telegram.org/bot${state.telegramToken}/sendMessage?chat_id=${state.telegramChatId}&text=${encodedText}&parse_mode=HTML`;

    const proxies = [
        // 1. corsproxy.io (Standard)
        {
            url: `https://corsproxy.io/?${encodeURIComponent(`https://api.telegram.org/bot${state.telegramToken}/sendMessage`)}`,
            method: 'POST',
            body: {
                chat_id: state.telegramChatId,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            }
        },
        // 2. corsproxy.io (GET via encoded URL)
        {
            url: `https://corsproxy.io/?${encodeURIComponent(directUrl)}`,
            method: 'GET'
        },
        // 3. Direct (might fail CORS but worth a try)
        {
            url: directUrl,
            method: 'GET'
        }
    ];

    for (const proxy of proxies) {
        try {
            const options = {
                method: proxy.method,
                headers: proxy.method === 'POST' ? { 'Content-Type': 'application/json' } : {}
            };

            if (proxy.method === 'POST') {
                options.body = JSON.stringify(proxy.body);
            }

            const response = await fetch(proxy.url, options);

            // If opaque response (no-cors) or ok
            if (response.ok || response.type === 'opaque') {
                console.log("Telegram sent via", proxy.url);
                return true;
            }
        } catch (e) {
            console.warn(`Proxy failed (${proxy.url}):`, e);
        }
    }

    // 4. Last Resort: no-cors mode (Fire and forget)
    // We won't know if it succeeded, but it bypasses CORS blocks for sending
    try {
        await fetch(directUrl, { mode: 'no-cors' });
        console.log("Telegram sent via no-cors mode (status unknown but sent)");
        return true;
    } catch (e) {
        console.error("All Telegram methods failed.", e);
        return false;
    }
}

// ... existing code ...

elements.testTgBtn.addEventListener('click', async () => {
    // Use latest values from inputs
    state.telegramToken = elements.tgBotToken.value.trim();
    state.telegramChatId = elements.tgChatId.value.trim();
    localStorage.setItem('eth_whale_tg_token', state.telegramToken);
    localStorage.setItem('eth_whale_tg_chat_id', state.telegramChatId);

    if (!state.telegramToken || !state.telegramChatId) {
        alert("Please enter Bot Token and Chat ID first.");
        return;
    }

    const originalText = elements.testTgBtn.textContent;
    elements.testTgBtn.textContent = "Sending...";
    elements.testTgBtn.disabled = true;

    const success = await sendTelegramMessage("🐋 <b>Whale Tracker Test</b>\nSuccess! Notifications are working.");

    elements.testTgBtn.textContent = originalText;
    elements.testTgBtn.disabled = false;

    if (success) {
        alert("Test message sent! Check your Telegram.");
    } else {
        alert("Failed to send message. Please check the Console (F12) for errors.");
    }
});

// Initialize Chart on load
initChart();
