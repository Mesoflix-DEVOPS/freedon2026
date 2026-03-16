import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@deriv/stores';
import { Text, Icon, Loading } from '@deriv/components';
import { Localize } from '@deriv/translations';
import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';
import { observer as globalObserver } from '@deriv/bot-skeleton/src/utils/observer';
import { AnalysisHeader, ConfigurationPanel, TransactionTable, EvenOddAnalysis, RiseFallAnalysis } from './StrategyComponents';
import { MdSettings } from 'react-icons/md';
import { FaClock } from 'react-icons/fa';
import { trading_logic, TradeParams } from './TradingLogic';
import './quick-strategy.scss';

// Symbols and Groups interface
// ... (SymbolData and GroupedSymbols interfaces remain same)

const QuickStrategy = observer(() => {
    const { client } = useStore();
    const getInitialSymbol = () => localStorage.getItem('qs_selectedSymbol') || 'R_10';
    const [activeTab, setActiveTab] = useState('Over/Under');
    const [stake, setStake] = useState(1);
    const [mode, setMode] = useState<any>('Normal');
    const [stopLoss, setStopLoss] = useState(10);
    const [takeProfit, setTakeProfit] = useState(20);
    const [runsBeforeCountdown, setRunsBeforeCountdown] = useState(5);
    const [countdownTime, setCountdownTime] = useState(30);
    const [bulkCount, setBulkCount] = useState(3);
    const [flashLimit, setFlashLimit] = useState(500); // High limit for "every tick"
    const [isRunning, setIsRunning] = useState(false);
    const [trades, setTrades] = useState<any[]>([]);
    const [selectedMarket, setSelectedMarket] = useState(getInitialSymbol());
    const [symbolsList, setSymbolsList] = useState<SymbolData[]>([]);
    const [groupedSymbols, setGroupedSymbols] = useState<GroupedSymbols>({
        volatility: [],
        jump: [],
        other: [],
    });
    const [tickHistory, setTickHistory] = useState<any[]>([]);
    const [pipSize, setPipSize] = useState(2);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [decimalPlaces, setDecimalPlaces] = useState(2);

    const [digitCounts, setDigitCounts] = useState(new Array(10).fill(0));
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [riseFallStats, setRiseFallStats] = useState({ rise: 0, fall: 0 });

    // UI state for refactored layout
    const [isConfigOpen, setIsConfigOpen] = useState(false);

    // Internal Logic State
    const [totalProfit, setTotalProfit] = useState(0);
    const [currentRunCount, setCurrentRunCount] = useState(0);
    const [isCountingDown, setIsCountingDown] = useState(false);
    const [remainingCountdown, setRemainingCountdown] = useState(0);

    const subscriptionId = useRef<string | null>(null);
    const lastTickRef = useRef<any>(null);

    const fetchSymbols = useCallback(async () => {
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
    }, []);

    const requestTickHistory = useCallback(async (symbol: string, currentPipSize: number = 2) => {
        if (subscriptionId.current) {
            try { await api_base.api.send({ forget: subscriptionId.current }); } catch (e) { }
            subscriptionId.current = null;
        }

        try {
            console.log(`[QuickStrategy] Requesting tick history for ${symbol} (Pip: ${currentPipSize})`);
            const response = await api_base.api.send({
                ticks_history: symbol,
                subscribe: 1,
                end: 'latest',
                count: 1000,
                adjust_start_time: 1,
            });

            if (response.subscription) {
                subscriptionId.current = response.subscription.id;
            }

            if (response.history) {
                const prices = response.history.prices;
                const times = response.history.times;
                const historyData = prices.map((p: any, i: number) => ({
                    price: p,
                    epoch: times[i]
                }));

                setTickHistory(historyData);

                // Populate initial stats from history
                const counts = new Array(10).fill(0);
                let rise = 0;
                let fall = 0;

                prices.forEach((p: any, i: number) => {
                    const priceStr = Number(p).toFixed(currentPipSize);
                    const digit = Number(priceStr.charAt(priceStr.length - 1));
                    if (!isNaN(digit)) counts[digit]++;

                    if (i > 0) {
                        if (p > prices[i - 1]) rise++;
                        else if (p < prices[i - 1]) fall++;
                    }
                });

                setDigitCounts(counts);
                setRiseFallStats({ rise, fall });

                // Set initial price to stop loading state
                if (prices.length > 0) {
                    const lastPrice = Number(prices[prices.length - 1]);
                    setCurrentPrice(lastPrice);
                    const priceStr = lastPrice.toFixed(currentPipSize);
                    setLastDigit(Number(priceStr.charAt(priceStr.length - 1)));
                    lastTickRef.current = { quote: lastPrice, symbol };
                }
            }
        } catch (err) {
            console.error('[QuickStrategy] Tick history failed:', err);
        }
    }, []);

    useEffect(() => {
        const checkApiAndFetch = async () => {
            console.log('[QuickStrategy] Checking API status...');
            if (api_base.api) {
                console.log('[QuickStrategy] API ready, fetching symbols...');
                await fetchSymbols();
            } else {
                console.log('[QuickStrategy] API not ready, waiting...');
                setTimeout(checkApiAndFetch, 1000);
            }
        };
        checkApiAndFetch();
    }, [fetchSymbols]);

    useEffect(() => {
        if (selectedMarket) {
            // Find pip size for this market from symbolsList
            const market = symbolsList.find(s => s.symbol === selectedMarket);
            const currentPipSize = market ? Math.max(0, Math.abs(Math.log10(market.pip || 0.01))) : 2;
            setPipSize(currentPipSize);

            requestTickHistory(selectedMarket, currentPipSize);
        }
        return () => {
            if (subscriptionId.current) {
                api_base.api.send({ forget: subscriptionId.current }).catch(() => { });
            }
        };
    }, [selectedMarket, requestTickHistory]);

    useEffect(() => {
        const tickHandler = (data: any) => {
            if (data?.msg_type === 'tick' && data?.tick) {
                console.log('[QuickStrategy] Tick received:', data.tick.symbol, data.tick.quote);
                if (data.tick.symbol === selectedMarket) {
                    const tick = data.tick;
                    const newPrice = Number(tick.quote);
                    setCurrentPrice(newPrice);

                    const QuotePipSize = tick.pip_size || pipSize || 2;
                    setPipSize(QuotePipSize);

                    const quoteStr = newPrice.toFixed(QuotePipSize);
                    const lastDigitDigit = Number(quoteStr.charAt(quoteStr.length - 1));
                    setLastDigit(lastDigitDigit);

                    setDigitCounts(prev => {
                        const next = [...prev];
                        next[lastDigitDigit]++;
                        return next;
                    });

                    if (lastTickRef.current) {
                        const prevPrice = Number(lastTickRef.current.quote);
                        if (newPrice > prevPrice) setRiseFallStats(p => ({ ...p, rise: p.rise + 1 }));
                        else if (newPrice < prevPrice) setRiseFallStats(p => ({ ...p, fall: p.fall + 1 }));
                    }
                    lastTickRef.current = tick;
                }
            }
        };

        console.log('[QuickStrategy] Registering tick observer for', selectedMarket);
        globalObserver.register('api.tick', tickHandler);
        return () => {
            console.log('[QuickStrategy] Unregistering tick observer');
            globalObserver.unregister('api.tick', tickHandler);
        };
    }, [selectedMarket]);

    const handleMarketChange = (newSymbol: string) => {
        setSelectedMarket(newSymbol);
        localStorage.setItem('qs_selectedSymbol', newSymbol);
        setTickHistory([]);
    };

    const getTradeParams = (): TradeParams => {
        let contract_type = 'DIGITOVER';
        let prediction: number | undefined = 5;

        if (activeTab === 'Over/Under') {
            contract_type = 'DIGITOVER';
            prediction = 5;
        } else if (activeTab === 'Even/Odd') {
            contract_type = 'DIGITEVEN';
            prediction = undefined;
        } else if (activeTab === 'Rise/Fall') {
            contract_type = 'CALL';
            prediction = undefined;
        } else if (activeTab === 'Matches/Differs') {
            contract_type = 'DIGITMATCH';
            prediction = 0;
        }

        return {
            amount: stake,
            basis: 'stake',
            contract_type,
            currency: client.currency,
            duration: 1,
            duration_unit: 't',
            symbol: selectedMarket,
            prediction,
        };
    };

    const processTradeResult = (res: any) => {
        setTrades((prev: any[]) => [res, ...prev]);
        const profit = Number(res.profit) || 0;
        setTotalProfit((prev) => prev + profit);

        // Check TP/SL
        if (totalProfit + profit >= takeProfit) {
            alert('Take Profit Reached!');
            handleStop();
        } else if (totalProfit + profit <= -stopLoss) {
            alert('Stop Loss Reached!');
            handleStop();
        }
    };

    const handleRun = async () => {
        if (!client.is_logged_in) {
            alert('Please login first');
            return;
        }

        setIsRunning(true);
        const params = getTradeParams();

        try {
            if (mode === 'Normal') {
                const res = await trading_logic.placeTrade(params);
                processTradeResult(res);

                const newCount = currentRunCount + 1;
                setCurrentRunCount(newCount);

                if (newCount >= runsBeforeCountdown) {
                    setIsCountingDown(true);
                    setRemainingCountdown(countdownTime);
                    setCurrentRunCount(0);
                } else if (isRunning) {
                    handleRun();
                }
            } else if (mode === 'Bulk') {
                const results = await trading_logic.placeBulkTrades(params, bulkCount);
                results.forEach(processTradeResult);
                setIsRunning(false);
            } else if (mode === 'Flash') {
                // Flash mode logic is handled in tick effect
                console.log('[QuickStrategy] Flash mode enabled');
            }
        } catch (err) {
            console.error('Run failed:', err);
            setIsRunning(false);
        }
    };

    const handleStop = () => {
        setIsRunning(false);
        setIsCountingDown(false);
        setRemainingCountdown(0);
        setCurrentRunCount(0);
    };


    // Countdown Timer Effect
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isCountingDown && remainingCountdown > 0) {
            timer = setInterval(() => {
                setRemainingCountdown((prev) => prev - 1);
            }, 1000);
        } else if (isCountingDown && remainingCountdown === 0) {
            setIsCountingDown(false);
            if (isRunning && mode === 'Normal') {
                handleRun();
            }
        }
        return () => clearInterval(timer);
    }, [isCountingDown, remainingCountdown, isRunning, mode]);

    // Flash Mode / Every Tick Execution
    useEffect(() => {
        if (isRunning && mode === 'Flash' && currentPrice !== null) {
            const params = getTradeParams();
            trading_logic.placeTrade(params).then(processTradeResult).catch(console.error);
        }
    }, [currentPrice, isRunning, mode]);

    const TABS = ['Over/Under', 'Even/Odd', 'Rise/Fall', 'Matches/Differs'];

    return (
        <div className="qs-container">
            {/* Premium Header with Market Selector and Strategy Selector */}
            <div className="qs-header">
                <div className="qs-header-left">
                    <div className="qs-price-display">
                        {currentPrice !== null && currentPrice !== undefined ?
                            currentPrice.toFixed(pipSize) :
                            <Loading is_fullscreen={false} />
                        }
                    </div>
                    {isCountingDown && (
                        <div className="qs-countdown-timer">
                            <FaClock /> {remainingCountdown}s
                        </div>
                    )}
                    <div className="qs-total-profit" style={{ color: totalProfit >= 0 ? '#00ffa3' : '#ff4d4d', fontWeight: 'bold' }}>
                        Profit: {totalProfit.toFixed(2)}
                    </div>
                </div>

                <div className="qs-header-right">
                    <div className="qs-market-selector">
                        <select
                            value={selectedMarket}
                            onChange={(e) => handleMarketChange(e.target.value)}
                        >
                            {groupedSymbols.volatility.length > 0 && (
                                <optgroup label="VOLATILITY MARKETS">
                                    {groupedSymbols.volatility.map((symbol) => (
                                        <option key={symbol.symbol} value={symbol.symbol}>
                                            {symbol.display_name}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            {/* ... more optgroups ... */}
                        </select>
                    </div>
                    <div className="qs-strategy-selector">
                        <select
                            value={activeTab}
                            onChange={(e) => setActiveTab(e.target.value)}
                        >
                            {TABS.map(tab => (
                                <option key={tab} value={tab}>{tab}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        className={`qs-config-toggle ${isConfigOpen ? 'active' : ''}`}
                        onClick={() => setIsConfigOpen(!isConfigOpen)}
                    >
                        <MdSettings />
                    </button>
                </div>
            </div>

            {/* Shared Digit Analysis Header */}
            {(activeTab === 'Over/Under' || activeTab === 'Matches/Differs') && (
                <AnalysisHeader digit_counts={digitCounts} last_digit={lastDigit} />
            )}

            <div className="qs-analysis-row">
                {activeTab === 'Even/Odd' && <EvenOddAnalysis digit_counts={digitCounts} />}
                {activeTab === 'Rise/Fall' && <RiseFallAnalysis rise_fall_stats={riseFallStats} />}
            </div>

            <div className="qs-main-content">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '550px' }}>
                    <ConfigurationPanel
                        stake={stake}
                        setStake={setStake}
                        mode={mode}
                        setMode={setMode}
                        stopLoss={stopLoss}
                        setStopLoss={setStopLoss}
                        takeProfit={takeProfit}
                        setTakeProfit={setTakeProfit}
                        runsBeforeCountdown={runsBeforeCountdown}
                        setRunsBeforeCountdown={setRunsBeforeCountdown}
                        countdownTime={countdownTime}
                        setCountdownTime={setCountdownTime}
                        bulkCount={bulkCount}
                        setBulkCount={setBulkCount}
                        isOpen={isConfigOpen}
                        onToggle={() => setIsConfigOpen(!isConfigOpen)}
                        isRunning={isRunning}
                        onRun={handleRun}
                        onStop={handleStop}
                    />
                </div>

                <TransactionTable trades={trades} />
            </div>
        </div>
    );
});

export default QuickStrategy;
