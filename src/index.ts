import {
    AbstractTransactPlugin,
    Action,
    Asset,
    AssetType,
    Cancelable,
    Canceled,
    ChainDefinition,
    Name,
    PromptResponse,
    Serializer,
    Signature,
    SigningRequest,
    Struct,
    TransactContext,
    TransactHookResponse,
    TransactHookTypes,
    Transaction,
} from '@wharfkit/session'

import {getNewActions, hasOriginalActions} from './utils'

interface ResourceProviderOptions {
    allowFees?: boolean
    // allowActions?: NameType[]
    endpoints?: Record<string, string>
    maxFee?: AssetType
}

interface ResourceProviderResponseData {
    request: [string, object]
    signatures: string[]
    version: unknown
    fee?: AssetType
    costs?: {
        cpu: AssetType
        net: AssetType
        ram: AssetType
    }
}

interface ResourceProviderResponse {
    code: number
    data: ResourceProviderResponseData
}

@Struct.type('transfer')
export class Transfer extends Struct {
    @Struct.field(Name) from!: Name
    @Struct.field(Name) to!: Name
    @Struct.field(Asset) quantity!: Asset
    @Struct.field('string') memo!: string
}
export const defaultOptions = {
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

export class TransactPluginResourceProvider extends AbstractTransactPlugin {
    readonly allowFees: boolean = true
    // readonly allowActions: Name[] = [
    //     Name.from('eosio.token:transfer'),
    //     Name.from('eosio:buyrambytes'),
    // ]
    readonly maxFee?: Asset

    readonly endpoints: Record<string, string> = defaultOptions.endpoints

    constructor(options?: ResourceProviderOptions) {
        super()
        if (options) {
            // Set the endpoints and chains available
            if (options.endpoints) {
                this.endpoints = options.endpoints
            }
            if (typeof options.allowFees !== 'undefined') {
                this.allowFees = options.allowFees
            }
            if (typeof options.maxFee !== 'undefined') {
                this.maxFee = Asset.from(options.maxFee)
            }
            // TODO: Allow contact/action combos to be passed in and checked against to ensure no rogue actions were appended.
            // if (typeof options.allowActions !== 'undefined') {
            //     this.allowActions = options.allowActions.map((action) => Name.from(action))
            // }
        }
    }

    register(context: TransactContext): void {
        context.addHook(
            TransactHookTypes.beforeSign,
            async (
                request: SigningRequest,
                context: TransactContext
            ): Promise<TransactHookResponse> => {
                return this.request(request, context)
            }
        )
    }

    getEndpoint(chain: ChainDefinition): string {
        return this.endpoints[String(chain.id)]
    }

    async request(
        request: SigningRequest,
        context: TransactContext
    ): Promise<TransactHookResponse> {
        // Validate that this request is valid for the resource provider
        this.validateRequest(request, context)

        // Determine appropriate URL for this request
        const endpoint = this.getEndpoint(context.chain)

        // If no endpoint was found, gracefully fail and return the original request.
        if (!endpoint) {
            return {
                request,
            }
        }

        // Assemble the request to the resource provider.
        const url = `${endpoint}/v1/resource_provider/request_transaction`

        // Perform the request to the resource provider.
        const response = await context.fetch(url, {
            method: 'POST',
            body: JSON.stringify({
                ref: 'unittest',
                request,
                signer: context.permissionLevel,
            }),
        })
        const json: ResourceProviderResponse = await response.json()

        // If the resource provider refused to process this request, return the original request without modification.
        if (response.status === 400) {
            return {
                request,
            }
        }

        const requiresPayment = response.status === 402
        if (requiresPayment) {
            // If the resource provider offered transaction with a fee, but plugin doesn't allow fees, return the original transaction.
            if (!this.allowFees) {
                // Notify that a fee was required but not allowed via allowFees: false.
                if (context.ui) {
                    context.ui.status(
                        'Resource provider rejected transaction, fee required to proceed and the application disallowed fees.'
                    )
                }
                return {
                    request,
                }
            }
        }

        // Retrieve the transaction from the response
        const modifiedTransaction = this.getModifiedTransaction(json)
        // Ensure the new transaction has an unmodified version of the original action(s)
        const originalActionsIntact = hasOriginalActions(
            request.getRawTransaction(),
            modifiedTransaction
        )

        if (!originalActionsIntact) {
            // Notify that the original actions requested were modified somehow, and reject the modification.
            if (context.ui) {
                context.ui.status('Resource provider rejected transaction, it was modified.')
            }
            return {
                request,
            }
        }

        // Retrieve all newly appended actions from the modified transaction
        const addedActions = getNewActions(request.getRawTransaction(), modifiedTransaction)

        // TODO: Check that all the addedActions are allowed via this.allowActions

        // Find any transfer actions that were added to the transaction, which we assume are fees
        const addedFees = addedActions
            .filter(
                (action: Action) =>
                    action.account.equals('eosio.token') && action.name.equals('transfer')
            )
            .map(
                (action: Action) =>
                    Serializer.decode({
                        data: action.data,
                        type: Transfer,
                    }).quantity
            )
            .reduce((total: Asset, fee: Asset) => {
                total.units.add(fee.units)
                return total
            }, Asset.from('0.0000 EOS'))

        // If the resource provider offered transaction with a fee, but the fee was higher than allowed, return the original transaction.
        if (this.maxFee) {
            if (addedFees.units > this.maxFee.units) {
                // Notify that a fee was required but higher than allowed via maxFee.
                if (context.ui) {
                    context.ui.status(
                        'Resource provider rejected transaction, the fee amount was an unusually high amount.'
                    )
                }
                return {
                    request,
                }
            }
        }

        // Validate that the response is valid for the session.
        await this.validateResponseData(json)

        // Create a new signing request based on the response to return to the session's transact flow.
        const modified = await this.createRequest(json, context)

        if (context.ui) {
            // Initiate a new cancelable prompt to inform the user of the fee required
            const prompt: Cancelable<PromptResponse> = context.ui.prompt({
                title: 'Fee Required',
                body: 'Resources are required to complete this transaction. Accept fee?',
                elements: [
                    {
                        type: 'asset',
                        data: {
                            label: 'Fee required',
                            value: addedFees,
                        },
                    },
                    {
                        type: 'accept',
                    },
                ],
            })

            // TODO: Set the timer to match the expiration of the transaction
            const timer = setTimeout(() => {
                prompt.cancel('canceled automatically through timeout')
            }, 120000)

            // Return the promise from the prompt
            return prompt
                .then(async () => {
                    // Return the modified transaction and additional signatures
                    return new Promise((r) =>
                        r({
                            request: modified,
                            signatures: json.data.signatures.map((sig) => Signature.from(sig)),
                        })
                    ) as Promise<TransactHookResponse>
                })
                .catch((e) => {
                    // Throw if what we caught was a cancelation
                    if (e instanceof Canceled) {
                        throw e
                    }
                    // Otherwise if it wasn't a cancel, it was a reject, and continue without modification
                    return new Promise((r) => r({request})) as Promise<TransactHookResponse>
                })
                .finally(() => {
                    clearTimeout(timer) // TODO: Remove this, it's just here for testing
                })
        }

        // Return the modified transaction and additional signatures
        return new Promise((r) =>
            r({
                request: modified,
                signatures: json.data.signatures.map((sig) => Signature.from(sig)),
            })
        )
    }

    getModifiedTransaction(json): Transaction {
        switch (json.data.request[0]) {
            case 'action':
                throw new Error('A resource provider providing an "action" is not supported.')
            case 'actions':
                throw new Error('A resource provider providing "actions" is not supported.')
            case 'transaction':
                return Transaction.from(json.data.request[1])
        }
        throw new Error('Invalid request type provided by resource provider.')
    }

    async createRequest(
        response: ResourceProviderResponse,
        context: TransactContext
    ): Promise<SigningRequest> {
        // Create a new signing request based on the response to return to the session's transact flow.
        const request = await SigningRequest.create(
            {transaction: response.data.request[1]},
            context.esrOptions
        )

        // Set the required fee onto the request itself for wallets to process.
        if (response.code === 402 && response.data.fee) {
            request.setInfoKey('txfee', Asset.from(response.data.fee))
        }

        // If the fee costs exist, set them on the request for the signature provider to consume
        if (response.data.costs) {
            request.setInfoKey('txfeecpu', response.data.costs.cpu)
            request.setInfoKey('txfeenet', response.data.costs.net)
            request.setInfoKey('txfeeram', response.data.costs.ram)
        }

        return request
    }
    /**
     * Perform validation against the request to ensure it is valid for the resource provider.
     */
    validateRequest(request: SigningRequest, context: TransactContext): void {
        // Retrieve first authorizer and ensure it matches session context.
        const firstAction = request.getRawActions()[0]
        const firstAuthorizer = firstAction.authorization[0]
        if (!firstAuthorizer.actor.equals(context.permissionLevel.actor)) {
            throw new Error('The first authorizer of the transaction does not match this session.')
        }
    }
    /**
     * Perform validation against the response to ensure it is valid for the session.
     */
    async validateResponseData(response: Record<string, any>): Promise<void> {
        // If the data wasn't provided in the response, throw an error.
        if (!response) {
            throw new Error('Resource provider did not respond to the request.')
        }

        // If a malformed response with a fee was provided, throw an error.
        if (response.code === 402 && !response.data.fee) {
            throw new Error(
                'Resource provider returned a response indicating required payment, but provided no fee amount.'
            )
        }

        // If no signatures were provided, throw an error.
        if (!response.data.signatures || !response.data.signatures[0]) {
            throw new Error('Resource provider did not return a signature.')
        }
    }
}
