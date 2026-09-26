[**esphome-client**](../README.md)

***

[Home](../README.md) / TransportLike

# Interface: TransportLike

Structural interface mirroring the public surface of `Transport`. Both the real `Transport` and the test-only `MockTransport` (from
`esphome-client/testing`) implement this so [EspHomeClient](../classes/EspHomeClient.md) can drive either with no concrete-class coupling. Consumers who never write
tests can ignore this interface; only the host class and the test infrastructure reference it.

## Extends

- `AsyncDisposable`.`Disposable`.`AsyncIterable`\<[`InboundMessage`](InboundMessage.md)\>

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="isencrypted"></a> `isEncrypted` | `readonly` | `boolean` | Whether the transport is operating in `noise-data` phase (encrypted). |

## Methods

### enterNoiseHandshake()

```ts
enterNoiseHandshake(): void;
```

Transition from `plaintext` to `noise-handshake`. One-way for the lifetime of the open transport.

#### Returns

`void`

***

### firstByte()

```ts
firstByte(signal?): Promise<0 | 1>;
```

Read the indicator byte at the head of the receive buffer (`0x00` plaintext or `0x01` noise) without consuming it.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional cancellation signal. |

#### Returns

`Promise`\<`0` \| `1`\>

The indicator byte.

***

### installCipher()

```ts
installCipher(cipher): void;
```

Transition from `noise-handshake` to `noise-data`. Installs the cipher pair used to encrypt and decrypt subsequent frames.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `cipher` | [`NoiseCipherPair`](NoiseCipherPair.md) | The receive/send cipher pair from the completed Noise handshake. |

#### Returns

`void`

***

### nextNoiseHandshakeFrame()

```ts
nextNoiseHandshakeFrame(signal?): Promise<Buffer<ArrayBufferLike>>;
```

Read the next noise handshake frame from the inbound queue. Only valid in `noise-handshake` phase.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `signal?` | [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) | Optional cancellation signal. |

#### Returns

`Promise`\<`Buffer`\<`ArrayBufferLike`\>\>

The raw handshake frame bytes.

***

### send()

```ts
send(type, payload): Promise<void>;
```

Send one outbound message. Routes through the active phase's framing.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `number` | Message type identifier. |
| `payload` | `Buffer` | Encoded message body. |

#### Returns

`Promise`\<`void`\>

***

### sendNoiseHandshakeFrame()

```ts
sendNoiseHandshakeFrame(frame): Promise<void>;
```

Send one raw noise handshake frame. Only valid in `noise-handshake` phase.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `frame` | `Buffer` | Raw handshake bytes. |

#### Returns

`Promise`\<`void`\>
