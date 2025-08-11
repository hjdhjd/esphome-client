[**esphome-client**](README.md)

***

[Home](README.md) / esphome-client

# esphome-client

## Classes

### EspHomeClient

ESPHome API client for communicating with ESPHome devices.
Implements the ESPHome native API protocol over TCP with optional Noise encryption.

This client automatically handles encryption based on the presence of a pre-shared key (PSK). When a PSK is provided, the client will attempt an encrypted connection
first and fall back to plaintext if the device doesn't support encryption. Without a PSK, only plaintext connections are attempted.

#### Emits

connect - Connected to device with encryption status (boolean).

#### Emits

disconnect - Disconnected from device with optional reason string.

#### Emits

message - Raw message received with type and payload in MessageEventData format.

#### Emits

entities - List of discovered entities after enumeration completes.

#### Emits

telemetry - Generic telemetry update for any entity with TelemetryData.

#### Emits

heartbeat - Heartbeat response received (ping/pong).

#### Emits

time - Time response received with epoch seconds as number.

#### Emits

deviceInfo - Device information received with DeviceInfo and encryption status.

#### Emits

- Type-specific telemetry events (e.g., "cover", "light", "switch", "binary_sensor", "sensor", "text_sensor", "number", "lock").

#### Example

```typescript
// Create a client without encryption for devices that don't require it.
const client = new EspHomeClient({
  host: "192.168.1.100",
  logger: log
});
client.connect();

// Create a client with encryption - will try encrypted first, then plaintext.
const encryptedClient = new EspHomeClient({
  host: "192.168.1.100",
  port: 6053,
  psk: "base64encodedkey",
  logger: log
});
encryptedClient.connect();

// Create a client with custom client ID and server name validation.
const customClient = new EspHomeClient({
  host: "192.168.1.100",
  clientId: "my-custom-client",
  serverName: "garage-controller",
  psk: "base64encodedkey",
  logger: log
});
customClient.connect();

// Listen for connection events to know when the device is ready.
client.on("connect", (usingEncryption) => {
  console.log(`Connected ${usingEncryption ? 'with' : 'without'} encryption`);
});

// Listen for discovered entities to see what's available.
client.on("entities", (entities) => {
  // Log all available entity IDs for reference.
  client.logAllEntityIds();
});

// Send commands using entity IDs once entities are discovered.
await client.sendSwitchCommand("switch-garagedoor", true);
await client.sendLightCommand("light-light", { state: true, brightness: 0.8 });
await client.sendCoverCommand("cover-door", { command: "open" });
```

#### Extends

- `EventEmitter`

#### Constructors

##### Constructor

```ts
new EspHomeClient(options): EspHomeClient;
```

Creates a new ESPHome client instance. The client can be configured for both encrypted and unencrypted connections depending on the provided options. When a PSK
is provided, the client will automatically attempt encryption first and fall back to plaintext if the device doesn't support it.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EspHomeClientOptions`](#esphomeclientoptions) | Configuration options for the client connection. |

###### Returns

