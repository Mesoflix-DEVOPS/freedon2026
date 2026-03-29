export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SpeedBotState = 'IDLE' | 'RUNNING' | 'STOPPING' | 'ERROR';

export type SpeedBotMode = 'NORMAL' | 'FLASH' | 'BULK';

export interface SpeedBotConfig {
    symbol: string;
    stake: number;
    prediction: number;
    direction: 'OVER' | 'UNDER' | 'MATCH' | 'DIFF' | 'EVEN' | 'ODD' | 'RISE' | 'FALL';
    mode: SpeedBotMode;
    bulkCount: number;
    maxTrades: number;
    takeProfit: number;
    stopLoss: number;
}

export interface SpeedBotTick {
    quote: number;
    epoch: number;
    digit: Digit;
}

export interface DigitDetail {
    digit: Digit;
    count: number;
    percentage: number;
}

export interface DigitStats {
    details: DigitDetail[];
    totalTicks: number;
    lastDigit: Digit | null;
}
