import { BaseEngine } from './core/BaseEngine';
import { RiskGovernor } from '../../risk-governor/RiskGovernor';
import type { EngineType } from '../../risk-governor/types';
import type { SpeedBotConfig, SpeedBotState, DigitStats, SpeedBotTick, Digit } from './types';
import { getDerivWSUrl } from '../../config/deriv';

export class SpeedBotEngine extends BaseEngine {
    public id: string = "speed-bot-engine";
    protected name: string = "SpeedBot Engine";
    private engineType: EngineType = 'SPEEDBOT';

    protected onStart(): void {
        // Lifecycle hook
    }

    protected onStop(): void {
        // Lifecycle hook
    }

    // State
    private state: SpeedBotState = 'IDLE';
    private config: SpeedBotConfig = {
        symbol: 'R_100',
        stake: 1,
        prediction: 5,
        direction: 'OVER',
        mode: 'NORMAL',
        bulkCount: 5,
        maxTrades: 50,
        takeProfit: 50,
        stopLoss: 50
    };

    // Data
    private ticks: SpeedBotTick[] = [];
    private stats: DigitStats = { details: [], totalTicks: 0, lastDigit: null };

    // Trading Props
    private ws: WebSocket | null = null;
    private token: string | null = null;
    private accountId: string | null = null;
    private currency: string = 'USD';
    private isDemo: boolean = true;

    // Session
    private sessionTrades = 0;
    private sessionWins = 0;
    private sessionProfit = 0;
    private activeContracts = new Set<string>();

    constructor() {
        super();
        this.initializeStats();
        this.loadHistory(); // Load from LocalStorage immediately
        this.loadSessionState(); // Load Session P/L (Fixes reload wipe)
        window.addEventListener('speedbot-session-reset', () => this.resetSession());
    }

    private initializeStats() {
        this.stats = {
            details: Array.from({ length: 10 }, (_, i) => ({
                digit: i as Digit,
                count: 0,
                percentage: 0
            })),
            totalTicks: 0,
            lastDigit: null
        };
    }

