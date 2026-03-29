import React, { useState, useEffect } from 'react';
import { FaCog, FaChartLine, FaShieldAlt, FaUserTie, FaUserGraduate } from 'react-icons/fa';
import { useStore } from '@deriv/stores';
import { copy_trading_logic } from './CopyTradingLogic';
import { observer } from 'mobx-react-lite';

const TokenManager: React.FC = observer(() => {
    const { client } = useStore();
    
    // Tokens
    const [copierToken, setCopierToken] = useState('');
    const [traderToken, setTraderToken] = useState('');
    const [savedCopierToken, setSavedCopierToken] = useState<string | null>(null);
    const [savedTraderToken, setSavedTraderToken] = useState<string | null>(null);

    // UI State
    const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isManualMirror, setIsManualMirror] = useState(false);
    const [isMaster, setIsMaster] = useState(false);
    const [activeTab, setActiveTab] = useState<'copier' | 'trader'>('copier');
    const [isProcessing, setIsProcessing] = useState(false);

    // Risk Settings
    const [maxStake, setMaxStake] = useState(100);
    const [minStake, setMinStake] = useState(0.35);

    // Inject styles
    useEffect(() => {
        const styleId = 'copytrading-global-styles';
        if (!document.getElementById(styleId)) {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
                .qs-input {
                    padding: 12px 16px;
                    border: 2px solid #e0e0e0;
                    border-radius: 8px;
                    font-size: 14px;
                    outline: none;
                    width: 100%;
                    box-sizing: border-box;
                    background-color: #fafafa;
                    transition: all 0.2s;
                }
                .qs-input:focus {
                    border-color: #0a1aadff;
                    background-color: #fff;
                }
                .status-badge {
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 12px;
                    font-weight: 700;
                    text-transform: uppercase;
                }
            `;
            document.head.appendChild(styleEl);
        }
    }, []);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    // Load saved tokens
    useEffect(() => {
        const cToken = localStorage.getItem('deriv_copier_token');
        const tToken = localStorage.getItem('deriv_trader_token');
        if (cToken) {
            setSavedCopierToken(cToken);
            setCopierToken(cToken);
        }
        if (tToken) {
            setSavedTraderToken(tToken);
            setTraderToken(tToken);
        }
        if (cToken || tToken) {
            copy_trading_logic.setTokens(cToken || '', tToken || '');
        }
    }, []);

    const saveCopierToken = () => {
        const t = copierToken.trim();
        if (t.length < 10) { setToast({ type: 'ok', text: 'Copier Token Cleared' }); localStorage.removeItem('deriv_copier_token'); setSavedCopierToken(null); return; }
        localStorage.setItem('deriv_copier_token', t);
        setSavedCopierToken(t);
        copy_trading_logic.setTokens(t, savedTraderToken || '');
        setToast({ type: 'ok', text: 'Copier Token Saved' });
    };

    const saveTraderToken = () => {
        const t = traderToken.trim();
        if (t.length < 10) { setToast({ type: 'ok', text: 'Trader Token Cleared' }); localStorage.removeItem('deriv_trader_token'); setSavedTraderToken(null); return; }
        localStorage.setItem('deriv_trader_token', t);
        setSavedTraderToken(t);
        copy_trading_logic.setTokens(savedCopierToken || '', t);
        setToast({ type: 'ok', text: 'Trader Token Saved' });
    };

    const clearTokens = () => {
        if (!window.confirm('Clear all tokens and stop operations?')) return;
        localStorage.removeItem('deriv_copier_token');
        localStorage.removeItem('deriv_trader_token');
        setSavedCopierToken(null);
        setSavedTraderToken(null);
        setCopierToken('');
        setTraderToken('');
        setIsCopying(false);
        setIsPaused(false);
        setToast({ type: 'ok', text: 'Tokens Cleared' });
    };

    const handleStartCopying = async () => {
        if (!savedCopierToken || !savedTraderToken) {
            setToast({ type: 'err', text: 'Both Copier and Trader tokens required' });
            return;
        }

        setIsProcessing(true);
        copy_trading_logic.setRiskSettings(maxStake, minStake);
        
        const res = await copy_trading_logic.startCopying(savedTraderToken, savedCopierToken, {
            max_trade_stake: maxStake,
            min_trade_stake: minStake
        });

        if (res.error) {
            setToast({ type: 'err', text: `Error: ${res.error.message || 'Check tokens'}` });
        } else {
            setIsCopying(true);
            setIsPaused(false);
            setToast({ type: 'ok', text: 'Official Copying Started' });
        }
        setIsProcessing(false);
    };

    const handleStopCopying = async () => {
        if (!savedCopierToken || !savedTraderToken) return;
        setIsProcessing(true);
        const res = await copy_trading_logic.stopCopying(savedTraderToken, savedCopierToken);
        if (!res.error) {
            setIsCopying(false);
            setIsPaused(false);
            setToast({ type: 'ok', text: 'Copying Stopped' });
        }
        setIsProcessing(false);
    };

    const handleEnableTrader = async () => {
        if (!traderToken) {
            setToast({ type: 'err', text: 'Please enter Trader Token (Admin scope)' });
            return;
        }
        setIsProcessing(true);
        const res = await copy_trading_logic.becomeTrader(traderToken);
        if (res.error) {
            setToast({ type: 'err', text: `Failed to enable: ${res.error.message}` });
        } else {
            setToast({ type: 'ok', text: 'Strategy Sharing Enabled!' });
            await copy_trading_logic.startTradeListener(traderToken);
        }
        setIsProcessing(false);
    };

    return (
        <div style={{
            position: 'fixed',
            width: '100%',
            height: isMobile ? 'calc(100vh - 80px)' : 'calc(100vh - 100px)',
            display: 'flex',
            flexDirection: 'column',
            padding: isMobile ? '10px' : '30px',
            backgroundColor: '#f0f2f5',
            overflowY: 'auto',
            fontFamily: "'Inter', sans-serif",
            boxSizing: 'border-box'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', color: '#1a237e', fontWeight: 800 }}>Lite CopyTrader</h1>
                    <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>Client-Side Sync Engine</p>
                </div>
                {(savedCopierToken || savedTraderToken) && (
                    <button onClick={clearTokens} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #ff5252', color: '#ff5252', background: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                        Stop & Disconnect
                    </button>
                )}
            </div>

            {/* Navigation Tabs */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', background: '#fff', padding: '8px', borderRadius: '15px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
                <button
                    onClick={() => setActiveTab('copier')}
                    style={{
                        flex: 1, padding: '15px', borderRadius: '10px', border: 'none',
                        backgroundColor: activeTab === 'copier' ? '#1a237e' : 'transparent',
                        color: activeTab === 'copier' ? '#fff' : '#666',
                        fontWeight: 700, cursor: 'pointer', transition: '0.3s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                    }}
                >
                    <FaUserGraduate size={18} /> COPIER MODE
                </button>
                <button
                    onClick={() => setActiveTab('trader')}
                    style={{
                        flex: 1, padding: '15px', borderRadius: '10px', border: 'none',
                        backgroundColor: activeTab === 'trader' ? '#1a237e' : 'transparent',
                        color: activeTab === 'trader' ? '#fff' : '#666',
                        fontWeight: 700, cursor: 'pointer', transition: '0.3s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                    }}
                >
                    <FaUserTie size={18} /> TRADER MODE
                </button>
            </div>

            {/* Main Content */}
            <div style={{ animation: 'slideInRight 0.4s ease' }}>
                {activeTab === 'copier' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                        
                        {/* Identity Setup */}
                        <div style={{ background: '#fff', borderRadius: '20px', padding: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FaCog color="#1a237e" /> Identity Setup
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#666' }}>Your Copier Token (Trade scope)</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="password"
                                            className="qs-input"
                                            placeholder="Paste Copier Token"
                                            value={copierToken}
                                            onChange={(e) => setCopierToken(e.target.value)}
                                        />
                                        <button onClick={saveCopierToken} style={{ padding: '0 20px', background: '#4caf50', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Save</button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 600, color: '#666' }}>Source Trader Token</label>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="password"
                                            className="qs-input"
                                            placeholder="Paste Trader Token"
                                            value={traderToken}
                                            onChange={(e) => setTraderToken(e.target.value)}
                                        />
                                        <button onClick={saveTraderToken} style={{ padding: '0 20px', background: '#0a1aadff', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Update</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Engine Controls */}
                        {savedCopierToken && savedTraderToken && (
                            <div style={{ background: '#fff', borderRadius: '20px', padding: '30px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0 }}>Engine Controls</h3>
                                    <div className="status-badge" style={{ backgroundColor: isCopying ? '#e8f5e9' : '#fff3e0', color: isCopying ? '#2e7d32' : '#ef6c00' }}>
                                        {isCopying ? '● Running' : '● IDLE'}
                                    </div>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '30px' }}>
                                    <div>
                                        <p style={{ margin: '0 0 15px 0', fontSize: '14px', fontWeight: 700 }}>Risk Management</p>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                                                    <FaShieldAlt color="#f44336" /> MAX STAKE
                                                </label>
                                                <input type="number" className="qs-input" value={maxStake} onChange={(e) => setMaxStake(Number(e.target.value))} />
                                            </div>
                                            <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '12px' }}>
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                                                    <FaShieldAlt color="#4caf50" /> MIN STAKE
                                                </label>
                                                <input type="number" className="qs-input" value={minStake} onChange={(e) => setMinStake(Number(e.target.value))} />
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'center' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: '#f1f8ff', borderRadius: '12px' }}>
                                            <div>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '14px' }}>Manual Mirror (Fallback)</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Local BroadcastChannel sync</p>
                                            </div>
                                            <input type="checkbox" checked={isManualMirror} onChange={(e) => {
                                                setIsManualMirror(e.target.checked);
                                                copy_trading_logic.setManualMirror(e.target.checked);
                                            }} style={{ width: '22px', height: '22px' }} />
                                        </div>
                                        <button
                                            onClick={isCopying ? handleStopCopying : handleStartCopying}
                                            style={{
                                                padding: '20px', borderRadius: '12px', border: 'none',
                                                background: isCopying ? '#ff5252' : '#1a237e',
                                                color: '#fff', fontWeight: 800, fontSize: '16px', cursor: 'pointer',
                                                boxShadow: isCopying ? '0 5px 15px rgba(255,82,82,0.3)' : '0 5px 15px rgba(26,35,126,0.3)'
                                            }}
                                            disabled={isProcessing}
                                        >
                                            {isProcessing ? 'Syncing...' : (isCopying ? '🛑 STOP SYNC' : '🚀 START SYNC')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                ) : (
                    /* TRADER MODE */
                    <div style={{ background: '#fff', borderRadius: '20px', padding: '40px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', textAlign: 'center' }}>
                        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
                            <FaChartLine size={50} color="#1a237e" style={{ marginBottom: '20px' }} />
                            <h2 style={{ margin: '0 0 10px 0' }}>Share Your Trades</h2>
                            <p style={{ color: '#666', marginBottom: '30px' }}>Allow others to copy your success. Requires an API token with Admin scope.</p>
                            
                            <div style={{ textAlign: 'left', marginBottom: '25px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 600, color: '#666', display: 'block', marginBottom: '8px' }}>Trader Admin Token</label>
                                <input
                                    type="password"
                                    className="qs-input"
                                    placeholder="Enter Trader Token"
                                    value={traderToken}
                                    onChange={(e) => setTraderToken(e.target.value)}
                                />
                                <div style={{ fontSize: '11px', color: '#f57c00', marginTop: '10px', background: '#fff3e0', padding: '8px', borderRadius: '5px' }}>
                                    ⚠️ MUST have "Admin" scope enabled in Deriv token settings.
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
                                <div style={{ flex: 1, padding: '15px', background: '#f8f9fa', borderRadius: '12px' }}>
                                    <p style={{ margin: 0, fontSize: '14px', fontWeight: 700 }}>Enable Master Mode</p>
                                    <input type="checkbox" checked={isMaster} onChange={(e) => {
                                        setIsMaster(e.target.checked);
                                        copy_trading_logic.setAsMaster(e.target.checked);
                                    }} style={{ marginTop: '10px', width: '20px', height: '20px' }} />
                                </div>
                            </div>

                            <button
                                onClick={handleEnableTrader}
                                style={{
                                    width: '100%', padding: '18px', borderRadius: '12px', border: 'none',
                                    background: '#1a237e', color: '#fff', fontWeight: 800, fontSize: '16px', cursor: 'pointer'
                                }}
                                disabled={isProcessing}
                            >
                                {isProcessing ? 'Enabling...' : 'ENABLE TRADE SHARING'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%)',
                    background: toast.type === 'ok' ? '#2e7d32' : '#d32f2f', color: '#fff',
                    padding: '12px 25px', borderRadius: '30px', fontWeight: 600, boxShadow: '0 10px 20px rgba(0,0,0,0.1)',
                    display: 'flex', alignItems: 'center', gap: '10px', zIndex: 9999
                }}>
                    {toast.type === 'ok' ? '✓' : '✕'} {toast.text}
                </div>
            )}
            
            <div style={{ padding: '40px 0', opacity: 0.5, fontSize: '12px', textAlign: 'center' }}>
                Lite CopyTrader v1.0 • Built on Deriv API • No Server Dependency
            </div>
        </div>
    );
});

export default TokenManager;
