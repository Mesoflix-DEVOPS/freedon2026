import { api_base } from '@deriv/bot-skeleton/src/services/api/api-base';
import { doUntilDone } from '@deriv/bot-skeleton/src/services/tradeEngine/utils/helpers';
import { copy_trading_logic } from '../copytrading/CopyTradingLogic';

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
    ref?: string;
    status: 'pending' | 'won' | 'lost' | 'error';
    profit?: number;
    buy_price?: number;
    entry_tick?: string | number;
    exit_tick?: string | number;
    contract_id?: number | string;
    contract_type?: string;
}

class TradingLogic {
    private is_running = false;
    private flash_interval: NodeJS.Timeout | null = null;

    async placeTrade(params: TradeParams): Promise<any> {
        if (!api_base.api) throw new Error('API not initialized');

        // Clean up parameters
        const cleanedParams: any = { ...params };

        // Digit trades require 'barrier' instead of 'prediction' in the proposal API
        if (cleanedParams.contract_type?.startsWith('DIGIT') && cleanedParams.prediction !== undefined) {
            cleanedParams.barrier = cleanedParams.prediction.toString();
            delete cleanedParams.prediction;
        }

        // Special case: Rise/Fall (CALL/PUT) does not accept prediction or barrier
        if (cleanedParams.contract_type === 'CALL' || cleanedParams.contract_type === 'PUT') {
            delete cleanedParams.prediction;
            delete cleanedParams.barrier;
        }

        // Remove any undefined/null properties
        Object.keys(cleanedParams).forEach(key => {
            if (cleanedParams[key] === undefined || cleanedParams[key] === null) {
                delete cleanedParams[key];
            }
        });

        const proposal_req = {
            proposal: 1,
            ...cleanedParams,
        };

        try {
            // 1. Get Proposal
            const proposal_res = await api_base.api.send(proposal_req);
            if (proposal_res.error) {
                console.error('[TradeLogic] Proposal error:', proposal_res.error);
                throw proposal_res.error;
            }

            if (!proposal_res.proposal) {
                throw new Error('Proposal failed: No data returned');
            }

            const { id, ask_price } = proposal_res.proposal;

            // 2. Buy
            const buy_res = await api_base.api.send({ buy: id, price: ask_price });
            if (buy_res.error) {
                console.error('[TradeLogic] Buy error:', buy_res.error);
                throw buy_res.error;
            }

            // Broadcast trade for Manual Mirroring
            copy_trading_logic.broadcastTrade({
                ...cleanedParams,
                amount: ask_price || cleanedParams.amount
            });

            const contract_id = buy_res.buy.contract_id;

            // 3. Monitor until resolved
            return new Promise<TradeResult>((resolve, reject) => {
                let poc_sub: any;
                let isResolved = false;

                const cleanup = () => {
                    if (poc_sub && typeof poc_sub.unsubscribe === 'function') {
                        poc_sub.unsubscribe();
                    } else if (contract_id) {
                        try { api_base.api.send({ forget_all: 'proposal_open_contract' }); } catch (e) { }
                    }
                };

                const checkResult = (contract: any) => {
                    if (!contract || isResolved) return;
                    if (contract.is_sold) {
                        isResolved = true;
                        cleanup();
                        const profit = Number(contract.profit);
                        resolve({
                            id: contract.contract_id?.toString() || '',
                            contract_id: contract.contract_id,
                            profit: profit,
                            buy_price: contract.buy_price,
                            contract_type: contract.contract_type,
                            status: profit > 0 ? 'won' : profit < 0 ? 'lost' : 'pending',
                            entry_tick: contract.entry_tick,
                            exit_tick: contract.exit_tick,
                        });
                    }
                };

                try {
                    poc_sub = api_base.api.onMessage().subscribe(({ data }: any) => {
                        if (data?.msg_type === 'proposal_open_contract' && data.proposal_open_contract?.contract_id === contract_id) {
                            checkResult(data.proposal_open_contract);
                        }
                    });

                    api_base.api.send({ proposal_open_contract: 1, contract_id, subscribe: 1 }).then((res: any) => {
                        if (res.error) {
                            cleanup();
                            reject(res.error);
                        } else if (res.proposal_open_contract) {
                            checkResult(res.proposal_open_contract);
                        }
                    }).catch((err: any) => {
                        cleanup();
                        reject(err);
                    });
                } catch (e: any) {
                    cleanup();
                    reject(e);
                }
            });
        } catch (error) {
            console.error('[TradeLogic] Trade placement failed:', error);
            throw error;
        }
    }

    async placeBulkTrades(params: TradeParams, quantity: number): Promise<TradeResult[]> {
        console.log(`[TradeLogic] Executing bulk trades: ${quantity}`);
        const trades = Array.from({ length: quantity }, () => this.placeTrade(params));
        return Promise.all(trades);
    }

    // Flash mode will now be handled via tick updates in QuickStrategy to be "Real-time"
    // So we don't need startFlashTrades here anymore, or we can repurpose it.
    // The user wants it to trade EVERY TICK.
}

export const trading_logic = new TradingLogic();
