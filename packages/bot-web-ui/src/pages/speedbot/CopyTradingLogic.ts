import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';

class CopyTradingLogic {
    private copier_token: string = '';
    private is_copying: boolean = false;

    setCopierToken(token: string) {
        this.copier_token = token;
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

        if (options.assets && options.assets.length > 0) request.assets = options.assets;
        if (options.max_trade_stake) request.max_trade_stake = Number(options.max_trade_stake);
        if (options.min_trade_stake) request.min_trade_stake = Number(options.min_trade_stake);
        if (options.trade_types && options.trade_types.length > 0) request.trade_types = options.trade_types;

        console.log('[CopyTrading] Starting copy with request:', request);

        try {
            const response = await api_base.api.send(request);
            if (response.error) {
                console.error('[CopyTrading] Start error:', response.error);
                return { error: response.error };
            }
            return { data: response.copy_start };
        } catch (err) {
            console.error('[CopyTrading] Start exception:', err);
            return { error: err };
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
            return { data: response.copy_stop };
        } catch (err) {
            console.error('[CopyTrading] Stop exception:', err);
            return { error: err };
        }
    }
}

export const copy_trading_logic = new CopyTradingLogic();
