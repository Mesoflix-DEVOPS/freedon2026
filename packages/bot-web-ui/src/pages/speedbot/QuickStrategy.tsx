import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@deriv/stores';
import { Loading } from '@deriv/components';
import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';
import { AnalysisHeader, ConfigurationPanel, TransactionTable, EvenOddAnalysis, RiseFallAnalysis } from './StrategyComponents';
import { MdSettings } from 'react-icons/md';
import { FaClock, FaPlay, FaStop } from 'react-icons/fa';
import { trading_logic, TradeParams } from './TradingLogic';
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

    const getInitialSymbol = () => localStorage.getItem('qs_selectedSymbol') || 'R_10';
    const [activeTab, setActiveTab] = useState('Over/Under');
    const [stake, setStake] = useState(1);
    const [mode, setMode] = useState<any>('Normal');
    const [stopLoss, setStopLoss] = useState(10);
    const [takeProfit, setTakeProfit] = useState(20);
    const [runsBeforeCountdown, setRunsBeforeCountdown] = useState(5);
    const [countdownTime, setCountdownTime] = useState(30);
    const [bulkCount, setBulkCount] = useState(3);
    const [isRunning, setIsRunning] = useState(false);
    const [trades, setTrades] = useState<any[]>([]);
    const [selectedMarket, setSelectedMarket] = useState(getInitialSymbol());
    const [symbolsList, setSymbolsList] = useState<SymbolData[]>([]);
    const [groupedSymbols, setGroupedSymbols] = useState<GroupedSymbols>({
        volatility: [],
        jump: [],
        other: [],
    });
    const [pipSize, setPipSize] = useState(2);
    const [currentPrice, setCurrentPrice] = useState<number | null>(null);
    const [digitCounts, setDigitCounts] = useState(new Array(10).fill(0));
    const [lastDigit, setLastDigit] = useState<number | null>(null);
    const [riseFallStats, setRiseFallStats] = useState({ rise: 0, fall: 0 });
    const [selectedDigit, setSelectedDigit] = useState(5);
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [totalProfit, setTotalProfit] = useState(0);
    const [currentRunCount, setCurrentRunCount] = useState(0);
    const [isCountingDown, setIsCountingDown] = useState(false);
    const [remainingCountdown, setRemainingCountdown] = useState(0);

    // Trade Type Option States
    const [digitType, setDigitType] = useState('Over');
    const [evenOddType, setEvenOddType] = useState('Even');
    const [riseFallType, setRiseFallType] = useState('Rise');
    const [matchesDiffersType, setMatchesDiffersType] = useState('Matches');

    // History and Analysis States
    const [last1000Digits, setLast1000Digits] = useState<number[]>([]);
    const [tickHistoryDigits, setTickHistoryDigits] = useState<number[]>([]);
    const [tickDirections, setTickDirections] = useState<('rise' | 'fall' | 'neutral')[]>([]);

    const subscriptionId = useRef<string | null>(null);
    const lastTickRef = useRef<any>(null);
    // Use a ref for pipSize so the onMessage closure never goes stale
    const pipSizeRef = useRef<number>(2);
    const isRunningRef = useRef(isRunning);
    const modeRef = useRef(mode);

    // Keep refs in sync
    useEffect(() => { pipSizeRef.current = pipSize; }, [pipSize]);
    useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);
    useEffect(() => { modeRef.current = mode; }, [mode]);

    // ── Symbol fetching ──────────────────────────────────────────────────────
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

    // ── Tick history (initial load) ─────────────────────────────────────────
    const requestTickHistory = useCallback(async (symbol: string, currentPipSize: number = 2) => {
        if (subscriptionId.current) {
            try { await api_base.api.send({ forget: subscriptionId.current }); } catch (e) { }
            subscriptionId.current = null;
        }

        try {
            console.log(`[QS] Requesting tick history for ${symbol} pip=${currentPipSize}`);
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
                const historyData = prices.map((p: any, i: number) => ({
                    price: p,
                    epoch: response.history.times[i],
                }));

                const counts = new Array(10).fill(0);
                let rise = 0;
                let fall = 0;
                const digits: number[] = [];
                const dirs: ('rise' | 'fall' | 'neutral')[] = [];

                prices.forEach((p: any, i: number) => {
                    const priceStr = Number(p).toFixed(currentPipSize);
                    const digit = Number(priceStr.charAt(priceStr.length - 1));
                    if (!isNaN(digit)) { counts[digit]++; digits.push(digit); }

                    if (i > 0) {
                        if (p > prices[i - 1]) { rise++; dirs.push('rise'); }
                        else if (p < prices[i - 1]) { fall++; dirs.push('fall'); }
                        else dirs.push('neutral');
                    }
                });

                setDigitCounts(counts);
                setRiseFallStats({ rise, fall });
                setLast1000Digits(digits);
                setTickHistoryDigits(digits.slice(-20));
                setTickDirections(dirs.slice(-20));

                if (prices.length > 0) {
                    const lastPrice = Number(prices[prices.length - 1]);
                    setCurrentPrice(lastPrice);
                    const priceStr = lastPrice.toFixed(currentPipSize);
                    setLastDigit(Number(priceStr.charAt(priceStr.length - 1)));
                    lastTickRef.current = { quote: lastPrice, symbol };
                }
            }
        } catch (err) {
            console.error('[QS] Tick history failed:', err);
        }
    }, []);

    // ── API ready check ─────────────────────────────────────────────────────
    useEffect(() => {
        const checkApiAndFetch = async () => {
            if (api_base.api) {
                await fetchSymbols();
            } else {
                setTimeout(checkApiAndFetch, 1000);
            }
        };
        checkApiAndFetch();
    }, [fetchSymbols]);

    // ── Fetch history when market changes ───────────────────────────────────
    useEffect(() => {
        if (!selectedMarket) return;
        const market = symbolsList.find(s => s.symbol === selectedMarket);
        const currentPipSize = market ? Math.max(0, Math.abs(Math.log10(market.pip || 0.01))) : 2;
        setPipSize(currentPipSize);
        pipSizeRef.current = currentPipSize;
        requestTickHistory(selectedMarket, currentPipSize);

        return () => {
            if (subscriptionId.current) {
                api_base.api?.send({ forget: subscriptionId.current }).catch(() => { });
            }
        };
    }, [selectedMarket, requestTickHistory]);
    // Note: symbolsList intentionally omitted — only re-run when selectedMarket changes

    // ── Real-time WebSocket listener ────────────────────────────────────────
    // CRITICAL: pipSizeRef is used here so this effect runs ONCE per market
    // change and never needs to be torn down due to pipSize state updates.
    useEffect(() => {
        if (!selectedMarket || !api_base.api) return;

        const handleMessage = (data: any) => {
            if (data?.msg_type === 'tick' && data?.tick) {
                const tick = data.tick;
                if (tick.symbol !== selectedMarket) return;

                const newPrice = Number(tick.quote);
                const ps = tick.pip_size ?? pipSizeRef.current;

                setCurrentPrice(newPrice);

                const quoteStr = newPrice.toFixed(ps);
                const digit = Number(quoteStr.charAt(quoteStr.length - 1));
                setLastDigit(digit);

                setLast1000Digits(prev => {
                    const next = [...prev, digit];
                    if (next.length > 1000) {
                        const removed = next.shift();
                        // Optimistically update counts
                        setDigitCounts(prevCounts => {
                            const newCounts = [...prevCounts];
                            if (removed !== undefined && !isNaN(removed)) newCounts[removed]--;
                            if (!isNaN(digit)) newCounts[digit]++;
                            return newCounts;
                        });
                    } else {
                        setDigitCounts(prevCounts => {
                            const newCounts = [...prevCounts];
                            if (!isNaN(digit)) newCounts[digit]++;
                            return newCounts;
                        });
                    }
                    return next;
                });

                setTickHistoryDigits(prev => {
                    const next = [...prev, digit];
                    return next.slice(-20);
                });

                if (lastTickRef.current) {
                    const prevPrice = Number(lastTickRef.current.quote);
                    const dir: 'rise' | 'fall' | 'neutral' =
                        newPrice > prevPrice ? 'rise' :
                            newPrice < prevPrice ? 'fall' : 'neutral';
                    if (newPrice > prevPrice) setRiseFallStats(p => ({ ...p, rise: p.rise + 1 }));
                    else if (newPrice < prevPrice) setRiseFallStats(p => ({ ...p, fall: p.fall + 1 }));
                    setTickDirections(prev => [...prev, dir].slice(-20));
                }

                lastTickRef.current = { quote: newPrice, symbol: tick.symbol };

                // Flash mode auto-trade
                if (isRunningRef.current && modeRef.current === 'Flash') {
                    // handled via separate effect below using ref
                }
            }
        };

        console.log('[QS] Subscribing to live ticks for', selectedMarket);
        const subscription = api_base.api.onMessage().subscribe(({ data }: { data: any }) => {
            handleMessage(data);
        });

        return () => {
            console.log('[QS] Cleaning up tick listener for', selectedMarket);
            if (subscription && typeof subscription.unsubscribe === 'function') {
                subscription.unsubscribe();
            }
        };
    }, [selectedMarket]); // only re-run when market changes — pipSize via ref

    // ── Market change handler ────────────────────────────────────────────────
    const handleMarketChange = (newSymbol: string) => {
        setSelectedMarket(newSymbol);
        localStorage.setItem('qs_selectedSymbol', newSymbol);
        setCurrentPrice(null);
        setTickHistoryDigits([]);
        setTickDirections([]);
        setDigitCounts(new Array(10).fill(0));
        setRiseFallStats({ rise: 0, fall: 0 });
    };

    // ── Trade params ─────────────────────────────────────────────────────────

    const getTradeParams = (): TradeParams => {
        let contract_type = 'DIGITOVER';
        let barrier: string | undefined = selectedDigit.toString();

        if (activeTab === 'Over/Under') {
            contract_type = digitType === 'Over' ? 'DIGITOVER' : 'DIGITUNDER';
            barrier = selectedDigit.toString();
        } else if (activeTab === 'Even/Odd') {
            contract_type = evenOddType === 'Even' ? 'DIGITEVEN' : 'DIGITODD';
            barrier = undefined;
        } else if (activeTab === 'Rise/Fall') {
            contract_type = riseFallType === 'Rise' ? 'CALL' : 'PUT';
            barrier = undefined;
        } else if (activeTab === 'Matches/Differs') {
            contract_type = matchesDiffersType === 'Matches' ? 'DIGITMATCH' : 'DIGITDIFF';
            barrier = selectedDigit.toString();
        }

        return {
            amount: Number(stake),
            basis: 'stake',
            contract_type,
            currency: client.currency,
            duration: 1,
            duration_unit: 't',
            symbol: selectedMarket,
            barrier,
        };
    };

    const processTradeResult = (res: any) => {
        setTrades(prev => [res, ...prev]);
        const profit = Number(res.profit) || 0;
        setTotalProfit(prev => {
            const next = prev + profit;
            if (next >= takeProfit) { alert('Take Profit Reached!'); handleStop(); }
            else if (next <= -stopLoss) { alert('Stop Loss Reached!'); handleStop(); }
            return next;
        });
    };

    const handleRun = async () => {
        if (!client.is_logged_in) { alert('Please login first'); return; }
        if (isRunning) return;
        setIsRunning(true);

        try {
            if (mode === 'Normal') {
                let currentRunCountLocal = currentRunCount;
                while (isRunningRef.current && modeRef.current === 'Normal') {
                    const params = getTradeParams();
                    const res = await trading_logic.placeTrade(params);
                    processTradeResult(res);

                    currentRunCountLocal++;
                    setCurrentRunCount(currentRunCountLocal);

                    if (currentRunCountLocal >= runsBeforeCountdown) {
                        setIsCountingDown(true);
                        setRemainingCountdown(countdownTime);
                        setCurrentRunCount(0);
                        break; // Stop loop, the timer effect will restart handleRun when done
                    }
                }
            } else if (mode === 'Bulk') {
                const params = getTradeParams();
                const results = await trading_logic.placeBulkTrades(params, bulkCount);
                results.forEach(processTradeResult);
                setIsRunning(false);
            } else if (mode === 'Flash') {
                console.log('[QS] Flash mode — will fire on each live tick');
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

    // ── Countdown timer ──────────────────────────────────────────────────────
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isCountingDown && remainingCountdown > 0) {
            timer = setInterval(() => setRemainingCountdown(p => p - 1), 1000);
        } else if (isCountingDown && remainingCountdown === 0) {
            setIsCountingDown(false);
            if (isRunning && mode === 'Normal') handleRun();
        }
        return () => clearInterval(timer);
    }, [isCountingDown, remainingCountdown]);

    // ── Flash mode trade on every tick ───────────────────────────────────────
    // Track flash trading state to prevent overlap
    const isFlashTradingRef = useRef(false);

    useEffect(() => {
        if (isRunning && mode === 'Flash' && currentPrice !== null && !isFlashTradingRef.current) {
            isFlashTradingRef.current = true;
            const params = getTradeParams();
            trading_logic.placeTrade(params).then(res => {
                processTradeResult(res);
                isFlashTradingRef.current = false;
            }).catch(err => {
                console.error(err);
                isFlashTradingRef.current = false;
            });
        }
    }, [currentPrice, isRunning, mode]);

    const TABS = ['Over/Under', 'Even/Odd', 'Rise/Fall', 'Matches/Differs'];

    return (
        <div className='qs-container'>
            {/* ── Top Navbar ── */}
            <div className='qs-header'>
                <div className='qs-header-left'>
                    <div className='qs-price-display'>
                        {currentPrice !== null && currentPrice !== undefined
                            ? currentPrice.toFixed(pipSize)
                            : <Loading is_fullscreen={false} />}
                    </div>
                    {isCountingDown && (
                        <div className='qs-countdown-timer'>
                            <FaClock /> {remainingCountdown}s
                        </div>
                    )}
                    <div className='qs-total-profit' style={{ color: totalProfit >= 0 ? '#00ffa3' : '#ff4d4d' }}>
                        P/L: {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}
                    </div>
                </div>

                <div className='qs-header-right'>
                    {/* Digit Selection UI */}
                    <div className='qs-digit-selector'>
                        {/* Tab-Specific Selectors */}
                        {activeTab === 'Over/Under' && (
                            <select
                                className='qs-native-select short'
                                value={digitType}
                                onChange={(e) => setDigitType(e.target.value)}
                            >
                                <option value='Over'>Over</option>
                                <option value='Under'>Under</option>
                            </select>
                        )}
                        {activeTab === 'Even/Odd' && (
                            <select
                                className='qs-native-select short'
                                value={evenOddType}
                                onChange={(e) => setEvenOddType(e.target.value)}
                            >
                                <option value='Even'>Even</option>
                                <option value='Odd'>Odd</option>
                            </select>
                        )}
                        {activeTab === 'Rise/Fall' && (
                            <select
                                className='qs-native-select short'
                                value={riseFallType}
                                onChange={(e) => setRiseFallType(e.target.value)}
                            >
                                <option value='Rise'>Rise</option>
                                <option value='Fall'>Fall</option>
                            </select>
                        )}
                        {activeTab === 'Matches/Differs' && (
                            <select
                                className='qs-native-select short'
                                value={matchesDiffersType}
                                onChange={(e) => setMatchesDiffersType(e.target.value)}
                            >
                                <option value='Matches'>Matches</option>
                                <option value='Differs'>Differs</option>
                            </select>
                        )}

                        {/* Number Selector for Digit Trades */}
                        {(activeTab === 'Over/Under' || activeTab === 'Matches/Differs') && (
                            <select
                                className='qs-native-select short'
                                value={selectedDigit}
                                onChange={(e) => setSelectedDigit(Number(e.target.value))}
                            >
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        )}
                    </div>

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

                    {/* Strategy selector */}
                    <div className='qs-selector-wrap'>
                        <span className='qs-selector-label'>ENGINE</span>
                        <select
                            className='qs-native-select'
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
                        title='Configuration'
                    >
                        <MdSettings />
                    </button>
                </div>
            </div>

            {/* ── Digit Analysis ── */}
            {(activeTab === 'Over/Under' || activeTab === 'Matches/Differs') && (
                <AnalysisHeader digit_counts={digitCounts} last_digit={lastDigit} />
            )}

            {/* ── Even/Odd ── */}
            {activeTab === 'Even/Odd' && (
                <EvenOddAnalysis digit_counts={digitCounts} tick_history_digits={tickHistoryDigits} />
            )}

            {/* ── Rise/Fall ── */}
            {activeTab === 'Rise/Fall' && (
                <RiseFallAnalysis rise_fall_stats={riseFallStats} tick_directions={tickDirections} />
            )}

            {/* ── RUN / STOP button (always visible below analysis) ── */}
            <div className='qs-run-row'>
                {!isRunning ? (
                    <button className='qs-run-btn' onClick={handleRun}>
                        <FaPlay /> START {mode.toUpperCase()}
                    </button>
                ) : (
                    <button className='qs-stop-btn' onClick={handleStop}>
                        <FaStop /> STOP {mode.toUpperCase()}
                    </button>
                )}
            </div>

            {/* ── Config + Trades ── */}
            <div className='qs-main-content'>
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
                <TransactionTable trades={trades} />
            </div>
        </div>
    );
});

export default QuickStrategy;