[`EspHomeClient`](#esphomeclient)

###### Example

```typescript
// Minimal configuration for unencrypted connection.
const client = new EspHomeClient({ host: "192.168.1.100" });

// Full configuration with all options except serverName.
const client = new EspHomeClient({
  host: "192.168.1.100",
  port: 6053,
  clientId: "homebridge-ratgdo",
  psk: "base64encodedkey",
  logger: myLogger
});
```

###### Overrides

```ts
EventEmitter.constructor
```

#### Accessors

##### isEncrypted

###### Get Signature

```ts
get isEncrypted(): boolean;
```

Return whether we are on an encrypted connection or not.

###### Returns

`boolean`

`true` if we are on an encrypted connection, `false` otherwise.

#### Methods

##### connect()

```ts
connect(): void;
```

Connect to the ESPHome device and start communication. This method initializes a new connection. If an encryption key is provided, it will attempt an encrypted
connection first and fall back to plaintext if the device doesn't support encryption. Without an encryption key, only plaintext connections are attempted.

###### Returns

`void`

##### deviceInfo()

```ts
deviceInfo(): Nullable<DeviceInfo>;
```

Return the device information of the connected ESPHome device if available.

###### Returns

[`Nullable`](types.md#nullable)\<[`DeviceInfo`](#deviceinfo-2)\>

The device information if available, or `null`.

##### disconnect()

```ts
disconnect(): void;
```

Disconnect from the ESPHome device and cleanup resources. This method should be called when you're done communicating with the device.

###### Returns

`void`

##### getAvailableEntityIds()

```ts
getAvailableEntityIds(): Record<string, string[]>;
```

Get all available entity IDs grouped by type. This provides a structured view of all discovered entities.

###### Returns

`Record`\<`string`, `string`[]\>

Object with entity types as keys and arrays of IDs as values.

##### getEntitiesWithIds()

```ts
getEntitiesWithIds(): Entity & {
  id: string;
}[];
```

Get all entities with their IDs. This returns the complete list of entities with their string IDs included.

###### Returns

`Entity` & \{
  `id`: `string`;
\}[]

Array of entities with their corresponding IDs.

##### getEntityById()

```ts
getEntityById(id): Nullable<Entity>;
```

Get entity information by ID. This retrieves full entity details given its string ID.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID to look up. |

###### Returns

[`Nullable`](types.md#nullable)\<`Entity`\>

The entity information or `null` if not found.

##### getEntityKey()

```ts
getEntityKey(id): Nullable<number>;
```

Get entity key by ID. This looks up the numeric key for an entity given its string ID.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID to look up. |

###### Returns

[`Nullable`](types.md#nullable)\<`number`\>

The entity key or `null` if not found.

##### hasEntity()

```ts
hasEntity(id): boolean;
```

Check if an entity ID exists. This is useful for validating entity IDs before sending commands.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID to check. |

###### Returns

`boolean`

`true` if the entity exists, `false` otherwise.

##### logAllEntityIds()

```ts
logAllEntityIds(): void;
```

Log all registered entity IDs for debugging. Logs entities grouped by type with their names and keys. This is primarily a debugging and development tool.

###### Returns

`void`

##### sendButtonCommand()

```ts
sendButtonCommand(id): void;
```

Sends a ButtonCommandRequest to press a button entity. Button entities trigger one-time actions when pressed.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "button-entityname"). |

###### Returns

`void`

##### sendCoverCommand()

```ts
sendCoverCommand(id, options): void;
```

Sends a CoverCommandRequest for the given entity ID. Cover entities represent things like garage doors, blinds, or shades.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "cover-entityname"). |
| `options` | \{ `command?`: `"stop"` \| `"open"` \| `"close"`; `position?`: `number`; `tilt?`: `number`; \} | Command options (at least one option must be provided). |
| `options.command?` | `"stop"` \| `"open"` \| `"close"` | The command: "open", "close", or "stop" (optional). |
| `options.position?` | `number` | Target position 0.0-1.0 where 0 is closed, 1 is open (optional). |
| `options.tilt?` | `number` | Target tilt 0.0-1.0 where 0 is closed, 1 is open (optional). |

###### Returns

`void`

###### Example

```typescript
// Send a simple command
await client.sendCoverCommand("cover-garagedoor", { command: "open" });

// Set to specific position
await client.sendCoverCommand("cover-garagedoor", { position: 0.5 }); // 50% open

// Set position and tilt for blinds
await client.sendCoverCommand("cover-blinds", { position: 1.0, tilt: 0.25 });
```

##### sendLightCommand()

```ts
sendLightCommand(id, options): void;
```

Sends a LightCommandRequest to turn on/off and optionally set brightness. Light entities represent controllable lights with optional dimming.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "light-entityname"). |
| `options` | \{ `brightness?`: `number`; `state?`: `boolean`; \} | Command options. |
| `options.brightness?` | `number` | Brightness level 0.0-1.0 (optional). |
| `options.state?` | `boolean` | `true` for on, `false` for off (optional). |

###### Returns

`void`

##### sendLockCommand()

```ts
sendLockCommand(
   id, 
   command, 
   code?): void;
```

Sends a LockCommandRequest to lock or unlock the given entity ID. Lock entities represent controllable locks with optional code support.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "lock-entityname"). |
| `command` | `"lock"` \| `"unlock"` | The command to send: "lock" or "unlock". |
| `code?` | `string` | Optional unlock code. |

###### Returns

`void`

##### sendPing()

```ts
sendPing(): void;
```

Send a ping request to the device to heartbeat the connection. This can be used to keep the connection alive and verify connectivity.

###### Returns

`void`

##### sendSwitchCommand()

```ts
sendSwitchCommand(id, state): void;
```

Sends a SwitchCommandRequest for the given entity ID and on/off state. This controls binary switch entities like garage door openers.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "switch-entityname"). |
| `state` | `boolean` | `true` for on, `false` for off. |

###### Returns

`void`

## Interfaces

### DeviceInfo

Device information to send when requested by the ESPHome device. This structure contains metadata about the connected ESPHome device.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="bluetoothproxyfeatureflags"></a> `bluetoothProxyFeatureFlags?` | `number` | Bluetooth proxy feature flags. |
| <a id="compilationtime"></a> `compilationTime?` | `string` | When the client was compiled/started. |
| <a id="esphomeversion"></a> `esphomeVersion?` | `string` | Version of ESPHome protocol being used. |
| <a id="hasdeepsleep"></a> `hasDeepSleep?` | `boolean` | Whether the client supports deep sleep. |
| <a id="legacybluetoothproxyversion"></a> `legacyBluetoothProxyVersion?` | `number` | Legacy Bluetooth proxy version. |
| <a id="macaddress"></a> `macAddress?` | `string` | MAC address of the client (format: "AA:BB:CC:DD:EE:FF"). |
| <a id="model"></a> `model?` | `string` | Model or type of the client. |
| <a id="name"></a> `name?` | `string` | Friendly name of the client. |
| <a id="projectname"></a> `projectName?` | `string` | Name of the project/plugin. |
| <a id="projectversion"></a> `projectVersion?` | `string` | Version of the project/plugin. |
| <a id="usespassword"></a> `usesPassword?` | `boolean` | Whether the client uses password authentication. |
| <a id="webserverport"></a> `webserverPort?` | `number` | Port number of any web server. |

***

### EspHomeClientOptions

Configuration options for creating an ESPHome client instance. These options control how the client connects to and communicates with ESPHome devices.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="clientid"></a> `clientId?` | [`Nullable`](types.md#nullable)\<`string`\> | Optional client identifier to announce when connecting (default: "esphome-client"). |
| <a id="host"></a> `host` | `string` | The hostname or IP address of the ESPHome device. |
| <a id="logger"></a> `logger?` | [`EspHomeLogging`](types.md#esphomelogging) | Optional logging interface for debug and error messages. |
| <a id="port"></a> `port?` | `number` | The port number for the ESPHome API (default: 6053). |
| <a id="psk"></a> `psk?` | [`Nullable`](types.md#nullable)\<`string`\> | Optional base64 encoded pre-shared key for Noise encryption. |
| <a id="servername"></a> `serverName?` | [`Nullable`](types.md#nullable)\<`string`\> | Optional expected server name for validation during encrypted connections. |
