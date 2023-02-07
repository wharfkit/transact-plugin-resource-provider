import {assert} from 'chai'
import {
    Action,
    Asset,
    Name,
    PrivateKey,
    Session,
    SessionArgs,
    SessionOptions,
    Struct,
} from '@wharfkit/session'
import {WalletPluginPrivateKey} from '@wharfkit/wallet-plugin-privatekey'

import ResourceProviderPlugin from '$lib'
import {mockFetch} from '../utils/mock-fetch'

const url = 'https://jungle4.greymass.com/v1/resource_provider/request_transaction'
// const url = 'http://localhost:8080/v1/resource_provider/request_transaction' // Use for local Resource Provider testing

const mockResourceProviderPlugin = new ResourceProviderPlugin({
    url,
})

const wallet = new WalletPluginPrivateKey({
    privateKey: PrivateKey.from('5Jtoxgny5tT7NiNFp1MLogviuPJ9NniWjnU4wKzaX4t7pL4kJ8s'),
})

const mockSessionArgs: SessionArgs = {
    chain: {
        id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
        url: 'https://jungle4.greymass.com',
    },
    permissionLevel: 'wharfkit1131@test',
    walletPlugin: wallet,
}

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
        this.timeout(6000000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        allowFees: true,
                        url,
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
        this.timeout(6000000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        allowFees: false,
                        url,
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
        this.timeout(6000000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        allowFees: true,
                        maxFee: '0.0001 EOS',
                        url,
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
        this.timeout(6000000)
        const session = new Session(
            {
                ...mockSessionArgs,
                permissionLevel: 'wharfkit1115@test',
            },
            {
                ...mockSessionOptions,
                transactPlugins: [
                    new ResourceProviderPlugin({
                        maxFee: '0.0001 EOS',
                        url,
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
})
