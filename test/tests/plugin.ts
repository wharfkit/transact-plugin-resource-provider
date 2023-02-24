import {assert} from 'chai'
import {Action, Asset, Name, Session, SessionArgs, SessionOptions, Struct} from '@wharfkit/session'
import {WalletPluginPrivateKey} from '@wharfkit/wallet-plugin-privatekey'

import ResourceProviderPlugin from '$lib'
import {mockFetch} from '../utils/mock-fetch'

const wallet = new WalletPluginPrivateKey('5Jtoxgny5tT7NiNFp1MLogviuPJ9NniWjnU4wKzaX4t7pL4kJ8s')

const mockSessionArgs: SessionArgs = {
    chain: {
        id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
        url: 'https://jungle4.greymass.com',
    },
    permissionLevel: 'wharfkit1131@test',
    walletPlugin: wallet,
}

const mockResourceProviderPluginOpions = {
    endpoints: {
        aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906:
            'https://eos.greymass.com',
        '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d':
            'https://jungle4.greymass.com',
        '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11':
            'https://telos.greymass.com',
        '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4':
            'https://wax.greymass.com',
    },
}

const mockResourceProviderPlugin = new ResourceProviderPlugin(mockResourceProviderPluginOpions)

const mockSessionOptions: SessionOptions = {
    fetch: mockFetch,
    transactPlugins: [mockResourceProviderPlugin],
}

@Struct.type('transfer')
export class Transfer extends Struct {
    @Struct.field(Name) from!: Name
    @Struct.field(Name) to!: Name
    @Struct.field(Asset) quantity!: Asset
    @Struct.field('string') memo!: string
}

