import {assert} from 'chai'
import {APIClient, Asset, FetchProvider, Name, Struct, Transaction} from '@wharfkit/session'

import {mockFetch} from '../utils/mock-fetch'
import {getNewActions, hasOriginalActions} from 'src/utils'

const provider = new FetchProvider('https://jungle4.greymass.com', {fetch: mockFetch})
const client = new APIClient({provider})

@Struct.type('transfer')
export class Transfer extends Struct {
    @Struct.field(Name) from!: Name
    @Struct.field(Name) to!: Name
    @Struct.field(Asset) quantity!: Asset
    @Struct.field('string') memo!: string
}

const mockAction = {
    authorization: [
        {
            actor: 'wharfkit1115',
            permission: 'test',
        },
    ],
    account: 'eosio.token',
    name: 'transfer',
    data: Transfer.from({
        from: 'wharfkit1115',
        to: 'wharfkittest',
        quantity: '0.0001 EOS',
        memo: 'wharfkit plugin - resource provider filtering test',
    }),
}

let info
let header
let mockTransaction

suite('utilities', function () {
    setup(async function () {
        info = await client.v1.chain.get_info()
        header = info.getTransactionHeader(60)
        mockTransaction = Transaction.from({
            ...header,
            actions: [mockAction],
        })
    })
    suite('hasOriginalActions', function () {
        test('action exists alone', function () {
            const hasOriginal = hasOriginalActions(mockTransaction, mockTransaction)
            assert.isTrue(hasOriginal)
        })
        test('action exists alongside others', function () {
            const newAction = {
                authorization: [
                    {
                        actor: 'wharfkit1115',
                        permission: 'test',
                    },
                ],
                account: 'eosio.foo',
                name: 'transfer',
                data: Transfer.from({
                    from: 'wharfkit1115',
                    to: 'wharfkittest',
                    quantity: '0.0001 EOS',
                    memo: 'wharfkit plugin - resource provider filtering test',
                }),
            }
            const newTransaction = Transaction.from({
                ...header,
                actions: [mockAction, newAction],
            })
            const hasOriginal = hasOriginalActions(mockTransaction, newTransaction)
            assert.isTrue(hasOriginal)
            const newTransaction2 = Transaction.from({
                ...header,
                actions: [newAction, mockAction, newAction, newAction],
            })
            const hasOriginal2 = hasOriginalActions(mockTransaction, newTransaction2)
            assert.isTrue(hasOriginal2)
        })
        test("action doesn't exist", function () {
            const newAction = {
                authorization: [
                    {
                        actor: 'wharfkit1115',
                        permission: 'test',
                    },
                ],
                account: 'eosio.foo',
                name: 'transfer',
                data: Transfer.from({
                    from: 'wharfkit1115',
                    to: 'wharfkittest',
                    quantity: '0.0001 EOS',
                    memo: 'wharfkit plugin - resource provider filtering test',
                }),
            }
            const newTransaction = Transaction.from({
                ...header,
                actions: [newAction],
            })
            const hasOriginal = hasOriginalActions(mockTransaction, newTransaction)
            assert.isFalse(hasOriginal)
            const newTransaction2 = Transaction.from({
                ...header,
                actions: [newAction, newAction, newAction],
            })
            const hasOriginal2 = hasOriginalActions(mockTransaction, newTransaction2)
            assert.isFalse(hasOriginal2)
        })
    })
    suite('getNewActions', function () {
        test('identical', function () {
            const newTransaction = Transaction.from({
                ...header,
                actions: [mockAction],
            })
            const diff = getNewActions(mockTransaction, newTransaction)
            assert.lengthOf(diff, 0)
        })
        suite('additions', function () {
            test('appending action', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.foo',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [mockAction, newAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 1)
                assert.isTrue(diff[0].equals(newAction))
            })
            test('appending actions', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.foo',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [mockAction, newAction, newAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 2)
                assert.isTrue(diff[0].equals(newAction))
                assert.isTrue(diff[1].equals(newAction))
            })
            test('prepending action', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.foo',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [newAction, mockAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 1)
                assert.isTrue(diff[0].equals(newAction))
            })
            test('prepending actions', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.foo',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [newAction, newAction, mockAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 2)
                assert.isTrue(diff[0].equals(newAction))
                assert.isTrue(diff[1].equals(newAction))
            })
        })
        suite('modifications', function () {
            test('contract name change', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.foo',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [newAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 1)
            })
            test('contract action change', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.token',
                    name: 'foo',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [newAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 1)
            })
            test('authorization addition', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'foo',
                            permission: 'test',
                        },
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.token',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [newAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 1)
            })
            test('authorization change', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'foo',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.token',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'wharfkit1115',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [newAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 1)
            })
            test('action data change', function () {
                const newAction = {
                    authorization: [
                        {
                            actor: 'wharfkit1115',
                            permission: 'test',
                        },
                    ],
                    account: 'eosio.token',
                    name: 'transfer',
                    data: Transfer.from({
                        from: 'foo',
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit plugin - resource provider filtering test',
                    }),
                }
                const newTransaction = Transaction.from({
                    ...header,
                    actions: [newAction],
                })
                const diff = getNewActions(mockTransaction, newTransaction)
                assert.lengthOf(diff, 1)
            })
        })
    })
})
