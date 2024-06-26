import {
    KeyChain as XVMKeyChain,
    KeyPair as XVMKeyPair,
    UTXOSet as XVMUTXOSet,
} from 'luxnet/dist/apis/xvm'

import { UTXOSet as PlatformUTXOSet } from 'luxnet/dist/apis/platformvm'
import { getPreferredHRP } from 'luxnet/dist/utils'
import { ava, xvm, bintools, pChain } from '@/LUX'
import HDKey from 'hdkey'
import { Buffer } from 'luxnet'
import {
    KeyChain as PlatformVMKeyChain,
    KeyPair as PlatformVMKeyPair,
} from 'luxnet/dist/apis/platformvm'
import store from '@/store'

import { LuxNetwork } from '@/js/LuxNetwork'
import { ChainAlias } from './wallets/types'
import { xvmGetAllUTXOs, platformGetAllUTXOs } from '@/helpers/utxo_helper'
import { updateFilterAddresses } from '../providers'
import { listChainsForAddresses } from '@/js/Cloud/listChainsForAddresses'

const INDEX_RANGE: number = 20 // a gap of at least 20 indexes is needed to claim an index unused

const SCAN_SIZE: number = 100 // the total number of utxos to look at initially to calculate last index
const SCAN_RANGE: number = SCAN_SIZE - INDEX_RANGE // How many items are actually scanned
class HdHelper {
    chainId: ChainAlias
    keyChain: XVMKeyChain | PlatformVMKeyChain
    keyCache: {
        [index: number]: XVMKeyPair | PlatformVMKeyPair
    }
    addressCache: {
        [index: number]: string
    }
    hdCache: {
        [index: number]: HDKey
    }
    changePath: string
    masterKey: HDKey
    hdIndex: number
    utxoSet: XVMUTXOSet | PlatformUTXOSet
    isPublic: boolean
    isFetchUtxo: boolean // true if updating balance
    isInit: boolean // true if HD index is found

    constructor(
        changePath: string,
        masterKey: HDKey,
        chainId: ChainAlias = 'X',
        isPublic: boolean = false
    ) {
        this.changePath = changePath
        this.isFetchUtxo = false
        this.isInit = false

        this.chainId = chainId
        const hrp = getPreferredHRP(ava.getNetworkID())
        if (chainId === 'X') {
            this.keyChain = new XVMKeyChain(hrp, chainId)
            this.utxoSet = new XVMUTXOSet()
        } else {
            this.keyChain = new PlatformVMKeyChain(hrp, chainId)
            this.utxoSet = new PlatformUTXOSet()
        }

        this.keyCache = {}
        this.addressCache = {}
        this.hdCache = {}
        this.masterKey = masterKey
        this.hdIndex = 0
        this.isPublic = isPublic
        // this.oninit()
    }

    async oninit() {
        await this.findHdIndex()
    }

    // When the wallet connects to a different network
    // Clear internal data and scan again
    async onNetworkChange() {
        this.clearCache()
        this.isInit = false
        const hrp = getPreferredHRP(ava.getNetworkID())
        if (this.chainId === 'X') {
            this.keyChain = new XVMKeyChain(hrp, this.chainId)
            this.utxoSet = new XVMUTXOSet()
        } else {
            this.keyChain = new PlatformVMKeyChain(hrp, this.chainId)
            this.utxoSet = new PlatformUTXOSet()
        }
        this.hdIndex = 0
        await this.oninit()
    }

    // Increments the hd index by one and adds the key
    // returns the new keypair
    incrementIndex(): number {
        const newIndex: number = this.hdIndex + 1

        if (!this.isPublic) {
            if (this.chainId === 'X') {
                const keychain = this.keyChain as XVMKeyChain
                const newKey = this.getKeyForIndex(newIndex) as XVMKeyPair
                keychain.addKey(newKey)
            } else {
                const keychain = this.keyChain as PlatformVMKeyChain
                const newKey = this.getKeyForIndex(newIndex) as PlatformVMKeyPair
                keychain.addKey(newKey)
            }
        }

        this.hdIndex = newIndex

        // Update websocket addresses with the new one
        updateFilterAddresses()

        return newIndex
    }

    async findHdIndex() {
        // Check if explorer is available

        // @ts-ignore
        const network: LuxNetwork = store.state.Network.selectedNetwork
        const explorerUrl = network.explorerUrl

        if (explorerUrl) {
            this.hdIndex = await this.findLuxilableIndexExplorer()
        } else {
            this.hdIndex = await this.findLuxilableIndexNode()
        }

        if (!this.isPublic) {
            this.updateKeychain()
        }
        this.isInit = true
    }

