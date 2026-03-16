import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';
import { doUntilDone } from '@deriv/bot-skeleton/src/services/tradeEngine/utils/helpers';

export type TradeMode = 'Normal' | 'Bulk' | 'Flash';

export interface TradeParams {
    amount: number;
    basis: 'stake' | 'payout';
    contract_type: string;
    currency: string;
    duration: number;
    duration_unit: string;
    symbol: string;
    barrier?: string;
    barrier2?: string;
    prediction?: number;
}

export interface TradeResult {
    id: string;
    ref: string;
    status: 'pending' | 'won' | 'lost' | 'error';
    profit?: number;
    entry_tick?: string;
    exit_tick?: string;
    contract_id?: number | string;
}

class TradingLogic {
    private is_running = false;
    private flash_interval: NodeJS.Timeout | null = null;

    async placeTrade(params: TradeParams): Promise<any> {
        if (!api_base.api) throw new Error('API not initialized');

        // Clean up parameters - avoid sending 'prediction' if it's undefined or not allowed
        const cleanedParams: any = { ...params };
        if (cleanedParams.prediction === undefined || cleanedParams.prediction === null) {
            delete cleanedParams.prediction;
        }

        // Special case: Rise/Fall (CALL/PUT) does not accept prediction
        if (cleanedParams.contract_type === 'CALL' || cleanedParams.contract_type === 'PUT') {
            delete cleanedParams.prediction;
        }

        const proposal_req = {
            proposal: 1,
            subscribe: 0,
            ...cleanedParams,
        };

        try {
            // 1. Get Proposal
            const proposal_res = await api_base.api.send(proposal_req);
            if (proposal_res.error) {
                console.error('[TradeLogic] Proposal error:', proposal_res.error);
                throw proposal_res.error;
            }

            const { id, ask_price } = proposal_res.proposal;

            // 2. Buy
            const buy_res = await api_base.api.send({ buy: id, price: ask_price });
            if (buy_res.error) {
                console.error('[TradeLogic] Buy error:', buy_res.error);
                throw buy_res.error;
            }

            return buy_res.buy;
        } catch (error) {
            console.error('[TradeLogic] Trade placement failed:', error);
            throw error;
        }
    }

    async placeBulkTrades(params: TradeParams, quantity: number): Promise<any[]> {
        console.log(`[TradeLogic] Executing bulk trades: ${quantity}`);
        const trades = Array.from({ length: quantity }, () => this.placeTrade(params));
        return Promise.all(trades);
    }

    // Flash mode will now be handled via tick updates in QuickStrategy to be "Real-time"
    // So we don't need startFlashTrades here anymore, or we can repurpose it.
    // The user wants it to trade EVERY TICK.
}

export const trading_logic = new TradingLogic();
