<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![esphome-client: ESPHome Client API](https://raw.githubusercontent.com/hjdhjd/esphome-client/main/esphome-logo.svg)](https://github.com/hjdhjd/esphome-client)

# ESPHome Client API

[![Downloads](https://img.shields.io/npm/dt/esphome-client?color=%230559C9&logo=icloud&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)
[![Version](https://img.shields.io/npm/v/esphome-client?color=%230559C9&label=ESPHome%20Client%20API&logo=ubiquiti&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)

## A complete Node-native ESPHome API client implementation.
</DIV>
</SPAN>

`esphome-client` is a library that enables you to connect to and communicate with ESPHome devices using their native API protocol. [ESPHome](https://esphome.io) is an open-source system for controlling ESP8266/ESP32 microcontrollers using simple yet powerful configuration files and control them remotely through home automation systems.

## Why use this library for ESPHome support?
In short - because I use it every day to support a very popular [Homebridge](https://homebridge.io) plugin named [homebridge-ratgdo](https://www.npmjs.com/package/homebridge-ratgdo) that I maintain. This library has been extracted and refined from real-world usage to provide a robust foundation for ESPHome communication.

What makes this implementation unique is that it's **completely Node-native** - there are no external dependencies, no WebAssembly modules, and no native code compilation required. All encryption support is provided by Node.js's built-in crypto module, making installation and deployment straightforward and reliable across all platforms.

The library implements the complete Noise Protocol Framework (specifically Noise_NNpsk0_25519_ChaChaPoly_SHA256) for secure communication with ESPHome devices, with automatic fallback to plaintext connections when encryption is not required or available.

Finally - the most significant reason that you should use this library: it's well-tested in production, it is modern TypeScript, and most importantly, *it just works*. The library handles all the complexity of the ESPHome native API protocol, including automatic encryption negotiation, entity discovery, and real-time state updates.

### <A NAME="esphome-contribute"></A>How you can contribute and make this library even better
This implementation is feature-complete for the core functionality but doesn't yet support every ESPHome message type. The most commonly used entity types and commands are fully implemented and tested. I welcome contributions to add support for additional message types and entity types.

The ESPHome native API is a binary protocol based on Protocol Buffers, and implementing a library like this one is the result of careful protocol analysis and real-world testing.

### Features
- **Zero external dependencies** - Uses only Node.js built-in modules
- **Complete Noise Protocol implementation** - Secure encryption using Node's native crypto
- **Automatic encryption negotiation** - Seamlessly handles both encrypted and plaintext connections
- **Entity discovery** - Automatically discovers all entities exposed by the ESPHome device
- **Real-time updates** - Receive instant telemetry updates for all entity states
- **Type-safe API** - Full TypeScript support with comprehensive type definitions
- **Production tested** - Battle-tested in the popular homebridge-ratgdo plugin

## Supported Message Types

### ✅ Fully Implemented
The following message types are fully implemented and tested:

#### Core Protocol
- `HELLO_REQUEST` / `HELLO_RESPONSE` - Initial handshake
- `CONNECT_REQUEST` / `CONNECT_RESPONSE` - Connection establishment
- `DISCONNECT_REQUEST` / `DISCONNECT_RESPONSE` - Clean disconnection
- `PING_REQUEST` / `PING_RESPONSE` - Keep-alive and latency monitoring
- `DEVICE_INFO_REQUEST` / `DEVICE_INFO_RESPONSE` - Device metadata retrieval

#### Entity Discovery
- `LIST_ENTITIES_REQUEST` - Request entity enumeration
- `LIST_ENTITIES_BINARY_SENSOR_RESPONSE` - Binary sensor discovery
- `LIST_ENTITIES_COVER_RESPONSE` - Cover (garage door, blind, etc.) discovery
- `LIST_ENTITIES_LIGHT_RESPONSE` - Light discovery
- `LIST_ENTITIES_SENSOR_RESPONSE` - Sensor discovery
- `LIST_ENTITIES_SWITCH_RESPONSE` - Switch discovery
- `LIST_ENTITIES_TEXT_SENSOR_RESPONSE` - Text sensor discovery
- `LIST_ENTITIES_NUMBER_RESPONSE` - Number entity discovery
- `LIST_ENTITIES_LOCK_RESPONSE` - Lock discovery
- `LIST_ENTITIES_BUTTON_RESPONSE` - Button discovery
- `LIST_ENTITIES_SERVICES_RESPONSE` - Service discovery
- `LIST_ENTITIES_DONE_RESPONSE` - Entity enumeration complete

#### State Updates
- `SUBSCRIBE_STATES_REQUEST` - Subscribe to state changes
- `BINARY_SENSOR_STATE` - Binary sensor state updates
- `COVER_STATE` - Cover state updates (position, tilt, operation)
- `LIGHT_STATE` - Light state updates
- `SENSOR_STATE` - Sensor value updates
- `SWITCH_STATE` - Switch state updates
- `TEXT_SENSOR_STATE` - Text sensor updates
- `NUMBER_STATE` - Number value updates
- `LOCK_STATE` - Lock state updates

#### Commands
- `SWITCH_COMMAND_REQUEST` - Control switches
- `LIGHT_COMMAND_REQUEST` - Control lights (on/off, brightness)
- `COVER_COMMAND_REQUEST` - Control covers (open/close/stop, position, tilt)
- `LOCK_COMMAND_REQUEST` - Control locks (lock/unlock, optional code)
- `BUTTON_COMMAND_REQUEST` - Trigger button actions

#### Time Synchronization
- `GET_TIME_REQUEST` / `GET_TIME_RESPONSE` - Time sync with device

### 🚧 Not Yet Implemented
Contributions are welcome to add support for these message types:

- `FAN_COMMAND_REQUEST` - Fan control
- `CLIMATE_*` - Climate/HVAC entities and commands
- `MEDIA_PLAYER_*` - Media player entities and commands
- `CAMERA_*` - Camera image requests
- `ALARM_CONTROL_PANEL_*` - Alarm panel entities and commands
- `SELECT_*` - Select/dropdown entities
- `DATE_*`, `TIME_*`, `DATETIME_*` - Date/time entities
- `UPDATE_*` - Update entities for OTA updates
- `BLUETOOTH_*` - Bluetooth proxy functionality
- `VOICE_ASSISTANT_*` - Voice assistant support

## Installation
To use this library in Node, install it from the command line:

```sh
npm install esphome-client
```

## Quick Start

### Basic Connection (No Encryption)
```typescript
import { EspHomeClient } from 'esphome-client';

// Create a client without encryption
const client = new EspHomeClient({
  host: '192.168.1.100',
  port: 6053  // Default ESPHome API port
});

// Listen for connection events
client.on('connect', (usingEncryption) => {
  console.log(`Connected ${usingEncryption ? 'with' : 'without'} encryption`);
});

// Listen for discovered entities
client.on('entities', (entities) => {
  console.log('Discovered entities:', entities);

  // Log all entity IDs for reference
  client.logAllEntityIds();
});

// Listen for telemetry updates
client.on('telemetry', (data) => {
  console.log(`${data.entity}: ${data.value}`);
});

// Connect to the device
client.connect();
```

### Encrypted Connection
```typescript
import { EspHomeClient } from 'esphome-client';

// Create a client with encryption
const client = new EspHomeClient({
  host: '192.168.1.100',
  port: 6053,
  psk: 'your-base64-encoded-psk',  // From your ESPHome YAML api.encryption.key
  clientId: 'my-app-name'
});

client.connect();
```

### Controlling Entities
```typescript
// After entities are discovered...

// Control a switch
await client.sendSwitchCommand('switch-garage_door', true);

// Control a light with brightness
await client.sendLightCommand('light-ceiling', {
  state: true,
  brightness: 0.8  // 80% brightness
});

// Control a cover (garage door, blind, etc.)
await client.sendCoverCommand('cover-garage', { command: 'open' });
await client.sendCoverCommand('cover-blind', { position: 0.5 });  // 50% open

// Control a lock
await client.sendLockCommand('lock-front_door', 'lock');
await client.sendLockCommand('lock-front_door', 'unlock', '1234');  // With code

// Press a button
await client.sendButtonCommand('button-restart');
```

## Noise Protocol Encryption

This library includes a complete, Node-native implementation of the Noise Protocol Framework, specifically the `Noise_NNpsk0_25519_ChaChaPoly_SHA256` handshake pattern used by ESPHome. The implementation:

- Uses only Node.js built-in crypto functions
- Supports X25519 key exchange
- Implements ChaCha20-Poly1305 AEAD encryption
- Handles the complete handshake and transport encryption
- Automatically falls back to plaintext when encryption is not available

### Using the Noise Protocol Directly
```typescript
import { createESPHomeHandshake } from 'esphome-client';

// Create a handshake for ESPHome communication
const handshake = createESPHomeHandshake({
  role: 'initiator',  // Clients are always initiators
  psk: Buffer.from('your-32-byte-psk', 'base64')
});

// Perform the handshake...
const msg1 = handshake.writeMessage();
// Send msg1 to device, receive response...
handshake.readMessage(deviceResponse);

// After handshake completion, use cipher states for encryption
const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), plaintext);
const decrypted = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), encrypted);
```

## Documentation

Complete API documentation is available in the TypeDoc documentation. Key classes:

- `EspHomeClient` - Main client class for device communication
- `HandshakeState` - Noise protocol handshake implementation
- `createESPHomeHandshake` - Factory for ESPHome-specific Noise handshakes

For a real-world example of this library in action, check out [homebridge-ratgdo](https://github.com/hjdhjd/homebridge-ratgdo), which uses this library to provide HomeKit integration for ratgdo garage door controllers.

## Protocol Details

The ESPHome native API uses a binary protocol based on Protocol Buffers over TCP (default port 6053). Messages are framed with either:

- **Plaintext**: `[0x00][length_varint][type_varint][payload]`
- **Encrypted**: `[0x01][size_high][size_low][encrypted_payload]`

The library handles all protocol details automatically, including:
- Message framing and parsing
- Varint encoding/decoding
- Protocol buffer field encoding
- Automatic encryption negotiation
- Connection state management
- Entity discovery and caching

## Contributing

Contributions are welcome! Areas where help would be especially appreciated:

1. **Additional message types** - Implement support for climate, media player, and other entity types
2. **Testing** - Add unit tests and integration tests
3. **Documentation** - Improve examples and API documentation
4. **Bug fixes** - Report and fix any issues you encounter

Please ensure all code follows the existing style and includes appropriate TypeScript types.

## Library Development Dashboard
This is mostly of interest to the true developer nerds amongst us.

[![License](https://img.shields.io/npm/l/esphome-client?color=%230559C9&logo=open%20source%20initiative&logoColor=%2318BCF2&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/blob/main/LICENSE.md)
[![Build Status](https://img.shields.io/github/workflow/status/hjdhjd/esphome-client/Continuous%20Integration?color=%230559C9&logo=github-actions&logoColor=%2318BCF2&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/actions?query=workflow%3A%22Continuous+Integration%22)
[![Dependencies](https://img.shields.io/librariesio/release/npm/esphome-client?color=%230559C9&logo=dependabot&style=for-the-badge)](https://libraries.io/npm/esphome-client)
[![GitHub commits since latest release (by SemVer)](https://img.shields.io/github/commits-since/hjdhjd/esphome-client/latest?color=%230559C9&logo=github&sort=semver&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/commits/main)