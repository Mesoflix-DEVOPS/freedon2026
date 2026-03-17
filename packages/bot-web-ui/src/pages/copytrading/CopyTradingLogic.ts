import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';

class CopyTradingLogic {
    private copier_token: string = '';
    private is_copying: boolean = false;
    private is_paused: boolean = false;
    private is_manual_mirror: boolean = false;
    private is_master: boolean = false;
    private broadcast_channel: BroadcastChannel | null = null;
    private trade_listener: ((data: any) => void) | null = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.broadcast_channel = new BroadcastChannel('deriv_manual_mirror');
            this.initBroadcastListener();
        }
    }

    private initBroadcastListener() {
        if (!this.broadcast_channel) return;
        this.broadcast_channel.onmessage = (event) => {
            if (this.is_manual_mirror && !this.is_master) {
                console.log('[CopyTrading] Received trade signal:', event.data);
                this.executeMirroredTrade(event.data);
            }
        };
    }

    setManualMirror(enabled: boolean) {
        this.is_manual_mirror = enabled;
        if (enabled) {
            console.log('[CopyTrading] Manual Mirror enabled');
        }
    }

    setAsMaster(enabled: boolean) {
        this.is_master = enabled;
        console.log(`[CopyTrading] Set as Master: ${enabled}`);
    }

    private async executeMirroredTrade(tradeData: any) {
        if (!api_base.api || !this.copier_token) return;

        const { symbol, contract_type, amount, basis, prediction, duration, duration_unit } = tradeData;

        const request = {
            buy: 1, // This is just a placeholder to use the correct params
            price: amount,
            subscribe: 1,
            parameters: {
                amount,
                basis,
                contract_type,
                currency: 'USD', // Should ideally come from client store but logic doesn't have it
                duration,
                duration_unit,
                symbol,
                prediction
            }
        };

        console.log('[CopyTrading] Executing mirrored trade:', request);
        try {
            await api_base.api.send(request);
        } catch (e) {
            console.error('[CopyTrading] Mirror execution failed:', e);
        }
    }

    broadcastTrade(tradeData: any) {
        if (this.is_manual_mirror && this.is_master && this.broadcast_channel) {
            this.broadcast_channel.postMessage(tradeData);
        }
    }

    setCopierToken(token: string) {
        this.copier_token = token;
    }

    getStatus() {
        return {
            is_copying: this.is_copying,
            is_paused: this.is_paused,
            has_token: !!this.copier_token
        };
    }

    async getAccountSettings() {
        if (!api_base.api) return { error: { message: 'API not initialized' } };

        try {
            const response = await api_base.api.send({ get_settings: 1 });
            if (response.error) {
                console.error('[CopyTrading] getAccountSettings error:', response.error);
                return { error: response.error };
            }
            return { data: response.get_settings };
        } catch (err) {
            console.error('[CopyTrading] getAccountSettings exception:', err);
            return { error: err };
        }
    }

    async becomeTrader(profileData: any = {}) {
        if (!api_base.api) return { error: { message: 'API not initialized' } };

        // mandatory fields often required by set_settings on Deriv
        const request = {
            set_settings: 1,
            allow_copiers: 1,
            ...profileData
        };

        console.log('[CopyTrading] Enabling trader mode:', request);

        try {
            const response = await api_base.api.send(request);
            if (response.error) {
                console.error('[CopyTrading] becomeTrader error:', response.error);
                return { error: response.error };
            }
            return { data: response.set_settings };
        } catch (err) {
            console.error('[CopyTrading] becomeTrader exception:', err);
            return { error: err };
        }
    }

    async enableCopyingForToken(token: string, profileData: any = {}) {
        const tempApi = api_base.generateDerivApiInstance();
        try {
            await tempApi.authorize(token);
            const request = {
                set_settings: 1,
                allow_copiers: 1,
                ...profileData
            };
            const response = await tempApi.send(request);
            if (response.error) {
                return { error: response.error };
            }
            return { data: response.set_settings };
        } catch (err: any) {
            return { error: err?.error || err };
        } finally {
            tempApi.disconnect();
        }
    }

    async startCopying(trader_login_id: string, options: {
        assets?: string[];
        max_trade_stake?: number;
        min_trade_stake?: number;
        trade_types?: string[];
    } = {}) {
        if (!api_base.api) return { error: { message: 'API not initialized' } };
        if (!this.copier_token) return { error: { message: 'Copier token not set' } };

        const request: any = {
            copy_start: this.copier_token,
            loginid: trader_login_id,
        };

        if (options.max_trade_stake) request.max_trade_stake = Number(options.max_trade_stake);
        if (options.min_trade_stake) request.min_trade_stake = Number(options.min_trade_stake);

        console.log('[CopyTrading] Starting copy with request:', request);

        try {
            const response = await api_base.api.send(request);
            if (response.error) {
                console.error('[CopyTrading] Start error details:', JSON.stringify(response.error, null, 2));
                return { error: response.error };
            }
            this.is_copying = true;
            this.is_paused = false;
            return { data: response.copy_start };
        } catch (err: any) {
            const errorDetails = err?.error || err;
            console.error('[CopyTrading] Start exception full detail:', JSON.stringify(errorDetails, null, 2));
            return { error: errorDetails };
        }
    }

    async stopCopying(trader_login_id: string) {
        if (!api_base.api) return { error: { message: 'API not initialized' } };

        try {
            const response = await api_base.api.send({
                copy_stop: this.copier_token,
                loginid: trader_login_id
            });
            if (response.error) {
                console.error('[CopyTrading] Stop error:', response.error);
                return { error: response.error };
            }
            this.is_copying = false;
            this.is_paused = false;
            return { data: response.copy_stop };
        } catch (err) {
            console.error('[CopyTrading] Stop exception:', err);
            return { error: err };
        }
    }

    async pauseCopying(trader_login_id: string) {
        const res = await this.stopCopying(trader_login_id);
        if (!res.error) {
            this.is_paused = true;
            this.is_copying = false;
        }
        return res;
    }

    async resumeCopying(trader_login_id: string, options: any = {}) {
        return await this.startCopying(trader_login_id, options);
    }
}

export const copy_trading_logic = new CopyTradingLogic();
