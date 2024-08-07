import { ava } from '@/LUX'
import { splitToParts } from '@luxfi/wallet-sdk'
import Cloud from '@/js/Cloud/Cloud'
import { isMainnetNetworkID } from '@/store/modules/network/isMainnetNetworkID'
import { isTestnetNetworkID } from '@/store/modules/network/isTestnetNetworkID'
import { Network } from '@luxfi/cloud'
import { Networks } from '@/utils/typeconvert'

export async function listChainsForAddresses(addrs: string[]) {
    const addressLimit = 64
    const addrParts = splitToParts<string>(addrs, addressLimit)

    const netID = ava.getNetworkID()

    // Cannot use cloud for other networks
    if (!isMainnetNetworkID(netID) && !isTestnetNetworkID(netID)) return []
    const network = isMainnetNetworkID(netID) ? Networks.MAINNET : Networks.TESTNET

    const promises = addrParts.map((addresses) => {
        return Cloud.primaryNetwork.getChainIdsForAddresses({
            addresses: addresses.join(','),
            network,
        })
    })

    const results = await Promise.all(promises)
    const flat = results.map((res: any) => res.addresses).flat()

    return flat
}
