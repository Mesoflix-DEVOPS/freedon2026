import React, { useState, useEffect, useRef, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@deriv/stores';
import { Text, Icon, Loading } from '@deriv/components';
import { Localize } from '@deriv/translations';
import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';
import { observer as globalObserver } from '@deriv/bot-skeleton/src/utils/observer';
import { AnalysisHeader, ConfigurationPanel, TransactionTable, EvenOddAnalysis, RiseFallAnalysis } from './StrategyComponents';
import { trading_logic, TradeParams } from './TradingLogic';
import './quick-strategy.scss';

// Symbols and Groups interface
interface SymbolData {
    display_name: string;
    market: string;
    subgroup: string;
    symbol: string;
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
    const [flashLimit, setFlashLimit] = useState(5);
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

    const prevQuoteRef = useRef<number | null>(null);
    const subscriptionId = useRef<string | null>(null);
    const currentlySubscribedSymbolRef = useRef<string | null>(null);

    const fetchSymbols = useCallback(async () => {
        if (!api_base.api) return;
        const res = await api_base.api.send({
            active_symbols: "brief",
            product_type: "basic",
        });

        if (res.active_symbols) {
            const volSymbols = res.active_symbols.filter(
                (s: SymbolData) => s.subgroup === "synthetics" &&
                    (s.market === "synthetic_index" || s.market === "volatility_indices")
            );

            const volatilityGroup: SymbolData[] = [];
            const jumpGroup: SymbolData[] = [];
            const otherGroup: SymbolData[] = [];

            volSymbols.forEach((symbol: SymbolData) => {
                const name = symbol.display_name.toLowerCase();
                if (name.includes("jump")) jumpGroup.push(symbol);
                else if (name.includes("volatility") || name.includes("vol") || symbol.market === "volatility_indices") volatilityGroup.push(symbol);
                else otherGroup.push(symbol);
            });

            setGroupedSymbols({
                volatility: volatilityGroup,
                jump: jumpGroup,
                other: otherGroup,
            });
            setSymbolsList(volSymbols);
        }
    }, []);

    // Fetch Symbols on mount
    useEffect(() => {
        fetchSymbols();
    }, [fetchSymbols]);

    const requestTickHistory = useCallback(async (symbol: string) => {
        if (!api_base.api) return;

        // Forget previous
        if (subscriptionId.current) {
            await api_base.api.send({ forget: subscriptionId.current });
            subscriptionId.current = null; // Clear after forgetting
        }

        const res = await api_base.api.send({
            ticks_history: symbol,
            count: 1000,
            end: "latest",
            style: "ticks",
            subscribe: 1,
        });

        if (res.subscription) {
            subscriptionId.current = res.subscription.id;
            currentlySubscribedSymbolRef.current = symbol;
        }

        if (res.history) {
            const history = res.history.prices.map((p: string, i: number) => ({
                time: res.history.times[i],
                quote: Number(p),
            }));
            setTickHistory(history);
            if (res.pip_size !== undefined) setPipSize(res.pip_size);
        }
    }, []);

    // Effect to handle API initialization and account switches
    useEffect(() => {
        const onApiReady = () => {
            fetchSymbols();
            if (selectedMarket) {
                requestTickHistory(selectedMarket);
            }
        };

        globalObserver.register('api.new_instance', onApiReady);

        // Also trigger immediately if api is already there
        if (api_base.api) {
            onApiReady();
        }

        return () => {
            globalObserver.unregister('api.new_instance', onApiReady);
        };
    }, [fetchSymbols, requestTickHistory, selectedMarket]);

    // Effect for real-time updates (onMessage)
    useEffect(() => {
        if (!api_base.api) return;

        const messageSub = api_base.api.onMessage().subscribe(({ data }: { data: any }) => {
            if (data.msg_type === 'tick' && data.tick.symbol === selectedMarket) {
                const tickQuote = Number(data.tick.quote);
                setTickHistory((prev: any[]) => {
                    const updated = [...prev, { time: data.tick.epoch, quote: tickQuote }];
                    return updated.length > 1000 ? updated.slice(-1000) : updated;
                });
                if (data.tick.pip_size !== undefined) setPipSize(data.tick.pip_size);
            }
        });

        return () => {
            if (messageSub) messageSub.unsubscribe();
        };
    }, [selectedMarket]);

    // Sync ref with state
    useEffect(() => {
        // Update digit counts and stats whenever tickHistory changes
        if (tickHistory.length > 0) {
            const counts = new Array(10).fill(0);
            let rise = 0;
            let fall = 0;

            tickHistory.forEach((tick: { quote: number }, i: number) => {
                const quote = tick.quote;
                const digit = parseInt(quote.toFixed(pipSize).slice(-1));
                counts[digit]++;

                if (i > 0) {
                    if (quote > tickHistory[i - 1].quote) rise++;
                    else if (quote < tickHistory[i - 1].quote) fall++;
                }
            });

            setDigitCounts(counts);
            setRiseFallStats({ rise, fall });

            const latest = tickHistory[tickHistory.length - 1];
            setCurrentPrice(latest.quote);
            setLastDigit(parseInt(latest.quote.toFixed(pipSize).slice(-1)));
        }
    }, [tickHistory, pipSize]);

    const handleMarketChange = (newSymbol: string) => {
        setSelectedMarket(newSymbol);
        localStorage.setItem('qs_selectedSymbol', newSymbol);
        setTickHistory([]);
    };

    const handleRun = async () => {
        if (!client.is_logged_in) {
            alert('Please login first');
            return;
        }

        setIsRunning(true);
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

        const params: TradeParams = {
            amount: stake,
            basis: 'stake',
            contract_type,
            currency: client.currency,
            duration: 1,
            duration_unit: 't',
            symbol: selectedMarket,
            prediction,
        };

        try {
            if (mode === 'Normal') {
                const res = await trading_logic.placeTrade(params);
                setTrades((prev: any[]) => [res, ...prev]);
                setIsRunning(false);
            } else if (mode === 'Bulk') {
                const results = await trading_logic.placeBulkTrades(params, 5);
                setTrades((prev: any[]) => [...results, ...prev]);
                setIsRunning(false);
            } else if (mode === 'Flash') {
                trading_logic.startFlashTrades(params, flashLimit, (res: any) => {
                    setTrades((prev: any[]) => [res, ...prev]);
                });
            }
        } catch (err) {
            console.error('Run failed:', err);
            setIsRunning(false);
        }
    };

    const handleStop = () => {
        if (mode === 'Flash') {
            trading_logic.stopFlashTrades();
        }
        setIsRunning(false);
    };

    const TABS = ['Over/Under', 'Even/Odd', 'Rise/Fall', 'Matches/Differs'];

    return (
        <div className="qs-container">
            {/* Premium Header with Market Selector */}
            <div className="qs-header">
                <div className="qs-market-info">
                    <div className="qs-price-display">
                        {currentPrice !== null && currentPrice !== undefined ?
                            currentPrice.toFixed(pipSize) :
                            <Loading is_fullscreen={false} />
                        }
                    </div>
                </div>
                <div className="qs-market-selector">
                    <label><Localize i18n_default_text="Select Market" /></label>
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
                        {groupedSymbols.jump.length > 0 && (
                            <optgroup label="JUMP INDICES">
                                {groupedSymbols.jump.map((symbol) => (
                                    <option key={symbol.symbol} value={symbol.symbol}>
                                        {symbol.display_name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        {groupedSymbols.other.length > 0 && (
                            <optgroup label="OTHER MARKETS">
                                {groupedSymbols.other.map((symbol) => (
                                    <option key={symbol.symbol} value={symbol.symbol}>
                                        {symbol.display_name}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                    </select>
                </div>
            </div>

            <div className="qs-tabs">
                {TABS.map(tab => (
                    <div
                        key={tab}
                        className={`qs-tab ${activeTab === tab ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab}
                    </div>
                ))}
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
                <ConfigurationPanel
                    stake={stake}
                    setStake={setStake}
                    mode={mode}
                    setMode={setMode}
                    stopLoss={stopLoss}
                    setStopLoss={setStopLoss}
                    flashLimit={flashLimit}
                    setFlashLimit={setFlashLimit}
                    is_running={isRunning}
                    onRun={handleRun}
                    onStop={handleStop}
                />

                <TransactionTable trades={trades} />
            </div>
        </div>
    );
});

export default QuickStrategy;