    // Fetches the utxos for the current keychain
    // and increments the index if last index has a utxo
    async updateUtxos(): Promise<XVMUTXOSet | PlatformUTXOSet> {
        this.isFetchUtxo = true

        if (!this.isInit) {
            console.error('HD Index not found yet.')
        }

        const addrs: string[] = this.getAllDerivedAddresses()
        let result: XVMUTXOSet | PlatformUTXOSet

        if (this.chainId === 'X') {
            result = await xvmGetAllUTXOs(addrs)
        } else {
            result = await platformGetAllUTXOs(addrs)
        }
        this.utxoSet = result // we can use local copy of utxos as cache for some functions

        // If the hd index is full, increment
        const currentAddr = this.getCurrentAddress()
        const currentAddrBuf = bintools.parseAddress(currentAddr, this.chainId)
        const currentUtxos = result.getUTXOIDs([currentAddrBuf])

        if (currentUtxos.length > 0) {
            this.incrementIndex()
        }
        this.isFetchUtxo = false
        return result
    }

    // Returns more addresses than the current index
    getExtendedAddresses() {
        const hdIndex = this.hdIndex
        return this.getAllDerivedAddresses(hdIndex + INDEX_RANGE)
    }

    // Not used?
    getUtxos(): XVMUTXOSet | PlatformUTXOSet {
        return this.utxoSet
    }

    // Updates the helper keychain to contain keys upto the HD Index
    updateKeychain(): XVMKeyChain | PlatformVMKeyChain {
        const hrp = getPreferredHRP(ava.getNetworkID())
        let keychain: XVMKeyChain | PlatformVMKeyChain

        if (this.chainId === 'X') {
            keychain = new XVMKeyChain(hrp, this.chainId)
        } else {
            keychain = new PlatformVMKeyChain(hrp, this.chainId)
        }

        for (let i: number = 0; i <= this.hdIndex; i++) {
            let key: XVMKeyPair | PlatformVMKeyPair
            if (this.chainId === 'X') {
                key = this.getKeyForIndex(i) as XVMKeyPair
                ;(keychain as XVMKeyChain).addKey(key)
            } else {
                key = this.getKeyForIndex(i) as PlatformVMKeyPair
                ;(keychain as PlatformVMKeyChain).addKey(key)
            }
        }
        this.keyChain = keychain
        return keychain
    }

    getKeychain() {
        return this.keyChain
    }

    // Returns all key pairs up to hd index
    getAllDerivedKeys(upTo = this.hdIndex): XVMKeyPair[] | PlatformVMKeyPair[] {
        const set: XVMKeyPair[] | PlatformVMKeyPair[] = []
        for (let i = 0; i <= upTo; i++) {
            if (this.chainId === 'X') {
                const key = this.getKeyForIndex(i) as XVMKeyPair
                ;(set as XVMKeyPair[]).push(key)
            } else {
                const key = this.getKeyForIndex(i) as PlatformVMKeyPair
                ;(set as PlatformVMKeyPair[]).push(key)
            }
        }
        return set
    }

    getAllDerivedAddresses(upTo = this.hdIndex, start = 0): string[] {
        const res = []
        for (let i = start; i <= upTo; i++) {
            const addr = this.getAddressForIndex(i)
            res.push(addr)
        }
        return res
    }

    clearCache() {
        this.keyCache = {}
        this.addressCache = {}
    }

    // Scans the address space of this hd path and finds the last used index using the
    // explorer API.
    async findLuxilableIndexExplorer(startIndex = 0): Promise<number> {
        // The number of addresses to process and request from the explorer at a time
        const upTo = 512

        const addrs = this.getAllDerivedAddresses(startIndex + upTo, startIndex)
        const addrChainsCloud = await listChainsForAddresses(addrs)
        const seenAddrs = addrChainsCloud.map((addrData) => addrData.address)

        for (let i = 0; i < addrs.length - INDEX_RANGE; i++) {
            let gapSize: number = 0

            for (let n = 0; n < INDEX_RANGE; n++) {
                const scanIndex = i + n
                const scanAddr = addrs[scanIndex]

                const rawAddr = scanAddr.split('-')[1]

                const isSeen = seenAddrs.includes(rawAddr)
                if (!isSeen) {
                    // If doesn't exist on any chain
                    gapSize++
                } else {
                    i = i + n
                    break
                }
            }

            // If the gap is reached return the index
            if (gapSize === INDEX_RANGE) {
                return startIndex + i
            }
        }

        return await this.findLuxilableIndexExplorer(startIndex + (upTo - INDEX_RANGE))
    }

