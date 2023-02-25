# @wharfkit/transact-plugin-resource-provider

A `transactPlugin` for use with the `@wharfkit/session` library that provides resources to perform transactions.

## Caveats

-   Resource Provider API endpoint must conform to the [Resource Provider API specification](https://forums.eoscommunity.org/t/initial-specification-for-the-resource-provider-api-endpoint/1546).
-   To enable fees, the `allowFees` parameter must be specified and set to `true`.
-   Any fees must be paid in the networks system token, deployed on the `eosio.token` account using the standard token contract.

## Installation

The `@wharfkit/transact-plugin-resource-provider` package is distributed as a module on [npm](https://www.npmjs.com/package/@wharfkit/transact-plugin-resource-provider).

```
yarn add @wharfkit/transact-plugin-resource-provider
# or
npm install --save @wharfkit/transact-plugin-resource-provider
```

## Usage

Include when configuring the Session Kit:

```ts
import {TransactPluginResourceProvider} from '@wharfkit/transact-plugin-resource-provider'

const kit = new SessionKit({
    // ... your other options
    transactPlugins: [new TransactPluginResourceProvider()],
})
```

Or when you are manually configuring a Session:

```ts
import {TransactPluginResourceProvider} from '@wharfkit/transact-plugin-resource-provider'

const session = new Session({
    // ... your other options
    transactPlugins: [new TransactPluginResourceProvider()],
})
```

The plugin is also capable of utilizing any API that conforms to the [Resource Provider API specification](https://forums.eoscommunity.org/t/initial-specification-for-the-resource-provider-api-endpoint/1546). To change the default endpoints, specify them in the constructor as a key/value pair using the chainId and URL.

```ts
import {TransactPluginResourceProvider} from '@wharfkit/transact-plugin-resource-provider'

const session = new Session({
    // ... your other options
    transactPlugins: [
        new TransactPluginResourceProvider({
            endpoints: {
                '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d':
                    'https://jungle4.greymass.com',
            },
        }),
    ],
})
```

The full list of options that can be passed in during instantiation are defined in the `ResourceProviderOptions`:

```ts
interface ResourceProviderOptions {
    // Defaults to true, determines whether or not the user will be prompted with fees.
    allowFees?: boolean
    // The API endpoints to request resources from.
    endpoints?: Record<string, string>
    // The maximum allowed fee, if a fee exists. Provides a sanity check against the API.
    maxFee?: AssetType
}
```

## Developing

You need [Make](https://www.gnu.org/software/make/), [node.js](https://nodejs.org/en/) and [yarn](https://classic.yarnpkg.com/en/docs/install) installed.

Clone the repository and run `make` to checkout all dependencies and build the project. See the [Makefile](./Makefile) for other useful targets. Before submitting a pull request make sure to run `make lint`.

---

Made with ☕️ & ❤️ by [Greymass](https://greymass.com), if you find this useful please consider [supporting us](https://greymass.com/support-us).
