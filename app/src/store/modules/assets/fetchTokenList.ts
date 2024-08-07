import { TokenList } from '@/store/modules/assets/types'

function mapTokenInfo(token: any) {
    return { ...token, logoURI: token.logoUri }
}

/**
 * Fetch erc20 token information from cloud
 */
export async function fetchTokenList(): Promise<TokenList> {
    return {
        name: 'Lux (C-Chain)',
        logoURI: '/lux-logo.png',
        keywords: [],
        timestamp: '',
        url: '',
        readonly: true,
        version: {
            major: 1,
            minor: 0,
            patch: 0,
        },
        tokens: [],
    }
    const res = await fetch(
        '/token-list.erc20.json'
    )
    const json = await res.json()

    const tokensMainnet = json[43114].tokens.map(mapTokenInfo)
    const tokensTestnet = json[43113].tokens.map(mapTokenInfo)

    return {
        name: 'Lux (C-Chain)',
        logoURI: '/lux-logo.png',
        keywords: [],
        timestamp: '',
        url: '',
        readonly: true,
        version: {
            major: 1,
            minor: 0,
            patch: 0,
        },
        tokens: [...tokensMainnet, ...tokensTestnet],
    }
}
