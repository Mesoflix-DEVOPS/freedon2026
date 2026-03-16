import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';

class CopyTradingLogic {
    private copier_token: string = '';
    private is_copying: boolean = false;
    private is_paused: boolean = false;

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
