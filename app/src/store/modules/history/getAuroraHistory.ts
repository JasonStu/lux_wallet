import { WalletType } from '@/js/wallets/types'
import { getTransactionsForAddresses } from '@/js/Cloud/getTransactionsForAddresses'
import { BlockchainId, Network, SortOrder } from '@luxfi/cloud'
import { filterDuplicateCloudTxs } from '@/js/Cloud/filterDuplicateCloudTxs'
import { sortCloudTxs } from '@/js/Cloud/sortCloudTxs'

const PAGE_SIZE = 100
const SORT = SortOrder.DESC

export async function getCloudHistory(
    wallet: WalletType,
    networkId: number,
    isMainnet: boolean,
    limit?: number
) {
    // Reverse the list so we get history for the most recent address first
    const xInternal = wallet.getAllChangeAddressesX()
    const xExternal = wallet.getAllExternalAddressesX()
    const avmAddrs = []
    // Combine X addresses and reverse ordering so most recent is first
    while (xInternal.length || xExternal.length) {
        const internal = xInternal.pop()
        const external = xExternal.pop()
        internal && avmAddrs.push(internal)
        external && avmAddrs.push(external)
    }

    const pvmAddrs: string[] = wallet.getAllAddressesP().reverse()

    // this shouldn't ever happen, but to avoid getting every transaction...
    if (avmAddrs.length === 0) {
        return []
    }

    const txsCloudX = await getTransactionsForAddresses(
        {
            addresses: avmAddrs,
            blockchainId: BlockchainId.X_CHAIN,
            network: isMainnet ? Network.MAINNET : Network.FUJI,
            pageSize: PAGE_SIZE,
            sortOrder: SORT,
        },
        limit
    )

    const txsCloudP = await getTransactionsForAddresses(
        {
            addresses: pvmAddrs,
            blockchainId: BlockchainId.P_CHAIN,
            network: isMainnet ? Network.MAINNET : Network.FUJI,
            pageSize: PAGE_SIZE,
            sortOrder: SORT,
        },
        limit
    )

    const externalAddrs = xExternal.length > pvmAddrs.length ? xExternal.reverse() : pvmAddrs

    const txsCloudC = await getTransactionsForAddresses(
        {
            addresses: [wallet.getEvmAddressBech(), ...externalAddrs],
            blockchainId: BlockchainId.C_CHAIN,
            network: isMainnet ? Network.MAINNET : Network.FUJI,
            pageSize: PAGE_SIZE,
            sortOrder: SORT,
        },
        limit
    )

    // Join X and P chain transactions
    const joined = [...txsCloudX, ...txsCloudP, ...txsCloudC]
    // Filter duplicates
    const filtered = filterDuplicateCloudTxs(joined)
    // Sort by date
    const sorted = sortCloudTxs(filtered)

    // Trimmed
    const trimmed = sorted.slice(0, limit)

    return trimmed
}
