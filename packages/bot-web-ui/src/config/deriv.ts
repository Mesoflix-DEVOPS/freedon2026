import { getAppId, getSocketURL, website_name } from '@deriv/shared';
import { getLanguage } from '@deriv/translations';

/**
 * Returns the Deriv WebSocket URL with the correct app_id, language, and brand.
 */
export const getDerivWSUrl = () => {
    const app_id = getAppId() || 96624;
    const language = getLanguage() || 'EN';
    const brand = website_name ? website_name.toLowerCase() : 'deriv';
    
    return `wss://${getSocketURL()}/websockets/v3?app_id=${app_id}&l=${language}&brand=${brand}`;
};
