<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![esphome-client: ESPHome Client API](https://raw.githubusercontent.com/hjdhjd/esphome-client/main/esphome-logo.svg)](https://github.com/hjdhjd/esphome-client)

# ESPHome Client API

[![Downloads](https://img.shields.io/npm/dt/esphome-client?color=%2318BCF2&logo=icloud&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)
[![Version](https://img.shields.io/npm/v/esphome-client?color=%2318BCF2&label=ESPHome%20Client%20API&logo=esphome&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)

## A complete Node-native ESPHome API client implementation with full protocol support.
</DIV>
</SPAN>

`esphome-client` is a comprehensive library that enables you to connect to and communicate with ESPHome devices using their native API protocol. [ESPHome](https://esphome.io) is an open-source system for controlling ESP8266/ESP32 microcontrollers using simple yet powerful configuration files and control them remotely through home automation systems.

## Why use this library for ESPHome support?
In short - because I use it every day to support a very popular [Homebridge](https://homebridge.io) plugin named [homebridge-ratgdo](https://www.npmjs.com/package/homebridge-ratgdo) that I maintain. This library has been extracted and refined from real-world usage to provide a robust foundation for ESPHome communication.

What makes this implementation unique is that it's **completely Node-native** - there are no external dependencies, no WebAssembly modules, and no native code compilation required. All encryption support is provided by Node.js's built-in crypto module, making installation and deployment straightforward and reliable across all platforms.

The library implements the complete Noise Protocol Framework (specifically Noise_NNpsk0_25519_ChaChaPoly_SHA256) for secure communication with ESPHome devices, with automatic fallback to plaintext connections when encryption is not required or available.

Finally - the most significant reason that you should use this library: it's well-tested in production, it is modern TypeScript, and most importantly, *it just works*. The library handles all the complexity of the ESPHome native API protocol, including automatic encryption negotiation, entity discovery, and real-time state updates.

### Features
- **Zero external dependencies** - Uses only Node.js built-in modules
- **Complete protocol implementation** - Full support for all ESPHome entity types and message types
- **Secure encryption** - Complete Noise Protocol implementation using Node's native crypto
- **Automatic encryption negotiation** - Seamlessly handles both encrypted and plaintext connections
- **Entity discovery** - Automatically discovers all entities exposed by the ESPHome device
- **Real-time updates** - Receive instant telemetry updates for all entity states
- **Voice assistant support** - Full implementation of ESPHome's voice assistant features
- **Type-safe API** - Full TypeScript support with comprehensive type definitions
- **Production tested** - Battle-tested in the popular homebridge-ratgdo plugin
- **Protocol-compliant** - Carefully verified against the official ESPHome protocol specification

## Supported Message Types

### ✅ Fully Implemented
This library provides complete support for the ESPHome native API protocol:

#### Core Protocol
- `HELLO_REQUEST` / `HELLO_RESPONSE` - Initial handshake with protocol version verification
- `CONNECT_REQUEST` / `CONNECT_RESPONSE` - Connection establishment
- `DISCONNECT_REQUEST` / `DISCONNECT_RESPONSE` - Clean disconnection
- `PING_REQUEST` / `PING_RESPONSE` - Keep-alive and latency monitoring
- `DEVICE_INFO_REQUEST` / `DEVICE_INFO_RESPONSE` - Complete device metadata retrieval

#### Entity Discovery (All Types Supported)
- `LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE` - Alarm panel discovery
- `LIST_ENTITIES_BINARY_SENSOR_RESPONSE` - Binary sensor discovery
- `LIST_ENTITIES_BUTTON_RESPONSE` - Button discovery
- `LIST_ENTITIES_CAMERA_RESPONSE` - Camera discovery
- `LIST_ENTITIES_CLIMATE_RESPONSE` - Climate/HVAC discovery
- `LIST_ENTITIES_COVER_RESPONSE` - Cover (garage door, blind, etc.) discovery
- `LIST_ENTITIES_DATE_RESPONSE` - Date entity discovery
- `LIST_ENTITIES_DATETIME_RESPONSE` - DateTime entity discovery
- `LIST_ENTITIES_EVENT_RESPONSE` - Event entity discovery
- `LIST_ENTITIES_FAN_RESPONSE` - Fan discovery with speed and oscillation
- `LIST_ENTITIES_LIGHT_RESPONSE` - Light discovery with effects and color modes
- `LIST_ENTITIES_LOCK_RESPONSE` - Lock discovery
- `LIST_ENTITIES_MEDIA_PLAYER_RESPONSE` - Media player discovery
- `LIST_ENTITIES_NUMBER_RESPONSE` - Number entity discovery
- `LIST_ENTITIES_REQUEST` / `LIST_ENTITIES_DONE_RESPONSE` - Entity enumeration
- `LIST_ENTITIES_SELECT_RESPONSE` - Select/dropdown discovery
- `LIST_ENTITIES_SENSOR_RESPONSE` - Sensor discovery
- `LIST_ENTITIES_SERVICES_RESPONSE` - User-defined service discovery
- `LIST_ENTITIES_SWITCH_RESPONSE` - Switch discovery
- `LIST_ENTITIES_TEXT_RESPONSE` - Text input discovery
- `LIST_ENTITIES_TEXT_SENSOR_RESPONSE` - Text sensor discovery
- `LIST_ENTITIES_TIME_RESPONSE` - Time entity discovery
- `LIST_ENTITIES_UPDATE_RESPONSE` - Update entity discovery
- `LIST_ENTITIES_VALVE_RESPONSE` - Valve discovery

#### State Updates (All Types Supported)
- `ALARM_CONTROL_PANEL_STATE_RESPONSE` - Alarm panel state
- `BINARY_SENSOR_STATE_RESPONSE` - Binary sensor state updates
- `BUTTON_STATE_RESPONSE` - Button state (not typically used)
- `CLIMATE_STATE_RESPONSE` - Climate state with modes and temperatures
- `COVER_STATE_RESPONSE` - Cover state with position and tilt
- `DATE_STATE_RESPONSE` - Date value updates
- `DATETIME_STATE_RESPONSE` - DateTime value updates
- `EVENT_RESPONSE` - Event triggers
- `FAN_STATE_RESPONSE` - Fan state with speed and oscillation
- `LIGHT_STATE_RESPONSE` - Light state with color and effects
- `LOCK_STATE_RESPONSE` - Lock state updates
- `MEDIA_PLAYER_STATE_RESPONSE` - Media player state
- `NUMBER_STATE_RESPONSE` - Number value updates
- `SELECT_STATE_RESPONSE` - Select option updates
- `SENSOR_STATE_RESPONSE` - Sensor value updates
- `SUBSCRIBE_STATES_REQUEST` - Subscribe to state changes
- `SWITCH_STATE_RESPONSE` - Switch state updates
- `TEXT_SENSOR_STATE_RESPONSE` - Text sensor updates
- `TEXT_STATE_RESPONSE` - Text value updates
- `TIME_STATE_RESPONSE` - Time value updates
- `UPDATE_STATE_RESPONSE` - Update availability
- `VALVE_STATE_RESPONSE` - Valve state with position

#### Commands (All Types Supported)
- `ALARM_CONTROL_PANEL_COMMAND_REQUEST` - Alarm control with codes
- `BUTTON_COMMAND_REQUEST` - Trigger button actions
- `CLIMATE_COMMAND_REQUEST` - Climate control (mode, temperature, fan, swing)
- `COVER_COMMAND_REQUEST` - Cover control (open/close/stop, position, tilt)
- `DATE_COMMAND_REQUEST` - Set date values
- `DATETIME_COMMAND_REQUEST` - Set datetime values
- `FAN_COMMAND_REQUEST` - Fan control (speed, oscillation, direction)
- `LIGHT_COMMAND_REQUEST` - Full light control (on/off, brightness, color, effects)
- `LOCK_COMMAND_REQUEST` - Lock control (lock/unlock with optional code)
- `MEDIA_PLAYER_COMMAND_REQUEST` - Media player control
- `NUMBER_COMMAND_REQUEST` - Set number values
- `SELECT_COMMAND_REQUEST` - Select options
- `SWITCH_COMMAND_REQUEST` - Control switches
- `TEXT_COMMAND_REQUEST` - Set text values
- `TIME_COMMAND_REQUEST` - Set time values
- `UPDATE_COMMAND_REQUEST` - Trigger updates
- `VALVE_COMMAND_REQUEST` - Valve control (open/close, position)

#### Advanced Features
- `CAMERA_IMAGE_REQUEST` / `CAMERA_IMAGE_RESPONSE` - Camera image capture
- `EXECUTE_SERVICE_REQUEST` - Execute user-defined services
- `GET_TIME_REQUEST` / `GET_TIME_RESPONSE` - Time synchronization
- `SUBSCRIBE_LOGS_REQUEST` / `SUBSCRIBE_LOGS_RESPONSE` - Device log streaming

#### Voice Assistant Support
- `SUBSCRIBE_VOICE_ASSISTANT_REQUEST` - Voice assistant subscription
- `VOICE_ASSISTANT_ANNOUNCE_REQUEST` / `VOICE_ASSISTANT_ANNOUNCE_FINISHED` - Announcements
- `VOICE_ASSISTANT_AUDIO` - Bidirectional audio streaming
- `VOICE_ASSISTANT_CONFIGURATION_REQUEST` / `VOICE_ASSISTANT_CONFIGURATION_RESPONSE` - Configuration
- `VOICE_ASSISTANT_EVENT_RESPONSE` - Voice assistant events
- `VOICE_ASSISTANT_REQUEST` - Voice requests from device
- `VOICE_ASSISTANT_RESPONSE` - Voice responses to device
- `VOICE_ASSISTANT_SET_CONFIGURATION` - Wake word configuration
- `VOICE_ASSISTANT_TIMER_EVENT_RESPONSE` - Timer events

#### Security Features
- `NOISE_ENCRYPTION_SET_KEY_REQUEST` / `NOISE_ENCRYPTION_SET_KEY_RESPONSE` - Dynamic key updates

### Protocol Compliance
This implementation has been carefully verified against the official ESPHome protocol specification (`api.proto`). All field numbers, data types, and message structures exactly match the protocol definition as of v1.12 of the native ESPHome protocol. The library correctly:

- Handles all required and optional fields
- Properly encodes/decodes varint, fixed32, and length-delimited fields
- Avoids all deprecated functionality (e.g., legacy cover commands, deprecated fan speed)
- Correctly implements device_id fields for multi-device support
- Properly handles missing state indicators for sensors

## Installation
To use this library in Node, install it from the command line:

```sh
npm install esphome-client
```

### Command Line Tool
The package includes `espc`, a CLI utility for interacting with ESPHome devices:

```sh
# Display device information
espc --host 192.168.1.100 info

# List all entities
espc --host esp-device.local --psk MySecret123 list

# Control entities (auto-detects type)
espc --host 192.168.1.100 control bedroom_light on
espc --host 192.168.1.100 control garage_door open

# Monitor real-time telemetry
espc --host 192.168.1.100 monitor --duration 60

# Interactive mode for exploration
espc --host 192.168.1.100 -i
```

The CLI supports all ESPHome entity types including switches, lights, covers, fans, locks, climate controls, and more. Use `espc --help` for full documentation.

## Quick Start

### Basic Connection
```typescript
import { EspHomeClient, LogLevel } from 'esphome-client';

// Create a client with automatic reconnection
const client = new EspHomeClient({
  host: '192.168.1.100',
  port: 6053,  // Default ESPHome API port
  reconnect: true,
  reconnectInterval: 15000,
  connectionTimeout: 30000,
  clientId: 'my-app',
  logger: console  // Or your custom logger
});

// Listen for connection events
client.on('connect', ({ encrypted }) => {
  console.log(`Connected to ESPHome device (encrypted: ${encrypted})`);

  // Subscribe to device logs
  client.subscribeToLogs(LogLevel.INFO);

  // Log all discovered entities
  client.logAllEntityIds();
});

// Listen for discovered entities
client.on('entities', (entities) => {
  console.log('Discovered entities:', entities);
});

// Listen for device information
client.on('deviceInfo', (info) => {
  console.log(`Device: ${info.name} v${info.esphomeVersion}`);
  console.log(`Model: ${info.model}, MAC: ${info.macAddress}`);
});

// Connect to the device
await client.connect();
```

### Encrypted Connection
```typescript
// Create a client with encryption
const client = new EspHomeClient({
  host: '192.168.1.100',
  port: 6053,
  encryptionKey: 'your-base64-encoded-32-byte-key',  // From your ESPHome YAML api.encryption.key
  clientId: 'my-secure-app'
});

// The client will automatically use encryption if the key is provided
// and fall back to plaintext if the device doesn't support it
await client.connect();
```

### Controlling Entities
```typescript
// After entities are discovered...

// Control switches
await client.sendSwitchCommand('switch-garage_door', true);

// Control lights with full features
await client.sendLightCommand('light-living_room', {
  state: true,
  brightness: 0.8,  // 80% brightness
  rgb: { r: 255, g: 0, b: 128 },  // Pink color
  colorTemperature: 3500,  // Warm white
  effect: 'rainbow',  // Start effect
  transition: 2.0  // 2 second transition
});

// Control covers (garage doors, blinds, etc.)
await client.sendCoverCommand('cover-garage', { command: 'open' });
await client.sendCoverCommand('cover-blind', { position: 0.5, tilt: 0.25 });

// Control climate/HVAC
await client.sendClimateCommand('climate-thermostat', {
  mode: ClimateMode.HEAT_COOL,
  targetTemperature: 22,
  targetTemperatureLow: 20,
  targetTemperatureHigh: 24,
  fanMode: ClimateFanMode.AUTO
});

// Control fans
await client.sendFanCommand('fan-bedroom', {
  state: true,
  speedLevel: 75,  // 75% speed
  oscillating: true,
  direction: 'forward'
});

// Control locks
await client.sendLockCommand('lock-front_door', LockCommand.LOCK);
await client.sendLockCommand('lock-front_door', LockCommand.UNLOCK, '1234');

// Control media players
await client.sendMediaPlayerCommand('media_player-living_room', {
  command: MediaPlayerCommand.PLAY,
  volume: 0.5,
  mediaUrl: 'http://example.com/song.mp3'
});

// Execute user-defined services
await client.executeServiceByName('play_rtttl', [
  { stringValue: 'mario:d=4,o=5,b=100:16e6,16e6,32p,8e6' }
]);
```

### Real-time State Monitoring
```typescript
// Listen to specific entity types
client.on('sensor', (data) => {
  if (!data.missingState) {
    console.log(`${data.entity}: ${data.state} ${data.unitOfMeasurement || ''}`);
  }
});

client.on('binary_sensor', (data) => {
  console.log(`${data.entity}: ${data.state ? 'ON' : 'OFF'}`);
});

client.on('climate', (data) => {
  console.log(`HVAC: ${ClimateMode[data.mode]}, Current: ${data.currentTemperature}°C, Target: ${data.targetTemperature}°C`);
});

// Listen to all telemetry updates
client.on('telemetry', (data) => {
  console.log(`Update from ${data.entity}:`, data);
});

// Monitor device logs
client.on('log', (data) => {
  console.log(`[${LogLevel[data.level]}] ${data.message}`);
});
```

### Voice Assistant Integration
```typescript
// Subscribe to voice assistant
client.subscribeVoiceAssistant(VoiceAssistantSubscribeFlag.API_AUDIO);

// Handle voice assistant requests
client.on('voiceAssistantRequest', (data) => {
  if (data.start) {
    console.log(`Voice session started: ${data.conversationId}`);
    // Start audio streaming
    const audioPort = 12345;
    client.sendVoiceAssistantResponse(audioPort, false);
  }
});

// Send voice assistant events
client.sendVoiceAssistantEvent(VoiceAssistantEvent.WAKE_WORD_START);
client.sendVoiceAssistantEvent(VoiceAssistantEvent.STT_END, [
  { name: 'text', value: 'Turn on the lights' }
]);

// Configure wake words
client.requestVoiceAssistantConfiguration();
client.on('voiceAssistantConfiguration', (config) => {
  console.log('Available wake words:', config.availableWakeWords);
  client.setVoiceAssistantConfiguration(['alexa', 'hey_google']);
});
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
  psk: Buffer.from('your-32-byte-psk', 'base64'),
  logger: console
});

// Perform the handshake...
const msg1 = handshake.writeMessage();
// Send msg1 to device, receive response...
handshake.readMessage(deviceResponse);

// After handshake completion, use cipher states for encryption
const encrypted = handshake.sendCipher.EncryptWithAd(Buffer.alloc(0), plaintext);
const decrypted = handshake.receiveCipher.DecryptWithAd(Buffer.alloc(0), encrypted);
```

## API Documentation

Complete API documentation is available through TypeDoc. The library provides comprehensive TypeScript definitions for all message types, entity types, and protocol structures.

### Key Classes and Interfaces

- `EspHomeClient` - Main client class for device communication
  - Event-driven architecture with TypeScript-typed events
  - Automatic reconnection and error recovery
  - Complete entity discovery and caching
  - Type-safe command methods for all entity types

- `HandshakeState` - Noise protocol handshake implementation
  - Complete Noise_NNpsk0_25519_ChaChaPoly_SHA256 implementation
  - Cipher state management for encrypted communication
  - Automatic key derivation and rekeying support

- `createESPHomeHandshake` - Factory for ESPHome-specific Noise handshakes
  - Configures correct prologue for ESPHome compatibility
  - Simplified API for common use cases

### Event Types

All events are fully typed with TypeScript definitions:

- Connection events: `connect`, `disconnect`, `error`
- Discovery events: `entities`, `services`, `deviceInfo`
- State events: One for each entity type (e.g., `switch`, `sensor`, `light`)
- System events: `log`, `heartbeat`, `timeSync`
- Voice events: `voiceAssistantRequest`, `voiceAssistantConfiguration`

For a real-world example of this library in action, check out [homebridge-ratgdo](https://github.com/hjdhjd/homebridge-ratgdo), which uses this library to provide HomeKit integration for ratgdo garage door controllers.

## Protocol Details

The ESPHome native API uses a binary protocol based on Protocol Buffers over TCP (default port 6053). Messages are framed with either:

- **Plaintext**: `[0x00][length_varint][type_varint][payload]`
- **Encrypted**: `[0x01][size_high][size_low][encrypted_payload]`

The library handles all protocol details automatically, including:

- Message framing and parsing
- Varint encoding/decoding
- Protocol buffer field encoding (without requiring protobuf libraries)
- Automatic encryption negotiation
- Connection state management
- Entity discovery and caching
- Proper handling of all field types (varint, fixed32, fixed64, length-delimited)

## Contributing

Contributions are welcome! The library has complete protocol support, but there are always opportunities for improvement:

1. **Testing** - Add unit tests and integration tests
2. **Documentation** - Improve examples and API documentation
4. **Bug fixes** - Report and fix any issues you encounter

Please ensure all code follows the existing style and includes appropriate TypeScript types.

## Library Development Dashboard
This is mostly of interest to the true developer nerds amongst us.

[![License](https://img.shields.io/npm/l/esphome-client?color=%2318BCF2&logo=open%20source%20initiative&logoColor=%2318BCF2&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/blob/main/LICENSE.md)
[![Build Status](https://img.shields.io/github/actions/workflow/status/hjdhjd/esphome-client/ci.yml?branch=main&color=%2318BCF2&logo=github-actions&logoColor=%2318BCF2&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/actions?query=workflow%3A%22Continuous+Integration%22)
[![Dependencies](https://img.shields.io/librariesio/release/npm/esphome-client?color=%2318BCF2&logo=dependabot&style=for-the-badge)](https://libraries.io/npm/esphome-client)
[![GitHub commits since latest release (by SemVer)](https://img.shields.io/github/commits-since/hjdhjd/esphome-client/latest?color=%2318BCF2&logo=github&sort=semver&style=for-the-badge)](https://github.com/hjdhjd/esphome-client/commits/main)