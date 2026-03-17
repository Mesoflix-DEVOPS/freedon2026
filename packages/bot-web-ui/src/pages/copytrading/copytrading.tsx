import React, { useState, useEffect } from 'react';
import { FaYoutube, FaCog, FaChartLine, FaShieldAlt } from 'react-icons/fa';
import { useStore } from '@deriv/stores';
import { copy_trading_logic } from './CopyTradingLogic';
import { observer } from 'mobx-react-lite';
import { botNotification } from 'Components/bot-notification/bot-notification';

const TokenManager: React.FC = observer(() => {
    const { client } = useStore();
    const [token, setToken] = useState('');
    const [savedToken, setSavedToken] = useState<string | null>(null);
    const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [isCopyTrading, setIsCopyTrading] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isManualMirror, setIsManualMirror] = useState(false);
    const [isMaster, setIsMaster] = useState(false);
    const [activeTab, setActiveTab] = useState<'copier' | 'trader'>('copier');
    const [isTraderEnabled, setIsTraderEnabled] = useState(false);
    const [traderSettings, setTraderSettings] = useState<any>(null);
    const [isLoadingSettings, setIsLoadingSettings] = useState(false);
    const [traderToken, setTraderToken] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Advanced features
    const [maxStake, setMaxStake] = useState(100);
    const [minStake, setMinStake] = useState(0.35);

    // Inject global CSS once on mount (avoids the `jsx global` prop warning)
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
                    transition: border-color 0.2s;
                }
                .qs-input:focus {
                    border-color: #4CAF50;
                }
                @media (max-width: 768px) {
                    input, textarea, select { font-size: 16px !important; }
                    button { touch-action: manipulation; }
                    body { -webkit-overflow-scrolling: touch; overflow-x: hidden; }
                }
            `;
            document.head.appendChild(styleEl);
        }
    }, []);

    // Check if mobile on mount and resize
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Auto-dismiss toast after 3 seconds
    useEffect(() => {
        if (toast) {
            const timer = setTimeout(() => setToast(null), toast.type === 'err' ? 10000 : 4000);
            return () => clearTimeout(timer);
        }
    }, [toast]);

    useEffect(() => {
        const fetchTraderStatus = async () => {
            if (client.is_logged_in) {
                setIsLoadingSettings(true);
                const res = await copy_trading_logic.getAccountSettings();
                if (res.data) {
                    setIsTraderEnabled(!!res.data.allow_copiers);
                    setTraderSettings(res.data);
                }
                setIsLoadingSettings(false);
            }
        };
        fetchTraderStatus();
    }, [client.is_logged_in]);

    // Load saved token on component mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('deriv_copier_token') || localStorage.getItem('deriv_copy_user_token');
            if (saved) {
                setSavedToken(saved);
                copy_trading_logic.setCopierToken(saved);
                const status = copy_trading_logic.getStatus();
                setIsCopyTrading(status.is_copying);
                setIsPaused(status.is_paused);
            }
        } catch (error) {
            console.error('Error loading saved token:', error);
        }
    }, []);

    const saveToken = () => {
        const t = token.trim();
        if (!t) { setToast({ type: 'err', text: 'Token is empty' }); return; }
        if (t.length < 10) { setToast({ type: 'err', text: 'Token is too short' }); return; }
        try {
            localStorage.setItem('deriv_copier_token', t);
            copy_trading_logic.setCopierToken(t);
            setSavedToken(t);
            setToken('');
            setToast({ type: 'ok', text: 'Token saved successfully' });
        } catch (error) {
            console.error('Error saving token:', error);
            setToast({ type: 'err', text: 'Failed to save token' });
        }
    };

    const removeToken = () => {
        if (!window.confirm('Are you sure you want to disconnect? This will stop any active copy trading.')) return;
        try {
            localStorage.removeItem('deriv_copier_token');
            localStorage.removeItem('deriv_copy_user_token');
            if (isCopyTrading) {
                copy_trading_logic.stopCopying(client.loginid);
            }
            setSavedToken(null);
            setIsCopyTrading(false);
            setIsPaused(false);
            setToast({ type: 'ok', text: 'Token removed successfully' });
        } catch (error) {
            console.error('Error removing token:', error);
            setToast({ type: 'err', text: 'Failed to remove token' });
        }
    };

    const toggleCopyTrading = async () => {
        if (!isCopyTrading) {
            if (!client.is_logged_in) {
                setToast({ type: 'err', text: 'Please login to Deriv first' });
                return;
            }
            const res = await copy_trading_logic.startCopying(client.loginid, {
                max_trade_stake: maxStake,
                min_trade_stake: minStake,
            });

            if (res.error) {
                setToast({ type: 'err', text: `Failed: ${res.error.message || 'Unknown error'}` });
            } else {
                setIsCopyTrading(true);
                setIsPaused(false);
                setToast({ type: 'ok', text: 'Copy trading active!' });
            }
        } else {
            const res = await copy_trading_logic.stopCopying(client.loginid);
            if (res.error) {
                setToast({ type: 'err', text: `Stop Failed: ${res.error.message || 'Unknown error'}` });
            } else {
                setIsCopyTrading(false);
                setIsPaused(false);
                setToast({ type: 'ok', text: 'Copy trading stopped' });
            }
        }
    };

    const handlePause = async () => {
        const res = await copy_trading_logic.pauseCopying(client.loginid);
        if (res.error) {
            setToast({ type: 'err', text: `Pause Failed: ${res.error.message || 'Unknown error'}` });
        } else {
            setIsCopyTrading(false);
            setIsPaused(true);
            setToast({ type: 'ok', text: 'Copy trading paused' });
        }
    };

    const toggleManualMirror = () => {
        const next = !isManualMirror;
        setIsManualMirror(next);
        copy_trading_logic.setManualMirror(next);
        setToast({ type: 'ok', text: `Manual Mirror ${next ? 'enabled' : 'disabled'}` });
    };

    const toggleMasterMode = () => {
        const next = !isMaster;
        setIsMaster(next);
        copy_trading_logic.setAsMaster(next);
        setToast({ type: 'ok', text: next ? 'This tab is now the Master' : 'Master mode disabled' });
    };

    const handleBecomeTrader = async (useToken = false) => {
        let res;
        setIsProcessing(true);
        const profileData = {
            account_opening_reason: traderSettings?.account_opening_reason || 'Speculative',
            address_city: traderSettings?.address_city || 'Update Required',
            address_line_1: traderSettings?.address_line_1 || 'Update Required',
            address_postcode: traderSettings?.address_postcode || '000000',
            phone: traderSettings?.phone || '00000000',
            place_of_birth: traderSettings?.place_of_birth || 'ar',
            tax_identification_number: traderSettings?.tax_identification_number || '000000',
            tax_residence: traderSettings?.tax_residence || 'hk',
        };

        try {
            if (useToken) {
                const t = traderToken.trim();
                if (!t) {
                    setToast({ type: 'err', text: 'Please enter a Trader Token' });
                    setIsProcessing(false);
                    return;
                }
                setToast({ type: 'ok', text: 'Verifying external token...' });
                res = await copy_trading_logic.enableCopyingForToken(t, profileData);
            } else {
                if (!client.is_logged_in) {
                    setToast({ type: 'err', text: 'Please login first' });
                    setIsProcessing(false);
                    return;
                }
                setToast({ type: 'ok', text: 'Enabling sharing for your active account...' });
                res = await copy_trading_logic.becomeTrader(profileData);
            }

            if (res.error) {
                let errorMsg = res.error.message || 'Unknown error';
                if (errorMsg.toLowerCase().includes('permission') || errorMsg.toLowerCase().includes('scope')) {
                    errorMsg = 'Permission Denied: Your API token requires the "Admin" scope to enable trade sharing.';
                }
                setToast({ type: 'err', text: `Failed: ${errorMsg}` });
            } else {
                setIsTraderEnabled(true);
                setToast({ type: 'ok', text: 'SUCCESS! Copy-trading is now ALLOWED.' });
                setTraderToken('');

                // Refresh settings for the logged-in account
                if (client.is_logged_in) {
                    const refresh = await copy_trading_logic.getAccountSettings();
                    if (refresh.data) {
                        setIsTraderEnabled(!!refresh.data.allow_copiers);
                        setTraderSettings(refresh.data);
                    }
                }
            }
        } catch (e: any) {
            setToast({ type: 'err', text: `Unexpected Error: ${e.message || 'Check connection'}` });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            width: '100%',
            height: isMobile ? 'calc(100vh - 100px)' : 'calc(100vh - 120px)',
            display: 'flex',
            flexDirection: 'column' as const,
            padding: isMobile ? '10px' : '20px',
            boxSizing: 'border-box' as const,
            overflowX: 'hidden' as const,
            overflowY: 'auto' as const,
            backgroundColor: '#dddbdbff',
            WebkitOverflowScrolling: 'touch' as const
        }}>
            {/* Title */}
            <h2 style={{
                fontWeight: '700',
                fontSize: isMobile ? '20px' : '24px',
                margin: isMobile ? '15px 0 10px' : '20px 0 15px',
                color: '#0a1aadff',
                textAlign: isMobile ? 'center' : 'left' as const
            }}>
                Social Trading Dashboard
            </h2>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '20px',
                backgroundColor: 'white',
                padding: '5px',
                borderRadius: '10px',
                boxShadow: '0 2px 5px rgba(0,0,0,0.05)'
            }}>
                <button
                    onClick={() => setActiveTab('copier')}
                    style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: activeTab === 'copier' ? '#0a1aadff' : 'transparent',
                        color: activeTab === 'copier' ? 'white' : '#666',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Follow a Trader
                </button>
                <button
                    onClick={() => setActiveTab('trader')}
                    style={{
                        flex: 1,
                        padding: '12px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: activeTab === 'trader' ? '#0a1aadff' : 'transparent',
                        color: activeTab === 'trader' ? 'white' : '#666',
                        fontWeight: '600',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                    }}
                >
                    Share Your Trades
                </button>
            </div>

            {activeTab === 'copier' && (
                <>

                    {/* Token Input Section */}
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '12px',
                        padding: isMobile ? '16px' : '20px',
                        marginTop: '5px',
                        boxSizing: 'border-box' as const,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '16px' : '20px', width: '100%' }}>
                            <div style={{
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row' as const,
                                alignItems: 'center',
                                gap: isMobile ? '15px' : '12px',
                                width: '100%'
                            }}>
                                <div style={{
                                    display: 'flex',
                                    flexDirection: 'column' as const,
                                    alignItems: 'center',
                                    backgroundColor: '#f5f5f5',
                                    padding: isMobile ? '10px 14px' : '12px 16px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    border: '1px solid #e0e0e0',
                                    alignSelf: isMobile ? 'center' : 'stretch'
                                }}>
                                    <FaYoutube style={{ color: '#FF0000', fontSize: isMobile ? '22px' : '24px' }} />
                                    <span style={{ color: '#333', fontSize: isMobile ? '10px' : '11px', marginTop: '3px', fontWeight: '500' }}>
                                        Tutorial
                                    </span>
                                </div>
                                <input
                                    type="password"
                                    placeholder="Enter API token"
                                    className="qs-input"
                                    value={token}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
                                />
                                <button
                                    style={{
                                        backgroundColor: '#4CAF50',
                                        color: 'white',
                                        border: 'none',
                                        padding: isMobile ? '14px 16px' : '12px 20px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        whiteSpace: 'nowrap' as const,
                                        transition: 'all 0.2s',
                                        opacity: !token ? 0.6 : 1,
                                        cursor: !token ? 'not-allowed' : 'pointer',
                                        fontSize: isMobile ? '15px' : '14px',
                                        flex: isMobile ? 1 : 'none',
                                        fontWeight: '600',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                    }}
                                    onClick={saveToken}
                                    disabled={!token}
                                >
                                    <span>Save Token</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Advanced Settings Section */}
                    {savedToken && (
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            padding: isMobile ? '20px' : '24px',
                            marginTop: '20px',
                            boxSizing: 'border-box' as const,
                            boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                                <FaCog style={{ color: '#4CAF50', fontSize: '20px' }} />
                                <h3 style={{ margin: 0, fontSize: '18px', color: '#333' }}>Advanced Copy Settings</h3>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FaShieldAlt style={{ color: '#f44336' }} />
                                            <label style={{ fontSize: '13px', fontWeight: '600', color: '#666' }}>Max Stake</label>
                                        </div>
                                        <input
                                            type="number"
                                            className="qs-input"
                                            value={maxStake}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMaxStake(Number(e.target.value))}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FaShieldAlt style={{ color: '#4CAF50' }} />
                                            <label style={{ fontSize: '13px', fontWeight: '600', color: '#666' }}>Min Stake</label>
                                        </div>
                                        <input
                                            type="number"
                                            className="qs-input"
                                            value={minStake}
                                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinStake(Number(e.target.value))}
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', borderLeft: isMobile ? 'none' : '1px solid #eee', paddingLeft: isMobile ? '0' : '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#f9f9f9', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '14px', fontWeight: '600' }}>Manual Mirror Mode</span>
                                        <input type="checkbox" checked={isManualMirror} onChange={toggleManualMirror} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                    </div>
                                    {isManualMirror && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#e3f2fd', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: '600' }}>Set as Master Tab</span>
                                            <input type="checkbox" checked={isMaster} onChange={toggleMasterMode} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                                        </div>
                                    )}
                                    <p style={{ fontSize: '11px', color: '#888', margin: 0 }}>
                                        * Use Manual Mirror if official copytrading returns 'Not Allowed'. Open Master and Follower in different tabs.
                                    </p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '30px', flexWrap: 'wrap' }}>
                                <button
                                    style={{
                                        backgroundColor: isCopyTrading ? '#f44336' : '#4CAF50',
                                        color: 'white',
                                        border: 'none',
                                        padding: isMobile ? '16px 24px' : '15px 35px',
                                        borderRadius: '10px',
                                        fontWeight: '700',
                                        fontSize: isMobile ? '16px' : '16px',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        cursor: 'pointer',
                                        boxShadow: isCopyTrading ? '0 4px 14px rgba(244, 67, 54, 0.4)' : '0 4px 14px rgba(76, 175, 80, 0.4)',
                                        width: isMobile ? '100%' : 'auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '10px'
                                    }}
                                    onClick={toggleCopyTrading}
                                >
                                    {isCopyTrading ? '🛑 Stop' : (isPaused ? '🚀 Resume' : '🚀 Start')}
                                </button>

                                {isCopyTrading && (
                                    <button
                                        style={{
                                            backgroundColor: '#FF9800',
                                            color: 'white',
                                            border: 'none',
                                            padding: isMobile ? '16px 24px' : '15px 35px',
                                            borderRadius: '10px',
                                            fontWeight: '700',
                                            fontSize: isMobile ? '16px' : '16px',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            cursor: 'pointer',
                                            boxShadow: '0 4px 14px rgba(255, 152, 0, 0.4)',
                                            width: isMobile ? '100%' : 'auto',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '10px'
                                        }}
                                        onClick={handlePause}
                                    >
                                        <span>⏸️ Pause</span>
                                    </button>
                                )}
                            </div>

                            <div style={{
                                marginTop: '20px',
                                padding: '12px',
                                backgroundColor: isCopyTrading ? '#e8f5e9' : (isPaused ? '#fff3e0' : '#f5f5f5'),
                                borderRadius: '8px',
                                textAlign: 'center' as const,
                                fontSize: '14px',
                                fontWeight: '600',
                                color: isCopyTrading ? '#2e7d32' : (isPaused ? '#ef6c00' : '#757575'),
                                border: `1px solid ${isCopyTrading ? '#c8e6c9' : (isPaused ? '#ffe0b2' : '#e0e0e0')}`
                            }}>
                                Status: {isCopyTrading ? 'ACTIVE' : (isPaused ? 'PAUSED' : 'INACTIVE')}
                            </div>
                        </div>
                    )}

                    {/* Saved Token Display (Footer-like) */}
                    {savedToken && (
                        <div style={{
                            backgroundColor: '#1a237e',
                            color: 'white',
                            borderRadius: '8px',
                            padding: '12px 20px',
                            marginTop: '20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '13px'
                        }}>
                            <span>Token: <code>{savedToken.slice(0, 4)}...{savedToken.slice(-4)}</code></span>
                            <button
                                onClick={removeToken}
                                style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    color: 'white',
                                    padding: '4px 10px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                Disconnect
                            </button>
                        </div>
                    )}

                    <div style={{
                        marginTop: '25px',
                        padding: '16px 20px',
                        backgroundColor: '#f8f9fa',
                        borderRadius: '8px',
                        borderLeft: '4px solid #2196F3',
                        fontSize: '14px',
                        color: '#333',
                        lineHeight: '1.6',
                        marginBottom: '40px'
                    }}>
                        <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#0a1aadff' }}>
                            Copy Trading Instructions:
                        </p>
                        <ol style={{ margin: '0', paddingLeft: '20px' }}>
                            <li>Ensure you have a valid Deriv API token with 'read' and 'trade' scopes.</li>
                            <li>Set your preferred stake limits and target assets to filter trades.</li>
                            <li>The system will automatically mirror trades from the source account.</li>
                        </ol>

                        <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#fff4e5', borderLeft: '4px solid #ff9800', borderRadius: '4px' }}>
                            <p style={{ margin: '0 0 5px 0', fontWeight: '700', color: '#d32f2f' }}>⚠️ Error "CopyTradingNotAllowed"?</p>
                            <p style={{ margin: 0, fontSize: '13px' }}>
                                This happens if the trader hasn't enabled the "Allow Copiers" setting.
                                <br /><br />
                                <strong>Solution (Official):</strong> The trader must go to the <strong>"Share Your Trades"</strong> tab above and click <strong>"Enable Allow Copiers"</strong>.
                                <br /><br />
                                <strong>Solution 2 (Bypass):</strong> Enable <strong>Manual Mirror Mode</strong> in the "Follow" tab. Open your Master account in one tab (set to 'Master') and your Follower account in another tab.
                            </p>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'trader' && (
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: isMobile ? '20px' : '24px',
                    boxSizing: 'border-box' as const,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                    animation: 'slideInRight 0.3s ease'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                        <FaChartLine style={{ color: '#0a1aadff', fontSize: '24px' }} />
                        <h3 style={{ margin: 0, fontSize: '20px', color: '#333' }}>Become a Strategy Provider</h3>
                    </div>

                    <div style={{
                        padding: '20px',
                        backgroundColor: isTraderEnabled ? '#e8f5e9' : '#fff3e0',
                        borderRadius: '12px',
                        border: `1px solid ${isTraderEnabled ? '#c8e6c9' : '#ffe0b2'}`,
                        textAlign: 'center',
                        marginBottom: '20px'
                    }}>
                        <p style={{ fontSize: '16px', fontWeight: '700', color: isTraderEnabled ? '#2e7d32' : '#ef6c00', margin: '0 0 10px 0' }}>
                            Status: {isTraderEnabled ? 'COPING ALLOWED' : 'COPYING DISABLED'}
                        </p>
                        <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
                            {isTraderEnabled
                                ? 'Your account is currently open for copiers. Others can follow your trades using your API token.'
                                : 'You must enable "Allow Copiers" to let others follow your trades. This requires an API token with "Admin" scope.'}
                        </p>
                    </div>

                    {!isTraderEnabled && (
                        <div style={{ padding: '12px', backgroundColor: '#fff4e5', borderLeft: '4px solid #ff9800', borderRadius: '4px', marginBottom: '20px' }}>
                            <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#d32f2f' }}>
                                ⚠️ IMPORTANT: To enable sharing, your API token MUST have the "Admin" scope selected in the Deriv dashboard.
                            </p>
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        {/* Section 1: Active Account */}
                        <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '10px', border: '1px solid #eee' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#1a237e' }}>Active Account ({client.loginid || 'Not logged in'})</h4>
                            <p style={{ fontSize: '12px', color: '#666', marginBottom: '15px' }}>
                                Use this to enable sharing on the account you are currently logged into. No token required.
                            </p>
                            <button
                                onClick={() => handleBecomeTrader(false)}
                                style={{
                                    width: '100%',
                                    backgroundColor: isTraderEnabled ? '#e0e0e0' : '#2196F3',
                                    color: isTraderEnabled ? '#999' : 'white',
                                    border: 'none',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    fontWeight: '600',
                                    cursor: (isTraderEnabled || !client.is_logged_in || isProcessing) ? 'default' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: isProcessing ? 0.7 : 1
                                }}
                                disabled={isTraderEnabled || !client.is_logged_in || isProcessing}
                            >
                                {isProcessing && !traderToken ? 'Processing...' : (isTraderEnabled ? 'Enabled for My Account' : 'Enable Sharing for Me')}
                            </button>
                        </div>

                        {/* Section 2: External Account */}
                        <div style={{ padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '10px', border: '1px solid #eee' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '15px', color: '#1a237e' }}>Other/External Account</h4>
                            <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
                                Enter the API token of an external account to allow copiers on it.
                            </p>
                            <input
                                type="password"
                                placeholder="Enter external API token"
                                className="qs-input"
                                value={traderToken}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTraderToken(e.target.value)}
                                style={{ marginBottom: '10px', height: '40px' }}
                            />
                            <button
                                onClick={() => handleBecomeTrader(true)}
                                style={{
                                    width: '100%',
                                    backgroundColor: '#4CAF50',
                                    color: 'white',
                                    border: 'none',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    fontWeight: '600',
                                    cursor: (!traderToken || isProcessing) ? 'not-allowed' : 'pointer',
                                    opacity: (!traderToken || isProcessing) ? 0.6 : 1,
                                    transition: 'all 0.2s'
                                }}
                                disabled={!traderToken || isProcessing}
                            >
                                {isProcessing && traderToken ? 'Verifying...' : 'Enable via Token'}
                            </button>
                        </div>
                    </div>

                    <div style={{ marginTop: '25px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px', fontSize: '14px' }}>
                        <p style={{ fontWeight: '700', marginBottom: '10px' }}>Simplified Instructions:</p>
                        <ol style={{ paddingLeft: '20px', margin: 0, lineHeight: '1.6' }}>
                            <li>Create an API token on Deriv for the account you want to use as Trader. <strong>MUST have "Admin" scope selected.</strong></li>
                            <li>Paste that token in the box above.</li>
                            <li>Click <strong>"Enable via Token"</strong> to upgrade your account settings automatically.</li>
                            <li>Once upgraded correctly, you will see a success notification.</li>
                        </ol>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    bottom: '30px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000,
                    padding: '16px 32px',
                    borderRadius: '50px',
                    fontWeight: '600',
                    backgroundColor: toast.type === 'ok' ? '#4CAF50' : '#f44336',
                    color: 'white',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                    animation: 'slideInRight 0.3s ease',
                    whiteSpace: 'nowrap'
                }}>
                    {toast.text}
                </div>
            )}
        </div>
    );
});

export default TokenManager;