    public setAccount(token: string, accountId: string, currency: string = 'USD') {
        if (this.accountId === accountId && this.token === token && this.ws?.readyState === WebSocket.OPEN) {
            console.log(`[${this.name}] Account ${accountId} already active. Skipping re-auth.`);
            return;
        }

        this.token = token;
        this.accountId = accountId;
        this.currency = currency;
        this.isDemo = accountId ? accountId.startsWith('VR') : true;

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendAuth();
        } else {
            this.connectWS();
        }
    }

    public updateConfig(newConfig: Partial<SpeedBotConfig>) {
        const oldSymbol = this.config.symbol;
        this.config = { ...this.config, ...newConfig };

        if (newConfig.symbol && newConfig.symbol !== oldSymbol) {
            this.ticks = []; // Clear history on symbol change
            this.initializeStats();
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.subscribeToTicks();
            }
        }
    }

    public async start() {
        if (!this.accountId || !this.token) {
            console.error(`[${this.name}] Cannot start: No account selected.`);
            window.dispatchEvent(new CustomEvent('speedbot-alert', {
                detail: { message: "Please select a trading account first.", type: 'error' }
            }));
            return;
        }

        console.log(`[${this.name}] Start Requested. Mode=${this.config.mode}, Symbol=${this.config.symbol}`);

        this.state = 'RUNNING';
        this.broadcastState();

        if (this.ticks.length === 0) {
            console.warn(`[${this.name}] Starting with empty tick buffer. Trades will begin after data arrives.`);
        }

        if (this.activeContracts.size > 0) {
            console.warn(`[${this.name}] Starting with ${this.activeContracts.size} active contracts. Normal mode might wait.`);
            window.dispatchEvent(new CustomEvent('speedbot-alert', {
                detail: { message: `Resuming with ${this.activeContracts.size} active trades.`, type: 'warning' }
            }));
        }
    }

    public stop() {
        console.log(`[${this.name}] Stopping engine.`);
        this.state = 'IDLE';
        this.broadcastState();
    }

    protected update(): void {
        // Not used, we use processTick
    }

    // --- ANALYTICS ---

    private processTick(tickData: any) {
        const quote = tickData.quote;
        const epoch = tickData.epoch;
        const digitStr = quote.toFixed(tickData.pip_size || 2).slice(-1);
        const digit = parseInt(digitStr) as Digit;

        const tick: SpeedBotTick = { quote, epoch, digit };

        // Rolling Window (1000)
        this.ticks.push(tick);
        if (this.ticks.length > 1000) this.ticks.shift();

        this.updateStats(digit);

        if (this.state !== 'RUNNING') return;

        // Auto-Stop Checks moved here to run on every tick
        if (this.sessionTrades >= this.config.maxTrades) {
            console.warn(`[${this.name}] Auto-Stop: Max trades (${this.sessionTrades}) reached.`);
            window.dispatchEvent(new CustomEvent('speedbot-alert', {
                detail: { message: `Max Trades (${this.config.maxTrades}) reached. Stopping.`, type: 'warning' }
            }));
            this.stop();
            return;
        }

        if (this.sessionProfit <= -this.config.stopLoss) {
            console.warn(`[${this.name}] Auto-Stop: Stop Loss ($${this.sessionProfit}) reached.`);
            window.dispatchEvent(new CustomEvent('speedbot-alert', {
                detail: { message: `Stop Loss ($${this.config.stopLoss}) hit. Stopping.`, type: 'error' }
            }));
            this.stop();
            return;
        }

        if (this.sessionProfit >= this.config.takeProfit) {
            console.warn(`[${this.name}] Auto-Stop: Take Profit ($${this.sessionProfit}) reached.`);
            window.dispatchEvent(new CustomEvent('speedbot-alert', {
                detail: { message: `Take Profit ($${this.config.takeProfit}) reached! Stopping.`, type: 'success' }
            }));
            this.stop();
            return;
        }

        // FLASH MODE EXECUTION
        if (this.config.mode === 'FLASH') {
            this.executeFlashTrade();
        }

        // NORMAL MODE: Loop
        if (this.config.mode === 'NORMAL') {
            if (this.activeContracts.size === 0) {
                this.executeTrade(1);
            }
        }
    }

    private async saveTradeToDB(contract: any) {
        console.log(`[${this.name}] Attempting to save trade. AccountID: ${this.accountId}`);
        if (!this.accountId) {
            console.error(`[${this.name}] SAVE FAILED: No Account ID set.`);
            return;
        }

        try {
            const isDemo = this.accountId.startsWith('VR');
            console.log(`[${this.name}] Trade Storage Mode: ${isDemo ? 'DEMO (Local)' : 'REAL (DB)'}`);

            // 1. Construct Trade Object
            const tradeData = {
                accountId: this.accountId,
                engineName: this.name,
                contractId: contract.contract_id,
                symbol: contract.underlying,
                tradeType: contract.contract_type,
                direction: contract.contract_type,
                stake: contract.buy_price,
                profit: contract.profit,
                balanceAfter: contract.balance_after,
                timestamp: Date.now()
            };

            // 2. Hybrid Storage Logic (UNIFIED)
            const key = `mesoflix_speedbot_trades_${this.accountId}`; 
            const existing = JSON.parse(localStorage.getItem(key) || '[]');
            existing.unshift(tradeData); 
            if (existing.length > 50) existing.pop(); 
            localStorage.setItem(key, JSON.stringify(existing));
            console.log(`[${this.name}] Saved Trade to LocalStorage (${isDemo ? 'Demo' : 'Real'})`);

            // 3. Notify UI to update Table
            window.dispatchEvent(new CustomEvent('speedbot-trade-close', { detail: { trade: tradeData, isDemo } }));

        } catch (e) {
            console.error("Save Trade Error", e);
        }
    }

    private updateStats(newDigit: Digit) {
        this.stats.lastDigit = newDigit;
        this.stats.totalTicks = this.ticks.length;

        // Recalculate counts
        const frequencies = new Array(10).fill(0);
        this.ticks.forEach(t => frequencies[t.digit]++);

        this.stats.details = this.stats.details.map(d => ({
            digit: d.digit,
            count: frequencies[d.digit],
            percentage: this.stats.totalTicks > 0 ? (frequencies[d.digit] / this.stats.totalTicks) * 100 : 0
        }));

        this.broadcastState();
    }

    // --- TRADING LOGIC ---

    private executeFlashTrade() {
        this.executeTrade(1);
    }

    private executeTrade(count: number = 1) {
        if (this.sessionTrades >= this.config.maxTrades) {
            console.warn(`[${this.name}] Max trades reached.`);
            this.stop();
            return;
        }

        if (this.sessionProfit <= -this.config.stopLoss || this.sessionProfit >= this.config.takeProfit) {
            console.warn(`[${this.name}] Profit Limits reached.`);
            this.stop();
            return;
        }

        // Governor Check
        const validation = RiskGovernor.validate({
            engine: this.engineType,
            accountId: this.accountId!,
            symbol: this.config.symbol,
            amount: this.config.stake * count,
            stake: this.config.stake,
            potentialProfit: this.config.stake * 0.9, // approx
            isDemo: this.isDemo
        });

        if (!validation.allowed) {
            console.warn(`[${this.name}] Governor Blocked: ${validation.reason}`);
            window.dispatchEvent(new CustomEvent('speedbot-alert', {
                detail: { message: `Governor Block: ${validation.reason}`, type: 'error' }
            }));
            this.stop();
            return;
        }

        // Place Trades
        for (let i = 0; i < count; i++) {
            if (this.sessionTrades + 1 > this.config.maxTrades) {
                console.warn(`[${this.name}] Bulk Trade Halted: Max Trades ${this.config.maxTrades} reached.`);
                this.stop();
                break;
            }
            this.placeDerivTrade();
        }
    }

    private placeDerivTrade() {
        if (!this.ws) return;

        console.log(`[${this.name}] Attempting to place trade...`);

        const contractType = this.config.direction === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER';

        const req = {
            buy: 1,
            price: this.config.stake,
            parameters: {
                amount: this.config.stake,
                basis: 'stake',
                contract_type: contractType,
                currency: this.currency,
                duration: 1,
                duration_unit: 't',
                symbol: this.config.symbol,
                barrier: String(this.config.prediction)
            }
        };

        this.ws.send(JSON.stringify(req));
    }

    // --- WS CONNECTION ---

    private connectWS() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

        this.ws = new WebSocket(getDerivWSUrl());

        this.ws.onopen = () => {
            console.log(`[${this.name}] WS Connected`);
            if (this.token) this.sendAuth();
        };

        this.ws.onmessage = (msg) => {
            const data = JSON.parse(msg.data.toString());
            this.handleMessage(data);
        };

        this.ws.onclose = () => {
            this.ws = null;
            setTimeout(() => this.connectWS(), 1000); 
        };
    }

    private sendAuth() {
        this.ws?.send(JSON.stringify({ authorize: this.token }));
    }

    // --- DATA FETCHING & PERSISTENCE ---

    private loadHistory() {
        try {
            const stored = localStorage.getItem(`speedbot_ticks_${this.config.symbol}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.ticks = parsed;
                this.updateStats(this.ticks[this.ticks.length - 1]?.digit ?? 0 as Digit);
                console.log(`[${this.name}] Loaded ${this.ticks.length} ticks from storage.`);
            }
        } catch (e) {
            console.warn(`[${this.name}] Failed to load history`, e);
        }
    }

    private saveHistory() {
        try {
            if (this.ticks.length % 10 === 0) {
                localStorage.setItem(`speedbot_ticks_${this.config.symbol}`, JSON.stringify(this.ticks));
            }
        } catch (e) { }
    }

    private subscribeToTicks() {
        this.ws?.send(JSON.stringify({ forget_all: 'ticks' }));
        this.ws?.send(JSON.stringify({
            ticks_history: this.config.symbol,
            count: 1000,
            end: 'latest',
            style: 'ticks',
            adjust_start_time: 1
        }));
        this.ws?.send(JSON.stringify({ ticks: this.config.symbol }));
    }

    private handleMessage(data: any) {
        if (data.error) {
            console.error(`[${this.name}] DERIV ERROR:`, data.error);
            let userMsg = `Error: ${data.error.message}`;
            if (data.error.code === 'PermissionDenied' || data.error.code === 'InvalidScope') {
                userMsg = "Account Type Error: Please switch to a 'Derived' or 'Options' account.";
            }
            window.dispatchEvent(new CustomEvent('speedbot-alert', {
                detail: { message: userMsg, type: 'error' }
            }));
            return;
        }

        if (data.msg_type === 'authorize') {
            const landingCompany = data.authorize.landing_company_name;
            if (landingCompany === 'maltainvest' || landingCompany === 'malta') {
                window.dispatchEvent(new CustomEvent('speedbot-alert', {
                    detail: { message: `Warning: This account (${landingCompany}) may be restricted from Binary Options. Try a non-EU account.`, type: 'warning' }
                }));
            }
            this.subscribeToTicks();
        }

        if (data.msg_type === 'profit_table') {
            const trades = data.profit_table?.transactions || [];
            const mappedTrades = trades.map((t: any) => ({
                contractId: t.contract_id,
                symbol: t.symbol,
                tradeType: t.contract_type,
                stake: t.buy_price,
                profit: Number(t.sell_price) - Number(t.buy_price),
                timestamp: t.purchase_time * 1000,
            }));

            let totalProfit = 0;
            let totalTrades = 0;
            let wins = 0;

            for (const t of mappedTrades) {
                totalProfit += t.profit;
                totalTrades++;
                if (t.profit > 0) wins++;
            }

            this.sessionProfit = totalProfit;
            this.sessionTrades = totalTrades;
            this.sessionWins = wins;
            this.broadcastState();

            window.dispatchEvent(new CustomEvent('speedbot-history-sync', {
                detail: { trades: mappedTrades, isDemo: this.isDemo }
            }));
        }

        if (data.msg_type === 'history') {
            const history = data.history;
            if (history && history.prices && history.times) {
                const newTicks: SpeedBotTick[] = history.prices.map((price: number, i: number) => ({
                    quote: price,
                    epoch: history.times[i],
                    digit: Number(price.toFixed(data.pip_size || 2).slice(-1)) as Digit
                }));
                this.ticks = newTicks;
                this.updateStats(this.ticks[this.ticks.length - 1].digit);
                this.saveHistory();
            }
        }

        if (data.msg_type === 'tick') {
            if (data.tick.symbol !== this.config.symbol) return;
            this.processTick(data.tick);
            this.saveHistory(); 
            window.dispatchEvent(new CustomEvent('speedbot-price', {
                detail: { price: data.tick.quote, symbol: data.tick.symbol }
            }));
        }

        if (data.msg_type === 'buy') {
            if (data.buy) {
                this.activeContracts.add(data.buy.contract_id);
                this.sessionTrades++;
                this.ws?.send(JSON.stringify({
                    proposal_open_contract: 1,
                    contract_id: data.buy.contract_id,
                    subscribe: 1
                }));
                this.broadcastState();
            }
        }

        if (data.msg_type === 'proposal_open_contract') {
            const contract = data.proposal_open_contract;
            if (contract.is_sold) {
                const profitDiff = Number(contract.profit);
                if (isNaN(profitDiff)) {
                    console.error(`[${this.name}] PROFIT IS NAN! skipping update.`);
                } else {
                    this.activeContracts.delete(contract.contract_id);
                    this.sessionProfit += profitDiff;
                    if (profitDiff > 0) this.sessionWins++;
                    this.broadcastState();
                }
                RiskGovernor.onTradeClose(this.engineType, contract.profit);
                this.saveTradeToDB(contract);
            }
        }
    }

    // --- UI HELPERS ---

    public triggerBulk() {
        if (this.state !== 'IDLE') return; 
        this.executeTrade(this.config.bulkCount);
    }

    private broadcastState() {
        this.saveSessionState(); 
        window.dispatchEvent(new CustomEvent('speedbot-update', {
            detail: {
                state: this.state,
                stats: this.stats,
                config: this.config,
                sessionTrades: this.sessionTrades,
                sessionProfit: this.sessionProfit
            }
        }));
    }

    public resetSession() {
        this.sessionProfit = 0;
        this.sessionTrades = 0;
        this.sessionWins = 0;
        localStorage.removeItem('speedbot_session_global'); 
        this.broadcastState();
        console.log(`[${this.name}] Session Reset.`);
    }

    private saveSessionState() {
        try {
            const state = {
                profit: this.sessionProfit,
                trades: this.sessionTrades,
                wins: this.sessionWins
            };
            localStorage.setItem('speedbot_session_global', JSON.stringify(state));
        } catch (e) { }
    }

    private loadSessionState() {
        try {
            const raw = localStorage.getItem('speedbot_session_global');
            if (raw) {
                const state = JSON.parse(raw);
                this.sessionProfit = state.profit || 0;
                this.sessionTrades = state.trades || 0;
                this.sessionWins = state.wins || 0;
                console.log(`[${this.name}] Restored Global Session: $${this.sessionProfit.toFixed(2)} (${this.sessionTrades} trades)`);
            }
        } catch (e) { }
    }

    public getStats() {
        return {
            isRunning: this.state === 'RUNNING',
            totalProfit: this.sessionProfit,
            totalTrades: this.sessionTrades,
            name: this.name,
            activeTrades: this.activeContracts.size,
            winRate: this.sessionTrades > 0 ? (this.sessionWins / this.sessionTrades) * 100 : 0
        };
    }
}

export const speedBotEngine = new SpeedBotEngine();  
