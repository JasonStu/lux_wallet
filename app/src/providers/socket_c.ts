import { LuxNetwork } from '@/js/LuxNetwork'
import { ethers } from 'ethers'
import store from '@/store'
import { WalletType } from '@/js/wallets/types'

const SOCKET_RECONNECT_TIMEOUT = 1000

export function connectSocketC(network: LuxNetwork) {
    try {
        const wsUrl = network.getWsUrlC()
        const wsProvider = new ethers.providers.WebSocketProvider(wsUrl)

        if (socketEVM) {
            socketEVM._websocket.onclose = () => {}
            socketEVM.destroy()
            socketEVM = wsProvider
        } else {
            socketEVM = wsProvider
        }

        updateEVMSubscriptions()

        // Save default function so we can keep calling it
        const defaultOnOpen = wsProvider._websocket.onopen
        const defaultOnClose = wsProvider._websocket.onclose

        wsProvider._websocket.onopen = (ev: any) => {
            if (defaultOnOpen) defaultOnOpen(ev)
        }

        wsProvider._websocket.onclose = (ev: any) => {
            if (defaultOnClose) defaultOnClose(ev)

            setTimeout(() => {
                connectSocketC(network)
            }, SOCKET_RECONNECT_TIMEOUT)
        }
    } catch (e) {
        console.info('EVM Websocket connection failed.')
    }
}

let evmSubscriptionTimeout: ReturnType<typeof setTimeout>
const SUBSCRIBE_TIMEOUT = 500

export function updateEVMSubscriptions() {
    if (!socketEVM) {
        // try again later
        if (evmSubscriptionTimeout) {
            clearTimeout(evmSubscriptionTimeout)
        }
        evmSubscriptionTimeout = setTimeout(() => {
            updateEVMSubscriptions()
        }, SUBSCRIBE_TIMEOUT)
        return
    }

    removeBlockHeaderListener(socketEVM)
    addBlockHeaderListener(socketEVM)
}

function removeBlockHeaderListener(provider: ethers.providers.WebSocketProvider) {
    provider.off('block', blockHeaderCallback)
}

function addBlockHeaderListener(provider: ethers.providers.WebSocketProvider) {
    provider.on('block', blockHeaderCallback)
}

function blockHeaderCallback() {
    updateWalletBalanceC()
}

function updateWalletBalanceC() {
    const wallet: null | WalletType = store.state.activeWallet
    if (!wallet) return
    // Refresh the wallet balance
    wallet.getEthBalance()
}

export let socketEVM: ethers.providers.WebSocketProvider
