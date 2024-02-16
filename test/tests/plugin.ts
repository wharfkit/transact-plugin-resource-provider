import {assert} from 'chai'
import {
    Action,
    APIClient,
    Asset,
    FetchProvider,
    Name,
    PermissionLevel,
    PlaceholderName,
    PlaceholderPermission,
    Serializer,
    Session,
    SessionArgs,
    SessionOptions,
    Struct,
} from '@wharfkit/session'
import {ContractKit} from '@wharfkit/contract'
import {
    makeClient,
    makeMockTransaction,
    mockSession,
    mockSessionArgs,
    mockSessionOptions,
} from '@wharfkit/mock-data'

import {TransactPluginResourceProvider} from '$lib'

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

@Struct.type('transfer')
export class Transfer extends Struct {
    @Struct.field(Name) from!: Name
    @Struct.field(Name) to!: Name
    @Struct.field(Asset) quantity!: Asset
    @Struct.field('string') memo!: string
}

suite('resource provider', function () {
    suite('functionality', function () {
        test('provides free transaction for CPU and NET', async function () {
            this.slow(10000)
            const session = new Session(
                {
                    ...mockSessionArgs,
                    permissionLevel: 'wharfkit1113@test',
                },
                {
                    ...mockSessionOptions,
                    transactPlugins: [new TransactPluginResourceProvider()],
                }
            )
            const action = {
                authorization: [
                    {
                        actor: 'wharfkit1113',
                        permission: 'test',
                    },
                ],
                account: 'eosio.token',
                name: 'transfer',
                data: {
                    from: 'wharfkit1113',
                    to: 'wharfkittest',
                    quantity: '0.0001 EOS',
                    memo: 'wharfkit is the best... <3',
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
        // test('provides fee-based transaction for RAM purchase (allowFees: true)', async function () {
        //     this.timeout(5000)
        //     const session = new Session(
        //         {
        //             ...mockSessionArgs,
        //             permissionLevel: 'wharfkit1115@test',
        //         },
        //         {
        //             ...mockSessionOptions,
        //             transactPlugins: [
        //                 new TransactPluginResourceProvider({
        //                     ...mockResourceProviderPluginOpions,
        //                     allowFees: true,
        //                 }),
        //             ],
        //         }
        //     )
        //     const action = {
        //         authorization: [
        //             {
        //                 actor: 'wharfkit1115',
        //                 permission: 'test',
        //             },
        //         ],
        //         account: 'eosio.token',
        //         name: 'transfer',
        //         data: {
        //             from: 'wharfkit1115',
        //             to: 'wharfkittest',
        //             quantity: '0.0001 EOS',
        //             memo: 'wharfkit plugin - resource provider test (allowFees: true)',
        //         },
        //     }
        //     const response = await session.transact(
        //         {
        //             action,
        //         },
        //         {broadcast: false}
        //     )
        //     if (response.resolved && response.transaction) {
        //         assert.lengthOf(response.transaction?.actions, 4)
        //         // Ensure the noop action was properly prepended
        //         assert.equal(String(response.transaction?.actions[0].account), 'greymassnoop')
        //         assert.equal(
        //             String(response.transaction?.actions[0].authorization[0].actor),
        //             'greymassfuel'
        //         )
        //         assert.equal(
        //             String(response.transaction?.actions[0].authorization[0].permission),
        //             'cosign'
        //         )
        //         // Ensure the fee action was properly prepended
        //         assert.equal(String(response.transaction?.actions[1].account), 'eosio.token')
        //         assert.equal(String(response.transaction?.actions[1].name), 'transfer')
        //         assert.equal(
        //             String(response.transaction?.actions[1].authorization[0].actor),
        //             'wharfkit1115'
        //         )
        //         assert.equal(
        //             String(response.transaction?.actions[1].authorization[0].permission),
        //             'test'
        //         )
        //         assert.equal(String(response.transaction?.actions[1].data.from), 'wharfkit1115')
        //         assert.equal(String(response.transaction?.actions[1].data.to), 'fuel.gm')
        //         assert.equal(String(response.transaction?.actions[1].data.quantity), '0.0407 EOS')
        //         // Ensure the ram purchase was properly appended
        //         assert.equal(String(response.transaction?.actions[2].account), 'eosio')
        //         assert.equal(String(response.transaction?.actions[2].data.payer), 'greymassfuel')
        //         assert.equal(String(response.transaction?.actions[2].data.receiver), 'wharfkit1115')
        //         assert.equal(String(response.transaction?.actions[2].data.quant), '0.0395 EOS')
        //         // Ensure the original action is still identical to the original
        //         assert.isTrue(
        //             Action.from({...action, data: Transfer.from(action.data)}).data.equals(
        //                 response.resolved?.transaction.actions[3].data
        //             )
        //         )
        //     } else {
        //         assert.fail('No transaction was returned from transact call.')
        //     }
        // })
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
                        new TransactPluginResourceProvider({
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
                        new TransactPluginResourceProvider({
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
                        new TransactPluginResourceProvider({
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
                {
                    ...mockSessionOptions,
                    transactPlugins: [new TransactPluginResourceProvider()],
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
    suite('templating placeholder values', function () {
        test('from contract kit', async function () {
            const session = new Session(
                {
                    ...mockSessionArgs,
                    permissionLevel: 'wharfkit1113@active',
                },
                {
                    ...mockSessionOptions,
                    transactPlugins: [new TransactPluginResourceProvider()],
                }
            )
            const kit = new ContractKit(
                {
                    client: makeClient('https://jungle4.greymass.com'),
                },
                {
                    abiCache: session.abiCache,
                }
            )
            const contract = await kit.load('eosio')
            const action = contract.action('buyram', {
                payer: 'wharfkit1113',
                receiver: 'wharfkit1113',
                quant: '1.0000 EOS',
            })
            const result = await session.transact({action})
            @Struct.type('buyram')
            class buyram extends Struct {
                @Struct.field(Name) payer!: Name
                @Struct.field(Name) receiver!: Name
                @Struct.field(Asset) quant!: Asset
            }
            const claim = buyram.from(result.transaction?.actions[2].data)
            assert.isTrue(claim.payer.equals('wharfkit1113'))
            assert.isTrue(claim.receiver.equals('wharfkit1113'))
            assert.isTrue(claim.quant.equals('1.0000 EOS'))
            assert.isTrue(
                result.transaction?.actions[0].authorization[0].actor.equals('greymassfuel')
            )
            assert.isTrue(
                result.transaction?.actions[0].authorization[0].permission.equals('cosign')
            )
            assert.isTrue(
                result.transaction?.actions[1].authorization[0].actor.equals('wharfkit1113')
            )
            assert.isTrue(
                result.transaction?.actions[1].authorization[0].permission.equals('active')
            )
        })

        test('from full transaction', async function () {
            const session = new Session(
                {
                    ...mockSessionArgs,
                    permissionLevel: 'wharfkit1113@test',
                },
                {
                    ...mockSessionOptions,
                    transactPlugins: [new TransactPluginResourceProvider()],
                }
            )
            const info = await makeClient().v1.chain.get_info()
            const transaction = makeMockTransaction(info)
            const object = Serializer.decode({data: transaction.actions[0].data, type: Transfer})
            object.from = PlaceholderName
            transaction.actions[0].data = Serializer.encode({object})
            transaction.actions[0].authorization = [
                PermissionLevel.from({actor: PlaceholderName, permission: PlaceholderPermission}),
            ]
            const result = await session.transact({transaction})
            const transfer = Transfer.from(result.transaction?.actions[1].data)
            assert.isTrue(transfer.from.equals('wharfkit1113'))
            assert.isTrue(
                result.transaction?.actions[0].authorization[0].actor.equals('greymassfuel')
            )
            assert.isTrue(
                result.transaction?.actions[0].authorization[0].permission.equals('cosign')
            )
            assert.isTrue(
                result.transaction?.actions[1].authorization[0].actor.equals('wharfkit1113')
            )
            assert.isTrue(result.transaction?.actions[1].authorization[0].permission.equals('test'))
        })
    })
})