    // Uses the node to find last used HD index
    // Only used when there is no explorer API available
    async findLuxilableIndexNode(start: number = 0): Promise<number> {
        const addrs: string[] = []

        // Get keys for indexes start to start+scan_size
        for (let i: number = start; i < start + SCAN_SIZE; i++) {
            const address = this.getAddressForIndex(i)
            addrs.push(address)
        }

        let utxoSet

        if (this.chainId === 'X') {
            utxoSet = (await xvm.getUTXOs(addrs)).utxos
        } else {
            utxoSet = (await pChain.getUTXOs(addrs)).utxos
        }

        // Scan UTXOs of these indexes and try to find a gap of INDEX_RANGE
        for (let i: number = 0; i < addrs.length - INDEX_RANGE; i++) {
            let gapSize: number = 0
            // console.log(`Scan index: ${this.chainId} ${this.changePath}/${i+start}`);
            for (let n: number = 0; n < INDEX_RANGE; n++) {
                const scanIndex: number = i + n
                const addr: string = addrs[scanIndex]
                const addrBuf = bintools.parseAddress(addr, this.chainId)
                const addrUTXOs: string[] = utxoSet.getUTXOIDs([addrBuf])
                if (addrUTXOs.length === 0) {
                    gapSize++
                } else {
                    // Potential improvement
                    i = i + n
                    break
                }
            }

            // If we found a gap of 20, we can return the last fullIndex+1
            if (gapSize === INDEX_RANGE) {
                const targetIndex = start + i
                return targetIndex
            }
        }
        return await this.findLuxilableIndexNode(start + SCAN_RANGE)
    }

    getFirstLuxilableIndex(): number {
        for (let i = 0; i < this.hdIndex; i++) {
            const addr = this.getAddressForIndex(i)
            const addrBuf = bintools.parseAddress(addr, this.chainId)
            const utxoIds = this.utxoSet.getUTXOIDs([addrBuf])
            if (utxoIds.length === 0) {
                return i
            }
        }

        return 0
    }

    // Returns the key of the first index that has no utxos
    getFirstLuxilableAddress(): string {
        const idx = this.getFirstLuxilableIndex()
        return this.getAddressForIndex(idx)
    }

    getCurrentKey(): XVMKeyPair | PlatformVMKeyPair {
        const index: number = this.hdIndex
        return this.getKeyForIndex(index)
    }

    getCurrentAddress(): string {
        const index = this.hdIndex
        return this.getAddressForIndex(index)
    }

    // TODO: Public wallet should never be using this
    getKeyForIndex(index: number, isPrivate: boolean = true): XVMKeyPair | PlatformVMKeyPair {
        // If key is cached return that
        let cacheExternal: XVMKeyPair | PlatformVMKeyPair

        if (this.chainId === 'X') {
            cacheExternal = this.keyCache[index] as XVMKeyPair
        } else {
            cacheExternal = this.keyCache[index] as PlatformVMKeyPair
        }

        if (cacheExternal) return cacheExternal

        const derivationPath: string = `${this.changePath}/${index.toString()}`

        // Get key from cache, if not generate it
        let key: HDKey
        if (this.hdCache[index]) {
            key = this.hdCache[index]
        } else {
            key = this.masterKey.derive(derivationPath) as HDKey
            this.hdCache[index] = key
        }

        let pkHex: string
        if (!this.isPublic) {
            pkHex = key.privateKey.toString('hex')
        } else {
            pkHex = key.publicKey.toString('hex')
        }

        const pkBuf: Buffer = new Buffer(pkHex, 'hex')
        const keypair = this.keyChain.importKey(pkBuf)

        // save to cache
        this.keyCache[index] = keypair
        return keypair
    }

    getAddressForIndex(index: number): string {
        if (this.addressCache[index]) {
            return this.addressCache[index]
        }

        const derivationPath: string = `${this.changePath}/${index.toString()}`
        // let key: HDKey = this.masterKey.derive(derivationPath) as HDKey;

        // Get key from cache, if not generate it
        let key: HDKey
        if (this.hdCache[index]) {
            key = this.hdCache[index]
        } else {
            key = this.masterKey.derive(derivationPath) as HDKey
            this.hdCache[index] = key
        }

        const pkHex = key.publicKey.toString('hex')
        const pkBuff = Buffer.from(pkHex, 'hex')
        const hrp = getPreferredHRP(ava.getNetworkID())

        const chainId = this.chainId

        // No need for PlatformKeypair because addressToString uses chainID to decode
        const keypair = new XVMKeyPair(hrp, chainId)
        const addrBuf = XVMKeyPair.addressFromPublicKey(pkBuff)
        const addr = bintools.addressToString(hrp, chainId, addrBuf)

        this.addressCache[index] = addr
        return addr
    }

    // Given an address find the derived index
    findAddressIndex(addr: string): number | null {
        const addrs = this.getAllDerivedAddresses()
        const index = addrs.indexOf(addr)

        if (index < 0) return null
        return index
    }
}
export { HdHelper }
