import DerivAPIBasic from '@deriv/deriv-api/dist/DerivAPIBasic';
import { getSocketURL, website_name } from '@deriv/shared';
import { getLanguage } from '@deriv/translations';
import APIMiddleware from './api-middleware';

export const generateDerivApiInstance = () => {
    const app_id = 118970;
    const socket_url = `wss://${getSocketURL()}/websockets/v3?app_id=${app_id}&l=${getLanguage()}&brand=${website_name.toLowerCase()}`;

    const deriv_socket = new WebSocket(socket_url);
    const deriv_api = new DerivAPIBasic({
        connection: deriv_socket,
        middleware: new APIMiddleware({}),
    });
    return deriv_api;
};

export const getLoginId = () => {
    const login_id = localStorage.getItem('active_loginid');
    if (login_id && login_id !== 'null') return login_id;
    return null;
};

export const getToken = loginid => {
    let active_loginid = loginid || getLoginId();
    const client_accounts = JSON.parse(localStorage.getItem('client.accounts')) || undefined;
    let active_account = (client_accounts && client_accounts[active_loginid]) || {};

    const is_wallet_account = /^(CRW|VRW)/.test(active_loginid);
    if (is_wallet_account && active_account.linked_to) {
        const dtrade_linked_account = active_account.linked_to.find(account => account.platform === 'dtrade');
        if (dtrade_linked_account) {
            active_loginid = dtrade_linked_account.loginid;
            active_account = (client_accounts && client_accounts[active_loginid]) || {};
        }
    }

    return {
        token: active_account?.token || undefined,
        account_id: active_loginid || undefined,
    };
};
