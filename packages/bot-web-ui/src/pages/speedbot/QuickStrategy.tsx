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
import { copy_trading_logic } from './CopyTradingLogic';
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
    const [copierToken, setCopierToken] = useState('');
    const [isCopying, setIsCopying] = useState(false);
    const [copierAssets, setCopierAssets] = useState('');
    const [copierMaxStake, setCopierMaxStake] = useState(100);
    const [copierMinStake, setCopierMinStake] = useState(0.35);

    // Internal Logic State
    const [totalProfit, setTotalProfit] = useState(0);
    const [currentRunCount, setCurrentRunCount] = useState(0);
    const [isCountingDown, setIsCountingDown] = useState(false);
    const [remainingCountdown, setRemainingCountdown] = useState(0);

    const subscriptionId = useRef<string | null>(null);
    const lastTickRef = useRef<any>(null);

    // ... (fetchSymbols, requestTickHistory, useEffects remain same)

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

    const handleStartCopying = async () => {
        if (!copierToken) {
            alert('Please enter a copier API token');
            return;
        }
        copy_trading_logic.setCopierToken(copierToken);
        const assets = copierAssets ? copierAssets.split(',').map(s => s.trim()) : undefined;
        const { error } = await copy_trading_logic.startCopying(client.loginid, {
            assets,
            max_trade_stake: copierMaxStake,
            min_trade_stake: copierMinStake,
        });
        if (error) {
            alert(`Failed to start copying: ${error.message || 'Unknown error'}`);
        } else {
            setIsCopying(true);
        }
    };

    const handleStopCopying = async () => {
        const { error } = await copy_trading_logic.stopCopying(client.loginid);
        if (error) {
            alert(`Failed to stop copying: ${error.message || 'Unknown error'}`);
        } else {
            setIsCopying(false);
        }
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
                    is_running={isRunning}
                    onRun={handleRun}
                    onStop={handleStop}
                    isOpen={isConfigOpen}
                    onToggle={() => setIsConfigOpen(!isConfigOpen)}
                    copierToken={copierToken}
                    setCopierToken={setCopierToken}
                    isCopying={isCopying}
                    onStartCopying={handleStartCopying}
                    onStopCopying={handleStopCopying}
                    copierAssets={copierAssets}
                    setCopierAssets={setCopierAssets}
                    copierMaxStake={copierMaxStake}
                    setCopierMaxStake={setCopierMaxStake}
                    copierMinStake={copierMinStake}
                    setCopierMinStake={setCopierMinStake}
                />

                <TransactionTable trades={trades} />
            </div>
        </div>
    );
});

export default QuickStrategy;
