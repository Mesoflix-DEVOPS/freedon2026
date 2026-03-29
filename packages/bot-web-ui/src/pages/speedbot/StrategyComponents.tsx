import React, { useState, useEffect } from 'react';
import { Text, Input, Button } from '@deriv/components';
import { Localize } from '@deriv/translations';
import { observer } from 'mobx-react-lite';
import { MdSettings, MdTrendingUp, MdHistory, MdRefresh } from 'react-icons/md';
import { FaBolt, FaLayerGroup, FaChevronUp, FaChevronDown } from 'react-icons/fa';
import { formatMoney } from '@deriv/shared';
import type { SpeedBotConfig, DigitStats } from './types';

// ─── Digit Analysis (Circles) ────────────────────────────────────────────────
export const AnalysisHeader = observer(({ digit_counts, last_digit }: { digit_counts: number[], last_digit: number | null }) => {
    const total = digit_counts.reduce((a, b) => a + b, 0) || 1;

    const sortedIndices = digit_counts
        .map((count, index) => ({ index, count }))
        .sort((a, b) => (b.count || 0) - (a.count || 0));

    const rankHighest = sortedIndices.length > 0 ? sortedIndices[0].index : 0;
    const rankSecondHighest = sortedIndices.length > 1 ? sortedIndices[1].index : 1;
    const rankLowest = sortedIndices.length > 9 ? sortedIndices[9].index : (sortedIndices.length > 0 ? sortedIndices[sortedIndices.length - 1].index : 9);
    const rankPreLowest = sortedIndices.length > 8 ? sortedIndices[8].index : (sortedIndices.length > 1 ? sortedIndices[sortedIndices.length - 2].index : 8);

    const highestPercent = sortedIndices.length > 0 ? ((digit_counts[rankHighest] / total) * 100).toFixed(2) : '0.00';
    const lowestPercent = ((digit_counts[rankLowest] / total) * 100).toFixed(2);

    return (
        <div className='qs-analysis-header'>
            <div className='qs-analysis-title'>
                <MdTrendingUp className='qs-icon' style={{ marginRight: 8, fontSize: 18 }} />
                <Localize i18n_default_text='Digit Distribution (1000 Ticks)' />
            </div>
            <div className='qs-digit-circles'>
                {digit_counts.map((count, index) => {
                    const percentage = (count / total) * 100;
                    const r = 20;
                    const circ = 2 * Math.PI * r;
                    const dashOffset = circ - (circ * percentage) / 100;
                    const isActive = last_digit === index;

                    let rankClass = 'rank-default';
                    let tagClass = '';
                    if (index === rankHighest) { rankClass = 'rank-1'; tagClass = 'highlight-high'; }
                    else if (index === rankSecondHighest) rankClass = 'rank-2';
                    else if (index === rankLowest) { rankClass = 'rank-lowest'; tagClass = 'highlight-low'; }
                    else if (index === rankPreLowest) rankClass = 'rank-pre-lowest';

                    return (
                        <div key={index} className={`qs-digit-item ${isActive ? 'active' : ''}`}>
                            <div className={`qs-digit-circle-wrapper ${rankClass} ${isActive ? 'is-last' : ''}`}>
                                <svg viewBox='0 0 48 48' width='48' height='48'>
                                    <circle className='bg' cx='24' cy='24' r={r} />
                                    <circle
                                        className='progress'
                                        cx='24'
                                        cy='24'
                                        r={r}
                                        strokeDasharray={`${circ}`}
                                        strokeDashoffset={dashOffset}
                                        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                                    />
                                </svg>
                                <span className='qs-digit-value'>{index}</span>
                            </div>
                            <div className={`qs-digit-percent-tag ${tagClass}`}>
                                {percentage.toFixed(1)}%
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className='qs-stat-summary'>
                <span>Highest: <b className='high'>{highestPercent}%</b></span>
                <span>Lowest: <b className='low'>{lowestPercent}%</b></span>
                <span>Total: <b>{total}</b> ticks</span>
            </div>
        </div>
    );
});

// ─── Even/Odd Analysis (Kept for compatibility, though engine focus is digits)
export const EvenOddAnalysis = observer(({
    digit_counts,
    tick_history_digits,
}: {
    digit_counts: number[];
    tick_history_digits?: number[];
}) => {
    const evenCount = digit_counts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    const oddCount = digit_counts.filter((_, i) => i % 2 !== 0).reduce((a, b) => a + b, 0);
    const total = (evenCount + oddCount) || 1;
    const evenPercent = ((evenCount / total) * 100).toFixed(1);
    const oddPercent = ((oddCount / total) * 100).toFixed(1);

    const last20 = tick_history_digits ? tick_history_digits.slice(-20) : [];

    return (
        <div className='qs-eo-analysis'>
            <div className='qs-analysis-title' style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaLayerGroup style={{ color: 'var(--primary-color)' }} />
                <span>Even / Odd Analysis</span>
            </div>

            {last20.length > 0 && (
                <div className='qs-tick-pills'>
                    {last20.map((digit, i) => {
                        const isEven = digit % 2 === 0;
                        const isLatest = i === last20.length - 1;
                        return (
                            <div
                                key={i}
                                className={`qs-tick-pill ${isEven ? 'pill-even' : 'pill-odd'} ${isLatest ? 'pill-latest' : ''}`}
                            >
                                {isEven ? 'E' : 'O'}
                                {isLatest && <span className='pill-latest-label'>LATEST</span>}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className='qs-dual-bars'>
                <div className='qs-bar-col'>
                    <div className='qs-bar-meta'>
                        <span className='qs-bar-label even-label'>EVEN</span>
                        <span className='qs-bar-count'>{evenCount} ticks</span>
                    </div>
                    <div className='qs-bar-track'>
                        <div className='qs-bar-fill bar-even' style={{ width: `${evenPercent}%` }} />
                    </div>
                    <div className='qs-bar-pct bar-pct-even'>{evenPercent}%</div>
                </div>
                <div className='qs-bar-col'>
                    <div className='qs-bar-meta'>
                        <span className='qs-bar-label odd-label'>ODD</span>
                        <span className='qs-bar-count'>{oddCount} ticks</span>
                    </div>
                    <div className='qs-bar-track'>
                        <div className='qs-bar-fill bar-odd' style={{ width: `${oddPercent}%` }} />
                    </div>
                    <div className='qs-bar-pct bar-pct-odd'>{oddPercent}%</div>
                </div>
            </div>
        </div>
    );
});

// ─── Rise/Fall Analysis ──────
export const RiseFallAnalysis = observer(({
    rise_fall_stats,
    tick_directions,
}: {
    rise_fall_stats: { rise: number; fall: number };
    tick_directions?: ('rise' | 'fall' | 'neutral')[];
}) => {
    const total = (rise_fall_stats.rise + rise_fall_stats.fall) || 1;
    const risePercent = ((rise_fall_stats.rise / total) * 100).toFixed(1);
    const fallPercent = ((rise_fall_stats.fall / total) * 100).toFixed(1);

    const last20 = tick_directions ? tick_directions.slice(-20) : [];

    return (
        <div className='qs-rf-analysis'>
            <div className='qs-analysis-title' style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MdTrendingUp style={{ color: 'var(--primary-color)' }} />
                <span>Rise / Fall Analysis</span>
            </div>

            {last20.length > 0 && (
                <div className='qs-tick-pills'>
                    {last20.map((dir, i) => {
                        const isLatest = i === last20.length - 1;
                        return (
                            <div
                                key={i}
                                className={`qs-tick-pill ${dir === 'rise' ? 'pill-even' : 'pill-odd'} ${isLatest ? 'pill-latest' : ''}`}
                            >
                                {dir === 'rise' ? '↑' : '↓'}
                                {isLatest && <span className='pill-latest-label'>LATEST</span>}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className='qs-dual-bars'>
                <div className='qs-bar-col'>
                    <div className='qs-bar-meta'>
                        <span className='qs-bar-label even-label'>RISE</span>
                        <span className='qs-bar-count'>{rise_fall_stats.rise} ticks</span>
                    </div>
                    <div className='qs-bar-track'>
                        <div className='qs-bar-fill bar-even' style={{ width: `${risePercent}%` }} />
                    </div>
                    <div className='qs-bar-pct bar-pct-even'>{risePercent}%</div>
                </div>
                <div className='qs-bar-col'>
                    <div className='qs-bar-meta'>
                        <span className='qs-bar-label odd-label'>FALL</span>
                        <span className='qs-bar-count'>{rise_fall_stats.fall} ticks</span>
                    </div>
                    <div className='qs-bar-track'>
                        <div className='qs-bar-fill bar-odd' style={{ width: `${fallPercent}%` }} />
                    </div>
                    <div className='qs-bar-pct bar-pct-odd'>{fallPercent}%</div>
                </div>
            </div>
        </div>
    );
});

// ─── Configuration Panel ─────────────────────────────────────────────────────
export const ConfigurationPanel = observer(({
    config,
    updateConfig,
    isOpen,
    onToggle,
    isRunning,
    onResetSession,
}: any) => {
    if (!config) return null;

    return (
        <div className={`qs-config-panel ${isOpen ? 'open' : 'closed'}`}>
            <div className='qs-config-header' onClick={onToggle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <MdSettings style={{ fontSize: 20, color: 'var(--primary-color)' }} />
                    <span className='qs-cfg-title'>Strategy</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                     <button 
                        className='qs-reset-btn' 
                        onClick={(e) => { e.stopPropagation(); onResetSession(); }}
                        title='Reset Session Stats'
                    >
                        <MdRefresh />
                    </button>
                    {isOpen ? <FaChevronUp /> : <FaChevronDown />}
                </div>
            </div>

            {isOpen && (
                <div className='qs-config-content'>
                    <div className='qs-config-section'>
                        <div className='qs-config-item'>
                            <label>TRADING MODE</label>
                            <select
                                className='qs-mode-select'
                                value={config.mode}
                                onChange={(e) => updateConfig({ mode: e.target.value as any })}
                                disabled={isRunning}
                            >
                                <option value='NORMAL'>Normal Mode</option>
                                <option value='BULK'>Bulk Mode</option>
                                <option value='FLASH'>Flash Mode (Every Tick)</option>
                            </select>
                        </div>

                        {config.mode === 'BULK' && (
                            <div className='qs-config-item'>
                                <label>BULK TRADES COUNT</label>
                                <input
                                    className='qs-input'
                                    type='number'
                                    value={config.bulkCount}
                                    onChange={(e: any) => updateConfig({ bulkCount: Number(e.target.value) })}
                                    disabled={isRunning}
                                />
                            </div>
                        )}

                        <div className='qs-config-grid'>
                            <div className='qs-config-item'>
                                <label>STAKE</label>
                                <input
                                    className='qs-input'
                                    type='number'
                                    value={config.stake}
                                    onChange={(e: any) => updateConfig({ stake: Number(e.target.value) })}
                                    disabled={isRunning}
                                />
                            </div>
                            <div className='qs-config-item'>
                                <label>MAX TRADES</label>
                                <input
                                    className='qs-input'
                                    type='number'
                                    value={config.maxTrades}
                                    onChange={(e: any) => updateConfig({ maxTrades: Number(e.target.value) })}
                                    disabled={isRunning}
                                />
                            </div>
                            <div className='qs-config-item'>
                                <label>STOP LOSS</label>
                                <input
                                    className='qs-input'
                                    type='number'
                                    value={config.stopLoss}
                                    onChange={(e: any) => updateConfig({ stopLoss: Number(e.target.value) })}
                                    disabled={isRunning}
                                />
                            </div>
                            <div className='qs-config-item'>
                                <label>TAKE PROFIT</label>
                                <input
                                    className='qs-input'
                                    type='number'
                                    value={config.takeProfit}
                                    onChange={(e: any) => updateConfig({ takeProfit: Number(e.target.value) })}
                                    disabled={isRunning}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

// ─── Transaction Table ────────────────────────────────────────────────────────
export const TransactionTable = observer(({ trades }: { trades: any[] }) => {
    return (
        <div className='qs-transaction-table'>
            <div className='qs-table-header'>
                <MdHistory className='qs-icon' />
                <span>SpeedBot Engine History</span>
            </div>
            <div className='qs-table-container'>
                <table>
                    <thead>
                        <tr>
                            <th>TIME</th>
                            <th>SYMBOL</th>
                            <th>TYPE</th>
                            <th>STAKE</th>
                            <th>STATUS</th>
                            <th>PROFIT</th>
                        </tr>
                    </thead>
                    <tbody>
                        {trades.length === 0 ? (
                            <tr>
                                <td colSpan={6} className='qs-empty-row'>No history found for this session</td>
                            </tr>
                        ) : (
                            trades.map((trade, index) => {
                                const profit = Number(trade.profit) || 0;
                                const statusClass = profit > 0 ? 'result-won' :
                                    profit < 0 ? 'result-lost' : 'result-pending';

                                const profitClass = profit > 0 ? 'profit-positive' : profit < 0 ? 'profit-negative' : '';
                                const profitSign = profit > 0 ? '+' : '';

                                return (
                                    <tr key={index}>
                                        <td>{new Date(trade.timestamp).toLocaleTimeString()}</td>
                                        <td>{trade.symbol?.replace('R_', 'V')}</td>
                                        <td>{trade.tradeType}</td>
                                        <td>{formatMoney('USD', trade.stake || trade.buy_price, true)}</td>
                                        <td className={statusClass}>
                                            {profit > 0 ? 'WON' : profit < 0 ? 'LOST' : 'SOLD'}
                                        </td>
                                        <td className={profitClass}>{profitSign}{formatMoney('USD', profit, true)}</td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
});
