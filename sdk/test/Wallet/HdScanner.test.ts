import * as bip39 from 'bip39';
import bip32 from '@/utils/bip32';

import { getAccountPathLux } from '@/Wallet/helpers/derivationHelper';
import { TEST_MNEMONIC, TEST_MNEMONIC_ADDRS_EXT, TEST_MNEMONIC_ADDRS_INT } from './constants';
import { HdScanner } from '@/Wallet/HdScanner';
import { listChainsForAddresses } from '@/Explorer';
import { HD_SCAN_GAP_SIZE } from '@/Wallet/constants';
import { ChainAddressChainIdMap, BlockchainId } from '@luxfi/cloud';

const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC);
let masterHdKey = bip32.fromSeed(seed);
let accountKey = masterHdKey.derivePath(getAccountPathLux(0));

jest.mock('@/Network/network', () => {
    return {
        activeNetwork: {
            explorerURL: 'test.explorer.network',
        },
        luxnet: {
            getNetworkID: jest.fn().mockReturnValue(1),
        },
        explorer_api: {},
    };
});

jest.mock('@/Explorer', () => {
    return {
        listChainsForAddresses: jest.fn(),
    };
});

describe('hd scanner', () => {
    const scannerExt = new HdScanner(accountKey, false);
    const scannerInt = new HdScanner(accountKey, true);

    it('can derive external X addresses', async () => {
        const testAddrs = TEST_MNEMONIC_ADDRS_EXT.slice(0, 10);
        const addrs = await scannerExt.getAddressesInRange(0, 10);
        expect(addrs).toEqual(testAddrs);
    });

    it('can derive internal X addresses', async () => {
        const testAddrs = TEST_MNEMONIC_ADDRS_INT.slice(0, 10);
        const addrs = await scannerInt.getAddressesInRange(0, 10);
        expect(addrs).toEqual(testAddrs);
    });
});

/**
 * Mock a AddressChains response with the given addresses
 * @param addrs
 */
function addrsToAddressChains(addrs: string[]): ChainAddressChainIdMap[] {
    const addrsSplit = addrs.map((addr) => addr.split('-')[1]);
    const results: ChainAddressChainIdMap[] = [];
    for (let i = 0; i < addrsSplit.length; i++) {
        results.push({
            address: addrsSplit[i],
            //@ts-ignore
            blockchainIds: [BlockchainId.X_CHAIN],
        });
    }
    return results;
}

describe('find index explorer', function () {
    const scanner = new HdScanner(accountKey, false);

    it('10 consecutive slots used', async () => {
        const tenAddrs = TEST_MNEMONIC_ADDRS_EXT.slice(0, 10);
        const dict = addrsToAddressChains(tenAddrs);

        //@ts-ignore
        listChainsForAddresses.mockReturnValue(dict);

        const foundIndex = await scanner.resetIndex();
        expect(foundIndex).toEqual(10);
    });

    it('Multiple gaps up to index', async () => {
        const addrs = [
            scanner.getAddressForIndex(2),
            scanner.getAddressForIndex(4),
            scanner.getAddressForIndex(5),
            scanner.getAddressForIndex(14),
            scanner.getAddressForIndex(19),
        ];

        const dict = addrsToAddressChains(addrs);
        //@ts-ignore
        listChainsForAddresses.mockReturnValue(dict);

        const foundIndex = await scanner.resetIndex();
        expect(foundIndex).toEqual(20);
    });

    it('Maximum gap of HD_SCAN_GAP_SIZE - 1', async () => {
        const addr = scanner.getAddressForIndex(HD_SCAN_GAP_SIZE - 1);
        const dict = addrsToAddressChains([addr]);
        //@ts-ignore
        listChainsForAddresses.mockReturnValue(dict);

        const foundIndex = await scanner.resetIndex();
        expect(foundIndex).toEqual(HD_SCAN_GAP_SIZE);
    });

    it('Single address in the middle', async () => {
        const addrs = [scanner.getAddressForIndex(13)];

        const dict = addrsToAddressChains(addrs);
        //@ts-ignore
        listChainsForAddresses.mockReturnValue(dict);

        const foundIndex = await scanner.resetIndex();
        expect(foundIndex).toEqual(14);
    });

    it('Large gaps', async () => {
        const addrs = [scanner.getAddressForIndex(13), scanner.getAddressForIndex(28), scanner.getAddressForIndex(43)];

        const dict = addrsToAddressChains(addrs);
        //@ts-ignore
        listChainsForAddresses.mockReturnValue(dict);

        const foundIndex = await scanner.resetIndex();
        expect(foundIndex).toEqual(44);
    });

    it('Address above HD_SCAN_GAP_SIZE', async () => {
        const addrs = [scanner.getAddressForIndex(15), scanner.getAddressForIndex(15 + HD_SCAN_GAP_SIZE + 1)];
        const dict = addrsToAddressChains(addrs);
        //@ts-ignore
        listChainsForAddresses.mockReturnValue(dict);

        const foundIndex = await scanner.resetIndex();
        expect(foundIndex).toEqual(16);
    });
});
