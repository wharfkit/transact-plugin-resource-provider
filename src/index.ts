import {
    ABIDef,
    AbiProvider,
    AbstractTransactPlugin,
    Action,
    Asset,
    AssetType,
    Name,
    Serializer,
    Signature,
    SigningRequest,
    Struct,
    TransactContext,
    TransactHookResponse,
    TransactHookTypes,
    Transaction,
} from '@wharfkit/session'

import zlib from 'pako'
import {getNewActions, hasOriginalActions} from './utils'

interface ResourceProviderOptions {
    allowFees?: boolean
    // allowActions?: NameType[]
    maxFee?: AssetType
    url?: string
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

export class ResourceProviderPlugin extends AbstractTransactPlugin {
    readonly allowFees: boolean = false
    // readonly allowActions: Name[] = [
    //     Name.from('eosio.token:transfer'),
    //     Name.from('eosio:buyrambytes'),
    // ]
    readonly maxFee?: Asset
    readonly url?: string

    constructor(options: ResourceProviderOptions) {
        super()
        if (typeof options.allowFees !== 'undefined') {
            this.allowFees = options.allowFees
        }
        // TODO: Allow contact/action combos to be passed in and checked against to ensure no rogue actions were appended.
        // if (typeof options.allowActions !== 'undefined') {
        //     this.allowActions = options.allowActions.map((action) => Name.from(action))
        // }
        if (typeof options.maxFee !== 'undefined') {
            this.maxFee = Asset.from(options.maxFee)
        }
        if (options.url) {
            this.url = options.url
        }
    }

    register(context: TransactContext): void {
        context.addHook(TransactHookTypes.beforeSign, (request, context) =>
            this.request(request, context)
        )
    }

    async request(
        request: SigningRequest,
        context: TransactContext
    ): Promise<TransactHookResponse> {
        // Validate that this request is valid for the resource provider
        this.validateRequest(request, context)

        // Perform the request to the resource provider.
        const response = await context.fetch(this.url, {
            method: 'POST',
            body: JSON.stringify({
                ref: 'unittest',
                request,
                signer: context.session,
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
                // TODO: Notify the script somehow of this, maybe we need an optional logger?
                // Notify that a fee was required but not allowed via allowFees: false.
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
            // TODO: Notify the script somehow of this, maybe we need an optional logger?
            // Notify that the original actions requested were modified somehow, and reject the modification.
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
                // TODO: Notify the script somehow of this, maybe we need an optional logger?
                // Notify that a fee was required but higher than allowed via maxFee.
                return {
                    request,
                }
            }
        }

        // Validate that the response is valid for the session.
        await this.validateResponseData(json)

        // NYI: Interact with interface via context for fee based prompting

        /* Psuedo-code for fee based prompting

        if (response.status === 402) {

            // Prompt for the fee acceptance
            const promptResponse = context.userPrompt({
                title: 'Transaction Fee Required',
                message: `This transaction requires a fee of ${response.json.data.fee} EOS. Do you wish to accept this fee?`,
            })

            // If the user did not accept the fee, return the original request without modification.
            if (!promptResponse) {
                return {
                    request,
                }
            }
        } */

        // Create a new signing request based on the response to return to the session's transact flow.
        const modified = await this.createRequest(json, context)

        // Return the modified transaction and additional signatures
        return {
            request: modified,
            signatures: json.data.signatures.map((sig) => Signature.from(sig)),
        }
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
        // Establish an AbiProvider based on the session context.
        const abiProvider: AbiProvider = {
            getAbi: async (account: Name): Promise<ABIDef> => {
                const response = await context.client.v1.chain.get_abi(account)
                if (!response.abi) {
                    /* istanbul ignore next */
                    throw new Error('could not load abi') // TODO: Better coverage for this
                }
                return response.abi
            },
        }

        // Create a new signing request based on the response to return to the session's transact flow.
        const request = await SigningRequest.create(
            {transaction: response.data.request[1]},
            {
                abiProvider,
                zlib,
            }
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
        if (!firstAuthorizer.actor.equals(context.session.actor)) {
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
