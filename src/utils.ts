import {Action, Transaction} from '@wharfkit/session'

export function hasOriginalActions(original: Transaction, modified: Transaction): boolean {
    return original.actions.every((originalAction: Action) => {
        return modified.actions.some((modifiedAction: Action) => {
            // Ensure the original contract account matches
            const matchesOriginalContractAccount = originalAction.account.equals(
                modifiedAction.account
            )
            // Ensure the original contract action matches
            const matchesOriginalContractAction = originalAction.name.equals(modifiedAction.name)
            // Ensure the original authorization is in tact
            const matchesOriginalAuthorization =
                originalAction.authorization.length === modifiedAction.authorization.length &&
                originalAction.authorization[0].actor.equals(modifiedAction.authorization[0].actor)
            // Ensure the original action data matches
            const matchesOriginalActionData = originalAction.data.equals(modifiedAction.data)
            // Return any action that does not match the original
            return (
                matchesOriginalContractAccount &&
                matchesOriginalContractAction &&
                matchesOriginalAuthorization &&
                matchesOriginalActionData
            )
        })
    })
}

export function getNewActions(original: Transaction, modified: Transaction): Action[] {
    return modified.actions.filter((modifiedAction: Action) => {
        return original.actions.some((originalAction: Action) => {
            // Ensure the original contract account matches
            const matchesOriginalContractAccount = originalAction.account.equals(
                modifiedAction.account
            )
            // Ensure the original contract action matches
            const matchesOriginalContractAction = originalAction.name.equals(modifiedAction.name)
            // Ensure the original authorization is in tact
            const matchesOriginalAuthorization =
                originalAction.authorization.length === modifiedAction.authorization.length &&
                originalAction.authorization[0].actor.equals(modifiedAction.authorization[0].actor)
            // Ensure the original action data matches
            const matchesOriginalActionData = originalAction.data.equals(modifiedAction.data)
            // Return any action that does not match the original
            return !(
                matchesOriginalContractAccount &&
                matchesOriginalContractAction &&
                matchesOriginalAuthorization &&
                matchesOriginalActionData
            )
        })
    })
}
