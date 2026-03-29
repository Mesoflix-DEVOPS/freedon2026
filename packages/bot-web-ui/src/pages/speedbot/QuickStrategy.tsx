import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@deriv/stores';
import { Loading } from '@deriv/components';
import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';
import { getToken } from '@deriv/bot-skeleton/src/services/api/appId';
import { AnalysisHeader, ConfigurationPanel, TransactionTable, EvenOddAnalysis, RiseFallAnalysis } from './StrategyComponents';
import { MdSettings } from 'react-icons/md';
import { FaClock, FaPlay, FaStop } from 'react-icons/fa';
import { speedBotEngine } from './SpeedBotEngine';
import type { SpeedBotConfig, DigitStats, SpeedBotTick, Digit, SpeedBotMode } from './types';
import './quick-strategy.scss';

interface SymbolData {
    symbol: string;
    display_name: string;
    pip?: number;
    submarket?: string;
}

interface GroupedSymbols {
    volatility: SymbolData[];
    jump: SymbolData[];
    other: SymbolData[];
}

const QuickStrategy = observer(() => {
    const { client } = useStore();

    // -- App State --
    const [symbolsList, setSymbolsList] = useState<SymbolData[]>([]);
    const [groupedSymbols, setGroupedSymbols] = useState<GroupedSymbols>({
        volatility: [],
        jump: [],
        other: [],
    });
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // -- Engine Derived State --
    const [isRunning, setIsRunning] = useState(false);
    const [engineStats, setEngineStats] = useState<DigitStats | null>(null);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [totalProfit, setTotalProfit] = useState(0);
    const [sessionTrades, setSessionTrades] = useState(0);
    const [trades, setTrades] = useState<any[]>([]);
    const [engineConfig, setEngineConfig] = useState<SpeedBotConfig | null>(null);

    // -- UI Sync States (Local copies for Form) --
    const getInitialSymbol = () => localStorage.getItem('qs_selectedSymbol') || 'R_100';
    const [selectedMarket, setSelectedMarket] = useState(getInitialSymbol());
    const [activeTab, setActiveTab] = useState('Over/Under'); // Used to determine direction type

    // ── Engine Initialization & Account Sync ─────────────────────────────────
    useEffect(() => {
        const syncAccount = () => {
            const loginid = client.loginid;
            const { token, account_id } = getToken(loginid);
            if (token && account_id) {
                speedBotEngine.setAccount(token, account_id, client.currency);
            }
        };

        syncAccount();
        // Re-sync on account switch
        const disposer = client.onAccountSwitch?.(() => syncAccount());
        return () => disposer?.();
    }, [client.loginid, client.currency]);

    // ── Engine Event Listeners ───────────────────────────────────────────────
    useEffect(() => {
        const handleUpdate = (e: any) => {
            const { state, stats, config, sessionTrades, sessionProfit } = e.detail;
            setIsRunning(state === 'RUNNING');
            setEngineStats(stats);
            setEngineConfig(config);
            setSessionTrades(sessionTrades);
            setTotalProfit(sessionProfit);
        };

        const handlePrice = (e: any) => {
            setCurrentPrice(e.detail.price);
        };

        const handleAlert = (e: any) => {
            const { message, type } = e.detail;
            // Simple alert for now, can be replaced with a proper toast system
            console.log(`[SpeedBot Alert] ${type.toUpperCase()}: ${message}`);
            if (type === 'error') alert(message);
        };

        const handleTradeClose = (e: any) => {
            const { trade } = e.detail;
            setTrades(prev => [trade, ...prev].slice(0, 50));
        };

        const handleHistorySync = (e: any) => {
            const { trades } = e.detail;
            setTrades(trades);
        };

        window.addEventListener('speedbot-update', handleUpdate);
        window.addEventListener('speedbot-price', handlePrice);
        window.addEventListener('speedbot-alert', handleAlert);
        window.addEventListener('speedbot-trade-close', handleTradeClose);
        window.addEventListener('speedbot-history-sync', handleHistorySync);

        return () => {
            window.removeEventListener('speedbot-update', handleUpdate);
            window.removeEventListener('speedbot-price', handlePrice);
            window.removeEventListener('speedbot-alert', handleAlert);
            window.removeEventListener('speedbot-trade-close', handleTradeClose);
            window.removeEventListener('speedbot-history-sync', handleHistorySync);
        };
    }, []);

    // ── Symbol fetching ──────────────────────────────────────────────────────
    useEffect(() => {
        const fetchSymbols = async () => {
            if (!api_base.api) return;
            try {
                const response = await api_base.api.send({ active_symbols: 'brief', product_type: 'basic' });
                if (response.active_symbols) {
                    setSymbolsList(response.active_symbols);
                    const grouped: GroupedSymbols = { volatility: [], jump: [], other: [] };
                    response.active_symbols.forEach((s: any) => {
                        if (s.submarket === 'random_index' || s.submarket === 'volidx') grouped.volatility.push(s);
                        else if (s.submarket === 'random_daily') grouped.jump.push(s);
                        else grouped.other.push(s);
                    });
                    setGroupedSymbols(grouped);
                }
            } catch (err) {
                console.error('Fetch symbols failed:', err);
            }
        };
        fetchSymbols();
    }, []);

    // ── Engine Configuration Sync ───────────────────────────────────────────
    const updateEngineConfig = (patch: Partial<SpeedBotConfig>) => {
        speedBotEngine.updateConfig(patch);
    };

    const handleMarketChange = (newSymbol: string) => {
        setSelectedMarket(newSymbol);
        localStorage.setItem('qs_selectedSymbol', newSymbol);
        updateEngineConfig({ symbol: newSymbol });
    };

    const handleRun = () => {
        if (!client.is_logged_in) {
            alert('Please login first');
            return;
        }
        speedBotEngine.start();
    };

    const handleStop = () => {
        speedBotEngine.stop();
    };

    // Derived values for components
    const digitCounts = engineStats?.details.map(d => d.count) || new Array(10).fill(0);
    const lastDigit = engineStats?.lastDigit ?? null;
    const pipSize = symbolsList.find(s => s.symbol === selectedMarket)?.pip ?? 2;
    const currentPipSize = Math.max(0, Math.abs(Math.log10(pipSize || 0.01)));

    return (
        <div className='qs-container'>
            {/* ── Top Navbar ── */}
            <div className='qs-header'>
                <div className='qs-header-left'>
                    <div className='qs-price-display'>
                        {currentPrice !== null && currentPrice !== undefined
                            ? currentPrice.toFixed(currentPipSize)
                            : <Loading is_fullscreen={false} />}
                    </div>
                    <div className='qs-total-profit' style={{ color: totalProfit >= 0 ? '#00ffa3' : '#ff4d4d' }}>
                        P/L: {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
                    </div>
                </div>

                <div className='qs-header-right'>
                    {/* Market selector */}
                    <div className='qs-selector-wrap'>
                        <span className='qs-selector-label'>MARKET</span>
                        <select
                            className='qs-native-select'
                            value={selectedMarket}
                            onChange={(e) => handleMarketChange(e.target.value)}
                        >
                            {groupedSymbols.volatility.length > 0 && (
                                <optgroup label='── VOLATILITY ──'>
                                    {groupedSymbols.volatility.map(s => (
                                        <option key={s.symbol} value={s.symbol}>{s.display_name}</option>
                                    ))}
                                </optgroup>
                            )}
                            {groupedSymbols.jump.length > 0 && (
                                <optgroup label='── JUMP ──'>
                                    {groupedSymbols.jump.map(s => (
                                        <option key={s.symbol} value={s.symbol}>{s.display_name}</option>
                                    ))}
                                </optgroup>
                            )}
                            {groupedSymbols.other.length > 0 && (
                                <optgroup label='── OTHER ──'>
                                    {groupedSymbols.other.map(s => (
                                        <option key={s.symbol} value={s.symbol}>{s.display_name}</option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </div>

                    {/* Direction Selector inside Navbar (Quick Access) */}
                    <div className='qs-digit-selector'>
                        <select
                            className='qs-native-select short'
                            value={engineConfig?.direction || 'OVER'}
                            onChange={(e) => updateEngineConfig({ direction: e.target.value as any })}
                        >
                            <option value='OVER'>Digit Over</option>
                            <option value='UNDER'>Digit Under</option>
                        </select>
                        <select
                            className='qs-native-select short'
                            value={engineConfig?.prediction || 5}
                            onChange={(e) => updateEngineConfig({ prediction: Number(e.target.value) })}
                        >
                            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                                <option key={d} value={d}>{d}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        className={`qs-config-toggle ${isConfigOpen ? 'active' : ''}`}
                        onClick={() => setIsConfigOpen(!isConfigOpen)}
                        title='Configuration'
                    >
                        <MdSettings />
                    </button>
                </div>
            </div>

            {/* ── Digit Analysis ── */}
            <AnalysisHeader digit_counts={digitCounts} last_digit={lastDigit} />

            {/* ── RUN / STOP button ── */}
            <div className='qs-run-row'>
                {!isRunning ? (
                    <button className='qs-run-btn' onClick={handleRun}>
                        <FaPlay /> START {engineConfig?.mode || 'NORMAL'}
                    </button>
                ) : (
                    <button className='qs-stop-btn' onClick={handleStop}>
                        <FaStop /> STOP {engineConfig?.mode || 'NORMAL'}
                    </button>
                )}
            </div>

            {/* ── Config + Trades ── */}
            <div className='qs-main-content'>
                <ConfigurationPanel
                    config={engineConfig}
                    updateConfig={updateEngineConfig}
                    isOpen={isConfigOpen}
                    onToggle={() => setIsConfigOpen(!isConfigOpen)}
                    isRunning={isRunning}
                    onResetSession={() => speedBotEngine.resetSession()}
                />
                <TransactionTable trades={trades} />
            </div>
        </div>
    );
});

export default QuickStrategy;