suite('resource provider', function () {
    test('provides free transaction for CPU and NET', async function () {
        this.slow(10000)
        const session = new Session(mockSessionArgs, mockSessionOptions)
        const action = {
            authorization: [
                {
                    actor: 'wharfkit1131',
                    permission: 'test',
                },
            ],
            account: 'eosio.token',
            name: 'transfer',
            data: {
                from: 'wharfkit1131',
                to: 'wharfkittest',
                quantity: '0.0001 EOS',
                memo: 'wharfkit is the best <3',
            },
        }
        const response = await session.transact({
            action,
        })
        if (response.resolved && response.transaction) {
            assert.lengthOf(response.transaction?.actions, 2)
            // Ensure the noop action was properly prepended
            assert.equal(String(response.transaction?.actions[0].account), 'greymassnoop')
            assert.equal(
                String(response.transaction?.actions[0].authorization[0].actor),
                'greymassfuel'
            )
            assert.equal(
                String(response.transaction?.actions[0].authorization[0].permission),
                'cosign'
            )
            // Ensure the original transaction is still identical to the original
            assert.isTrue(
                Action.from({...action, data: Transfer.from(action.data)}).data.equals(
                    response.resolved?.transaction.actions[1].data
                )
            )
        } else {
            assert.fail('No transaction was returned from transact call.')
        }
    })
    test('provides fee-based transaction for RAM purchase (allowFees: true)', async function () {
        this.timeout(5000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        ...mockResourceProviderPluginOpions,
                        allowFees: true,
                    }),
                ],
            }
        )
        const action = {
            authorization: [
                {
                    actor: 'wharfkit1115',
                    permission: 'test',
                },
            ],
            account: 'eosio.token',
            name: 'transfer',
            data: {
                from: 'wharfkit1115',
                to: 'wharfkittest',
                quantity: '0.0001 EOS',
                memo: 'wharfkit plugin - resource provider test (allowFees: true)',
            },
        }
        const response = await session.transact(
            {
                action,
            },
            {broadcast: false}
        )
        if (response.resolved && response.transaction) {
            assert.lengthOf(response.transaction?.actions, 4)
            // Ensure the noop action was properly prepended
            assert.equal(String(response.transaction?.actions[0].account), 'greymassnoop')
            assert.equal(
                String(response.transaction?.actions[0].authorization[0].actor),
                'greymassfuel'
            )
            assert.equal(
                String(response.transaction?.actions[0].authorization[0].permission),
                'cosign'
            )
            // Ensure the fee action was properly prepended
            assert.equal(String(response.transaction?.actions[1].account), 'eosio.token')
            assert.equal(String(response.transaction?.actions[1].name), 'transfer')
            assert.equal(
                String(response.transaction?.actions[1].authorization[0].actor),
                'wharfkit1115'
            )
            assert.equal(
                String(response.transaction?.actions[1].authorization[0].permission),
                'test'
            )
            assert.equal(String(response.transaction?.actions[1].data.from), 'wharfkit1115')
            assert.equal(String(response.transaction?.actions[1].data.to), 'fuel.gm')
            assert.equal(String(response.transaction?.actions[1].data.quantity), '0.0407 EOS')
            // Ensure the ram purchase was properly appended
            assert.equal(String(response.transaction?.actions[2].account), 'eosio')
            assert.equal(String(response.transaction?.actions[2].data.payer), 'greymassfuel')
            assert.equal(String(response.transaction?.actions[2].data.receiver), 'wharfkit1115')
            assert.equal(String(response.transaction?.actions[2].data.quant), '0.0395 EOS')
            // Ensure the original action is still identical to the original
            assert.isTrue(
                Action.from({...action, data: Transfer.from(action.data)}).data.equals(
                    response.resolved?.transaction.actions[3].data
                )
            )
        } else {
            assert.fail('No transaction was returned from transact call.')
        }
    })
    test('provides fee-based transaction for RAM purchase (allowFees: false)', async function () {
        this.timeout(5000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        ...mockResourceProviderPluginOpions,
                        allowFees: false,
                    }),
                ],
            }
        )
        const action = {
            authorization: [
                {
                    actor: 'wharfkit1115',
                    permission: 'test',
                },
            ],
            account: 'eosio.token',
            name: 'transfer',
            data: {
                from: 'wharfkit1115',
                to: 'wharfkittest',
                quantity: '0.0001 EOS',
                memo: 'wharfkit plugin - resource provider test (allowFees: false)',
            },
        }
        const response = await session.transact(
            {
                action,
            },
            {broadcast: false}
        )
        if (response.resolved && response.transaction) {
            // Ensure the original action is still identical to the original
            assert.lengthOf(response.transaction?.actions, 1)
            assert.isTrue(
                Action.from({...action, data: Transfer.from(action.data)}).data.equals(
                    response.resolved?.transaction.actions[0].data
                )
            )
        } else {
            assert.fail('No transaction was returned from transact call.')
        }
    })
    test('rejects fee-based transaction based on limit (0.0001)', async function () {
        this.timeout(5000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        ...mockResourceProviderPluginOpions,
                        allowFees: true,
                        maxFee: '0.0001 EOS',
                    }),
                ],
            }
        )
        const action = {
            authorization: [
                {
                    actor: 'wharfkit1115',
                    permission: 'test',
                },
            ],
            account: 'eosio.token',
            name: 'transfer',
            data: {
                from: 'wharfkit1115',
                to: 'wharfkittest',
                quantity: '0.0001 EOS',
                memo: 'wharfkit plugin - resource provider test (maxFee: 0.0001)',
            },
        }
        const response = await session.transact(
            {
                action,
            },
            {broadcast: false}
        )
        if (response.resolved && response.transaction) {
            // Ensure the original action is still identical to the original
            assert.lengthOf(response.transaction?.actions, 1)
            assert.isTrue(
                Action.from({...action, data: Transfer.from(action.data)}).data.equals(
                    response.resolved?.transaction.actions[0].data
                )
            )
        } else {
            assert.fail('No transaction was returned from transact call.')
        }
    })
    test('accepts fee-based transaction based on limit (1.0000)', async function () {
        this.timeout(5000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        ...mockResourceProviderPluginOpions,
                        maxFee: '0.0001 EOS',
                    }),
                ],
            }
        )
        const action = {
            authorization: [
                {
                    actor: 'wharfkit1115',
                    permission: 'test',
                },
            ],
            account: 'eosio.token',
            name: 'transfer',
            data: {
                from: 'wharfkit1115',
                to: 'wharfkittest',
                quantity: '0.0001 EOS',
                memo: 'wharfkit plugin - resource provider test (maxFee: 0.0001)',
            },
        }
        const response = await session.transact(
            {
                action,
            },
            {broadcast: false}
        )
        if (response.resolved && response.transaction) {
            // Ensure the original action is still identical to the original
            assert.lengthOf(response.transaction?.actions, 1)
            assert.isTrue(
                Action.from({...action, data: Transfer.from(action.data)}).data.equals(
                    response.resolved?.transaction.actions[0].data
                )
            )
        } else {
            assert.fail('No transaction was returned from transact call.')
        }
    })
    test('refuses request to unknown chain, returning original transaction', async function () {
        this.timeout(5000)
        const session = new Session(
            {
                ...mockSessionArgs,
                chain: {
                    id: '38b1d7815474d0c60683ecbea321d723e83f5da6ae5f1c1f9fecc69d9ba96465',
                    url: 'https://libre.greymass.com',
                },
                permissionLevel: 'wharfkit1115@test',
            },
            mockSessionOptions
        )
        const action = {
            authorization: [
                {
                    actor: 'wharfkit1115',
                    permission: 'test',
                },
            ],
            account: 'eosio.token',
            name: 'transfer',
            data: {
                from: 'wharfkit1115',
                to: 'wharfkittest',
                quantity: '0.0001 EOS',
                memo: 'wharfkit plugin - resource provider test (maxFee: 0.0001)',
            },
        }
        const response = await session.transact(
            {
                action,
            },
            {broadcast: false}
        )
        if (response.resolved && response.transaction) {
            // Ensure the original transaction is still identical to the original
            assert.lengthOf(response.transaction?.actions, 1)
            assert.isTrue(
                Action.from({...action, data: Transfer.from(action.data)}).data.equals(
                    response.resolved?.transaction.actions[0].data
                )
            )
        } else {
            assert.fail('No transaction was returned from transact call.')
        }
    })
})
