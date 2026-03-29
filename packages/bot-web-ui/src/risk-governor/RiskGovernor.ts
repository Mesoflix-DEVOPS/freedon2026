import { EngineType } from './types';

interface RiskState {
    dailyProfit: number;
    dailyDrawdown: number;
    activeTrades: number;
}

export class RiskGovernor {
    private static instance: RiskGovernor;
    private state: Map<string, RiskState> = new Map();

    private constructor() {}

    public static getInstance() {
        if (!RiskGovernor.instance) {
            RiskGovernor.instance = new RiskGovernor();
        }
        return RiskGovernor.instance;
    }

    public static validate(params: {
        engine: EngineType;
        accountId: string;
        symbol: string;
        amount: number;
        stake: number;
        potentialProfit: number;
        isDemo: boolean;
    }) {
        // Basic validation logic
        if (params.amount <= 0) return { allowed: false, reason: 'Invalid trade amount' };
        
        // For now, allow everything unless it's demo and we want to restrict it
        return { allowed: true, reason: '' };
    }

    public static onTradeClose(engine: EngineType, profit: number) {
        console.log(`[RiskGovernor] Trade closed on ${engine}. Profit: ${profit}`);
        // Update risk metrics here if needed
    }
}
