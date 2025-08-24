[**esphome-client**](README.md)

***

[Home](README.md) / esphome-client

# esphome-client

ESPHome native API client with complete protocol and encryption support.

## Examples

```typescript
import { EspHomeClient } from "./esphome-client";

// Create a client instance with optional encryption key.
const client = new EspHomeClient({
  host: "192.168.1.100",
  port: 6053,
  encryptionKey: "your-base64-encoded-32-byte-key", // From your ESPHome YAML configuration
  clientId: "my-home-automation",
  reconnect: true,
  reconnectInterval: 15000
});

// Listen for connection events.
client.on("connect", (data) => {
  console.log(`Connected to ESPHome device (encrypted: ${data.encrypted})`);
});

// Discover all entities on the device.
client.on("entities", (entities) => {
  console.log("Discovered entities:", entities);

  // Control a switch entity once discovered.
  client.sendSwitchCommand("switch-living_room", true);
});

// Subscribe to real-time state updates.
client.on("switch", (data) => {
  console.log(`Switch ${data.entity} is now ${data.state ? "ON" : "OFF"}`);
});

// Connect to the device.
await client.connect();
```

```typescript
// Monitor temperature and humidity sensors with debug logging.
const client = new EspHomeClient({
  host: "weather-station.local",
  subscribeLogsLevel: LogLevel.DEBUG
});

// Track sensor readings.
const readings = new Map();

client.on("sensor", (data) => {
  readings.set(data.entity, data.state);

  if (data.entity === "sensor-temperature") {
    console.log(`Temperature: ${data.state}°C`);

    // Trigger actions based on temperature.
    if (data.state > 25) {
      client.sendFanCommand("fan-cooling", { state: true, speedLevel: 75 });
    }
  }
});

// Monitor device logs for debugging.
client.on("log", (data) => {
  console.log(`[${LogLevel[data.level]}] ${data.message}`);
});
```

```typescript
// Sophisticated climate control with scheduling.
const client = new EspHomeClient({ host: "thermostat.local" });

client.on("climate", (data) => {
  console.log(`HVAC Mode: ${ClimateMode[data.mode]}`);
  console.log(`Current: ${data.currentTemperature}°C, Target: ${data.targetTemperature}°C`);
});

// Set up a daily schedule.
function applySchedule(hour: number): void {
  if ((hour >= 6) && (hour < 9)) {
    // Morning warm-up.
    client.sendClimateCommand("climate-thermostat", {
      mode: ClimateMode.HEAT,
      targetTemperature: 22
    });
  } else if ((hour >= 22) || (hour < 6)) {
    // Night setback.
    client.sendClimateCommand("climate-thermostat", {
      mode: ClimateMode.HEAT,
      targetTemperature: 18
    });
  }
}
```

```typescript
// Set up voice assistant with wake word detection.
const client = new EspHomeClient({ host: "voice-assistant.local" });

// Subscribe to voice assistant events.
client.subscribeVoiceAssistant(VoiceAssistantSubscribeFlag.API_AUDIO);

client.on("voiceAssistantRequest", (data) => {
  console.log(`Voice request started: ${data.conversationId}`);

  if (data.start) {
    // Start audio streaming on port 12345.
    client.sendVoiceAssistantResponse(12345, false);
    startAudioStreaming(12345);
  }
});

// Handle voice assistant events.
client.on("voiceAssistantEvent", (event) => {
  switch (event.eventType) {
    case VoiceAssistantEvent.WAKE_WORD_START:
      console.log("Wake word detected!");
      break;
    case VoiceAssistantEvent.STT_END:
      console.log(`Recognized: ${event.data?.find(d => d.name === "text")?.value}`);
      break;
  }
});
```

## Enumerations

### AlarmControlPanelCommand

Alarm control panel state commands for controlling the alarm system.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="arm_away"></a> `ARM_AWAY` | `1` |
| <a id="arm_custom_bypass"></a> `ARM_CUSTOM_BYPASS` | `5` |
| <a id="arm_home"></a> `ARM_HOME` | `2` |
| <a id="arm_night"></a> `ARM_NIGHT` | `3` |
| <a id="arm_vacation"></a> `ARM_VACATION` | `4` |
| <a id="disarm"></a> `DISARM` | `0` |
| <a id="trigger"></a> `TRIGGER` | `6` |

***

### ClimateAction

Climate actions that indicate the current activity of the HVAC system. These represent what the climate device is actively doing.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="cooling"></a> `COOLING` | `2` |
| <a id="drying"></a> `DRYING` | `5` |
| <a id="fan"></a> `FAN` | `6` |
| <a id="heating"></a> `HEATING` | `3` |
| <a id="idle"></a> `IDLE` | `4` |
| <a id="off"></a> `OFF` | `0` |

***

### ClimateFanMode

Climate fan modes supported by ESPHome climate entities. These control how the fan operates within the HVAC system.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="auto"></a> `AUTO` | `2` |
| <a id="diffuse"></a> `DIFFUSE` | `8` |
| <a id="focus"></a> `FOCUS` | `7` |
| <a id="high"></a> `HIGH` | `5` |
| <a id="low"></a> `LOW` | `3` |
| <a id="medium"></a> `MEDIUM` | `4` |
| <a id="middle"></a> `MIDDLE` | `6` |
| <a id="off-1"></a> `OFF` | `1` |
| <a id="on"></a> `ON` | `0` |
| <a id="quiet"></a> `QUIET` | `9` |

***

### ClimateMode

Climate modes supported by ESPHome climate entities. These define the primary operating state of HVAC systems.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="auto-1"></a> `AUTO` | `6` |
| <a id="cool"></a> `COOL` | `2` |
| <a id="dry"></a> `DRY` | `5` |
| <a id="fan_only"></a> `FAN_ONLY` | `4` |
| <a id="heat"></a> `HEAT` | `3` |
| <a id="heat_cool"></a> `HEAT_COOL` | `1` |
| <a id="off-2"></a> `OFF` | `0` |

***

### ClimatePreset

Climate presets supported by ESPHome climate entities. These are predefined configurations for common scenarios.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="activity"></a> `ACTIVITY` | `7` |
| <a id="away"></a> `AWAY` | `2` |
| <a id="boost"></a> `BOOST` | `3` |
| <a id="comfort"></a> `COMFORT` | `4` |
| <a id="eco"></a> `ECO` | `5` |
| <a id="home"></a> `HOME` | `1` |
| <a id="none"></a> `NONE` | `0` |
| <a id="sleep"></a> `SLEEP` | `6` |

***

### ClimateSwingMode

Climate swing modes supported by ESPHome climate entities. These control the direction of airflow from the HVAC system.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="both"></a> `BOTH` | `1` |
| <a id="horizontal"></a> `HORIZONTAL` | `3` |
| <a id="off-3"></a> `OFF` | `0` |
| <a id="vertical"></a> `VERTICAL` | `2` |

***

### ColorMode

Color modes supported by ESPHome light entities. These define the color control capabilities of lights.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="brightness"></a> `BRIGHTNESS` | `3` |
| <a id="cold_warm_white"></a> `COLD_WARM_WHITE` | `19` |
| <a id="color_temperature"></a> `COLOR_TEMPERATURE` | `11` |
| <a id="on_off"></a> `ON_OFF` | `1` |
| <a id="rgb"></a> `RGB` | `35` |
| <a id="rgb_cold_warm_white"></a> `RGB_COLD_WARM_WHITE` | `51` |
| <a id="rgb_color_temperature"></a> `RGB_COLOR_TEMPERATURE` | `47` |
| <a id="rgb_white"></a> `RGB_WHITE` | `39` |
| <a id="unknown"></a> `UNKNOWN` | `0` |
| <a id="white"></a> `WHITE` | `7` |

***

### CoverOperation

Cover operation states indicating what a cover is currently doing.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="idle-1"></a> `IDLE` | `0` |
| <a id="is_closing"></a> `IS_CLOSING` | `2` |
| <a id="is_opening"></a> `IS_OPENING` | `1` |

***

### LockCommand

Lock commands supported by ESPHome lock entities.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="lock"></a> `LOCK` | `1` |
| <a id="open"></a> `OPEN` | `2` |
| <a id="unlock"></a> `UNLOCK` | `0` |

***

### LogLevel

Log levels supported by ESPHome for log subscriptions. These control the verbosity of log messages received from the device.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="debug"></a> `DEBUG` | `4` |
| <a id="error"></a> `ERROR` | `1` |
| <a id="info"></a> `INFO` | `3` |
| <a id="none-1"></a> `NONE` | `0` |
| <a id="verbose"></a> `VERBOSE` | `5` |
| <a id="very_verbose"></a> `VERY_VERBOSE` | `6` |
| <a id="warn"></a> `WARN` | `2` |

***

### MediaPlayerCommand

Media player commands supported by ESPHome media player entities.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="clear_playlist"></a> `CLEAR_PLAYLIST` | `11` |
| <a id="enqueue"></a> `ENQUEUE` | `8` |
| <a id="mute"></a> `MUTE` | `3` |
| <a id="pause"></a> `PAUSE` | `1` |
| <a id="play"></a> `PLAY` | `0` |
| <a id="repeat_off"></a> `REPEAT_OFF` | `10` |
| <a id="repeat_one"></a> `REPEAT_ONE` | `9` |
| <a id="stop"></a> `STOP` | `2` |
| <a id="toggle"></a> `TOGGLE` | `5` |
| <a id="turn_off"></a> `TURN_OFF` | `13` |
| <a id="turn_on"></a> `TURN_ON` | `12` |
| <a id="unmute"></a> `UNMUTE` | `4` |
| <a id="volume_down"></a> `VOLUME_DOWN` | `7` |
| <a id="volume_up"></a> `VOLUME_UP` | `6` |

***

### ServiceArgType

Service argument types supported by ESPHome user-defined services.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="bool"></a> `BOOL` | `0` |
| <a id="bool_array"></a> `BOOL_ARRAY` | `4` |
| <a id="float"></a> `FLOAT` | `2` |
| <a id="float_array"></a> `FLOAT_ARRAY` | `6` |
| <a id="int"></a> `INT` | `1` |
| <a id="int_array"></a> `INT_ARRAY` | `5` |
| <a id="string"></a> `STRING` | `3` |
| <a id="string_array"></a> `STRING_ARRAY` | `7` |

***

### ValveOperation

Valve operation states that indicate the current activity of a valve. These represent what the valve is actively doing.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="idle-2"></a> `IDLE` | `0` |
| <a id="is_closing-1"></a> `IS_CLOSING` | `2` |
| <a id="is_opening-1"></a> `IS_OPENING` | `1` |

***

### VoiceAssistantEvent

Voice assistant events that indicate the state of voice processing.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="error-1"></a> `ERROR` | `0` |
| <a id="intent_end"></a> `INTENT_END` | `6` |
| <a id="intent_progress"></a> `INTENT_PROGRESS` | `100` |
| <a id="intent_start"></a> `INTENT_START` | `5` |
| <a id="run_end"></a> `RUN_END` | `2` |
| <a id="run_start"></a> `RUN_START` | `1` |
| <a id="stt_end"></a> `STT_END` | `4` |
| <a id="stt_start"></a> `STT_START` | `3` |
| <a id="stt_vad_end"></a> `STT_VAD_END` | `12` |
| <a id="stt_vad_start"></a> `STT_VAD_START` | `11` |
| <a id="tts_end"></a> `TTS_END` | `8` |
| <a id="tts_start"></a> `TTS_START` | `7` |
| <a id="tts_stream_end"></a> `TTS_STREAM_END` | `99` |
| <a id="tts_stream_start"></a> `TTS_STREAM_START` | `98` |
| <a id="wake_word_end"></a> `WAKE_WORD_END` | `10` |
| <a id="wake_word_start"></a> `WAKE_WORD_START` | `9` |

***

### VoiceAssistantRequestFlag

Voice assistant request flags that control how the assistant operates.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="none-2"></a> `NONE` | `0` |
| <a id="use_vad"></a> `USE_VAD` | `1` |
| <a id="use_wake_word"></a> `USE_WAKE_WORD` | `2` |

***

### VoiceAssistantSubscribeFlag

Voice assistant subscription flags that control what data is received.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="api_audio"></a> `API_AUDIO` | `1` |
| <a id="none-3"></a> `NONE` | `0` |

***

### VoiceAssistantTimerEvent

Voice assistant timer events that indicate timer state changes.

#### Enumeration Members

| Enumeration Member | Value |
| ------ | ------ |
| <a id="cancelled"></a> `CANCELLED` | `2` |
| <a id="finished"></a> `FINISHED` | `3` |
| <a id="started"></a> `STARTED` | `0` |
| <a id="updated"></a> `UPDATED` | `1` |

## Interfaces

### AlarmControlPanelEvent

These multi-field families are represented with a compact shape at this layer. We can extend them as needed while preserving the discriminant. When the protocol
provides supplemental flags or modes, we carry them through verbatim.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="state"></a> `state?` | `number` | - | - |
| <a id="type"></a> `type` | `"alarm_control_panel"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### BinarySensorEvent

These simple value-like families provide a single primary state. We expose an optional `missingState` flag when the protocol indicates the state is absent, so
consumers can distinguish between "present but falsy" and "not present".

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-1"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-1"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-1"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate"></a> `missingState?` | `boolean` | - | - |
| <a id="state-1"></a> `state?` | `boolean` | - | - |
| <a id="type-1"></a> `type` | `"binary_sensor"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### ButtonEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-2"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-2"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-2"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="pressed"></a> `pressed?` | `boolean` | - | - |
| <a id="type-2"></a> `type` | `"button"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### CameraEventData

Camera image event emitted when camera images are received from the ESPHome device. These contain the actual image data and name.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="image"></a> `image` | `Buffer` | The raw image data as a Buffer. |
| <a id="name"></a> `name` | `string` | The entity name of the camera. |

***

### ClientEventsMap

This interface defines the complete set of events that this client emits. Each key is an event name and each value is the payload type that will be provided to
listeners for that event. This map serves as the single source of truth for typed subscriptions and enables strongly typed `.on()` and `.once()` overloads without
resorting to `any`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="alarm_control_panel"></a> `alarm_control_panel` | [`AlarmControlPanelEvent`](#alarmcontrolpanelevent) | - |
| <a id="binary_sensor"></a> `binary_sensor` | [`BinarySensorEvent`](#binarysensorevent) | - |
| <a id="button"></a> `button` | [`ButtonEvent`](#buttonevent) | - |
| <a id="camera"></a> `camera` | \{ `buffer`: `Buffer`; `entity`: `string`; `key`: `number`; \} | - |
| `camera.buffer` | `Buffer` | - |
| `camera.entity` | `string` | - |
| `camera.key` | `number` | - |
| <a id="climate"></a> `climate` | [`ClimateEvent`](#climateevent) | - |
| <a id="connect-2"></a> `connect` | \{ `encrypted`: `boolean`; \} | - |
| `connect.encrypted` | `boolean` | - |
| <a id="cover"></a> `cover` | [`CoverEvent`](#coverevent) | - |
| <a id="date"></a> `date` | [`DateEvent`](#dateevent) | - |
| <a id="datetime"></a> `datetime` | [`DateTimeEvent`](#datetimeevent) | - |
| <a id="deviceinfo-2"></a> `deviceInfo` | [`DeviceInfo`](#deviceinfo-3) | - |
| <a id="disconnect-2"></a> `disconnect` | `undefined` \| `string` | - |
| <a id="entities"></a> `entities` | `Record`\<`string`, `unknown`\> | - |
| <a id="event"></a> `event` | [`EventEntityEvent`](#evententityevent) | - |
| <a id="fan-1"></a> `fan` | [`FanEvent`](#fanevent) | - |
| <a id="heartbeat"></a> `heartbeat` | \{ `uptime?`: `number`; \} | - |
| `heartbeat.uptime?` | `number` | - |
| <a id="light"></a> `light` | [`LightEvent`](#lightevent) | - |
| <a id="lock-1"></a> `lock` | [`LockEvent`](#lockevent) | - |
| <a id="log"></a> `log` | \{ `level`: `number`; `message`: `string`; \} | - |
| `log.level` | `number` | - |
| `log.message` | `string` | - |
| <a id="media_player"></a> `media_player` | [`MediaPlayerEvent`](#mediaplayerevent) | - |
| <a id="message"></a> `message` | [`MessageEventData`](#messageeventdata) | - |
| <a id="noisekeyset"></a> `noiseKeySet` | `boolean` | - |
| <a id="number"></a> `number` | [`NumberEvent`](#numberevent) | - |
| <a id="select"></a> `select` | [`SelectEvent`](#selectevent) | - |
| <a id="sensor"></a> `sensor` | [`SensorEvent`](#sensorevent) | - |
| <a id="servicediscovered"></a> `serviceDiscovered` | `Record`\<`string`, `unknown`\> | - |
| <a id="services"></a> `services` | `Record`\<`string`, `unknown`\> | - |
| <a id="siren"></a> `siren` | [`SirenEvent`](#sirenevent) | - |
| <a id="switch"></a> `switch` | [`SwitchEvent`](#switchevent) | - |
| <a id="telemetry"></a> `telemetry` | [`TelemetryEvent`](#telemetryevent) | - |
| <a id="text"></a> `text` | [`TextEvent`](#textevent) | - |
| <a id="text_sensor"></a> `text_sensor` | [`TextSensorEvent`](#textsensorevent) | - |
| <a id="time"></a> `time` | [`TimeEvent`](#timeevent) | - |
| <a id="timesync"></a> `timeSync` | `number` | This event communicates a server-provided epoch time that is intended for time synchronization. It is deliberately separate from the telemetry "time" channel to avoid event-name collision with a "time" entity update. |
| <a id="update"></a> `update` | [`UpdateEvent`](#updateevent) | - |
| <a id="valve"></a> `valve` | [`ValveEvent`](#valveevent) | - |
| <a id="voiceassistantannouncefinished"></a> `voiceAssistantAnnounceFinished` | `Record`\<`string`, `unknown`\> | - |
| <a id="voiceassistantaudio"></a> `voiceAssistantAudio` | \{ `chunk`: `Buffer`; \} | - |
| `voiceAssistantAudio.chunk` | `Buffer` | - |
| <a id="voiceassistantconfiguration"></a> `voiceAssistantConfiguration` | `Record`\<`string`, `unknown`\> | - |
| <a id="voiceassistantrequest"></a> `voiceAssistantRequest` | `Record`\<`string`, `unknown`\> | - |

***

### ClimateEvent

These families are already decoded into richer shapes elsewhere in the module. We intersect the decoded shapes with the base event and add the `type` discriminant and
the canonical `key`. We omit any `type` field from the decoded shapes to avoid conflicts with our discriminant.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent).`Omit`\<`ClimateTelemetryData`, `"type"`\>

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="action"></a> `action?` | `number` | - | `Omit.action` |
| <a id="awayconfig"></a> `awayConfig?` | `boolean` | - | `Omit.awayConfig` |
| <a id="currenthumidity"></a> `currentHumidity?` | `string` \| `number` | - | `Omit.currentHumidity` |
| <a id="currenttemperature"></a> `currentTemperature?` | `string` \| `number` | - | `Omit.currentTemperature` |
| <a id="customfanmode"></a> `customFanMode?` | `string` | - | `Omit.customFanMode` |
| <a id="custompreset"></a> `customPreset?` | `string` | - | `Omit.customPreset` |
| <a id="deviceid-3"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-3"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="fanmode"></a> `fanMode?` | `number` | - | `Omit.fanMode` |
| <a id="key-3"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="mode"></a> `mode?` | `number` | - | `Omit.mode` |
| <a id="preset"></a> `preset?` | `number` | - | `Omit.preset` |
| <a id="swingmode"></a> `swingMode?` | `number` | - | `Omit.swingMode` |
| <a id="targethumidity"></a> `targetHumidity?` | `string` \| `number` | - | `Omit.targetHumidity` |
| <a id="targettemperature"></a> `targetTemperature?` | `string` \| `number` | - | `Omit.targetTemperature` |
| <a id="targettemperaturehigh"></a> `targetTemperatureHigh?` | `string` \| `number` | - | `Omit.targetTemperatureHigh` |
| <a id="targettemperaturelow"></a> `targetTemperatureLow?` | `string` \| `number` | - | `Omit.targetTemperatureLow` |
| <a id="type-3"></a> `type` | `"climate"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |
| <a id="value"></a> `value?` | `string` \| `number` | - | `Omit.value` |

***

### CoverEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent).`Omit`\<`CoverTelemetryData`, `"type"`\>

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="currentoperation"></a> `currentOperation?` | `number` | - | `Omit.currentOperation` |
| <a id="deviceid-4"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-4"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-4"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="position"></a> `position?` | `number` | - | `Omit.position` |
| <a id="tilt"></a> `tilt?` | `number` | - | `Omit.tilt` |
| <a id="type-4"></a> `type` | `"cover"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### DateEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="day"></a> `day?` | `number` | - | - |
| <a id="deviceid-5"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-5"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-5"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate-1"></a> `missingState?` | `boolean` | - | - |
| <a id="month"></a> `month?` | `number` | - | - |
| <a id="type-5"></a> `type` | `"date"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |
| <a id="year"></a> `year?` | `number` | - | - |

***

### DateTimeEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-6"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-6"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="epochseconds"></a> `epochSeconds?` | `number` | - | - |
| <a id="key-6"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate-2"></a> `missingState?` | `boolean` | - | - |
| <a id="type-6"></a> `type` | `"datetime"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### DeviceInfo

Device information received from the ESPHome device. This structure contains all metadata about the connected ESPHome device.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="apiencryptionsupported"></a> `apiEncryptionSupported?` | `boolean` | Whether the device supports API encryption (field 19). |
| <a id="bluetoothmacaddress"></a> `bluetoothMacAddress?` | `string` | The Bluetooth MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 18). |
| <a id="bluetoothproxyfeatureflags"></a> `bluetoothProxyFeatureFlags?` | `number` | Bluetooth proxy feature flags (field 15). |
| <a id="compilationtime"></a> `compilationTime?` | `string` | The date of compilation (field 5). |
| <a id="esphomeversion"></a> `esphomeVersion?` | `string` | A string describing the ESPHome version (field 4). |
| <a id="friendlyname"></a> `friendlyName?` | `string` | User-friendly name of the device (field 13). |
| <a id="hasdeepsleep"></a> `hasDeepSleep?` | `boolean` | Whether the device has deep sleep configured (field 7). |
| <a id="legacybluetoothproxyversion"></a> `legacyBluetoothProxyVersion?` | `number` | Legacy Bluetooth proxy version, deprecated (field 11). |
| <a id="legacyvoiceassistantversion"></a> `legacyVoiceAssistantVersion?` | `number` | Legacy voice assistant version, deprecated (field 14). |
| <a id="macaddress"></a> `macAddress?` | `string` | The MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 3). |
| <a id="manufacturer"></a> `manufacturer?` | `string` | The manufacturer of the device (field 12). |
| <a id="model"></a> `model?` | `string` | The model of the board (e.g., NodeMCU) (field 6). |
| <a id="name-1"></a> `name?` | `string` | The name of the node, given by "App.set_name()" (field 2). |
| <a id="projectname"></a> `projectName?` | `string` | The ESPHome project name if set (field 8). |
| <a id="projectversion"></a> `projectVersion?` | `string` | The ESPHome project version if set (field 9). |
| <a id="suggestedarea"></a> `suggestedArea?` | `string` | Suggested area for the device (field 16). |
| <a id="usespassword"></a> `usesPassword?` | `boolean` | Whether the device uses password authentication (field 1). |
| <a id="voiceassistantfeatureflags"></a> `voiceAssistantFeatureFlags?` | `number` | Voice assistant feature flags (field 17). |
| <a id="webserverport"></a> `webserverPort?` | `number` | Port number of the web server if enabled (field 10). |

***

### Entity

Represents one entity from the ESPHome device. An entity is any controllable or observable component on the device.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="key-7"></a> `key` | `number` | The numeric key identifier for the entity. |
| <a id="name-2"></a> `name` | `string` | The human-readable display name of the entity. |
| <a id="objectid"></a> `objectId` | `string` | The unique object ID of the entity (used for entity IDs). |
| <a id="type-7"></a> `type` | `string` | The type of entity (e.g., "switch", "light", "cover"). |

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

***

### EventEntityEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent).`Omit`\<`EventTelemetryData`, `"type"`\>

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-7"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-8"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="eventtype"></a> `eventType?` | `string` | - | `Omit.eventType` |
| <a id="key-8"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="type-8"></a> `type` | `"event"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### ExecuteServiceArgumentValue

Represents an argument value when executing a service.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="boolarray"></a> `boolArray?` | `boolean`[] |
| <a id="boolvalue"></a> `boolValue?` | `boolean` |
| <a id="floatarray"></a> `floatArray?` | `number`[] |
| <a id="floatvalue"></a> `floatValue?` | `number` |
| <a id="intarray"></a> `intArray?` | `number`[] |
| <a id="intvalue"></a> `intValue?` | `number` |
| <a id="stringarray"></a> `stringArray?` | `string`[] |
| <a id="stringvalue"></a> `stringValue?` | `string` |

***

### FanEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-8"></a> `deviceId?` | `number` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) | - |
| <a id="direction"></a> `direction?` | `number` | - | - |
| <a id="entity-9"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-9"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="oscillating"></a> `oscillating?` | `boolean` | - | - |
| <a id="presetmode"></a> `presetMode?` | `string` | - | - |
| <a id="speedlevel"></a> `speedLevel?` | `number` | - | - |
| <a id="state-2"></a> `state?` | `boolean` | - | - |
| <a id="type-9"></a> `type` | `"fan"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### LightEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent).`Omit`\<`LightTelemetryData`, `"type"`\>

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="blue"></a> `blue?` | `number` | - | `Omit.blue` |
| <a id="brightness-1"></a> `brightness?` | `number` | - | `Omit.brightness` |
| <a id="coldwhite"></a> `coldWhite?` | `number` | - | `Omit.coldWhite` |
| <a id="colorbrightness"></a> `colorBrightness?` | `number` | - | `Omit.colorBrightness` |
| <a id="colormode-1"></a> `colorMode?` | `number` | - | `Omit.colorMode` |
| <a id="colortemperature"></a> `colorTemperature?` | `number` | - | `Omit.colorTemperature` |
| <a id="deviceid-9"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="effect"></a> `effect?` | `string` | - | `Omit.effect` |
| <a id="entity-10"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="green"></a> `green?` | `number` | - | `Omit.green` |
| <a id="key-10"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="red"></a> `red?` | `number` | - | `Omit.red` |
| <a id="state-3"></a> `state?` | `boolean` | - | `Omit.state` |
| <a id="type-10"></a> `type` | `"light"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |
| <a id="value-1"></a> `value?` | `string` \| `number` | - | `Omit.value` |
| <a id="warmwhite"></a> `warmWhite?` | `number` | - | `Omit.warmWhite` |
| <a id="white-1"></a> `white?` | `number` | - | `Omit.white` |

***

### LockEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-10"></a> `deviceId?` | `number` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) | - |
| <a id="entity-11"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-11"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="state-4"></a> `state?` | `number` | - | - |
| <a id="type-11"></a> `type` | `"lock"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### LogEventData

Log event data emitted when log messages are received from the ESPHome device. These provide insight into the device's internal operation and debugging information.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="level"></a> `level` | [`LogLevel`](#loglevel) | The log level of the message (ERROR, WARN, INFO, DEBUG, VERBOSE, VERY_VERBOSE). |
| <a id="message-1"></a> `message` | `string` | The actual log message text. |
| <a id="sendfailed"></a> `sendFailed?` | `boolean` | Whether sending the log message failed (optional). |

***

### MediaPlayerEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-11"></a> `deviceId?` | `number` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) | - |
| <a id="entity-12"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-12"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="muted"></a> `muted?` | `boolean` | - | - |
| <a id="state-5"></a> `state?` | `number` | - | - |
| <a id="type-12"></a> `type` | `"media_player"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |
| <a id="volume"></a> `volume?` | `number` | - | - |

***

### MessageEventData

Message event data. This structure is emitted with the 'message' event for raw protocol messages.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="payload"></a> `payload` | `Buffer` |
| <a id="type-13"></a> `type` | `number` |

***

### NumberEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-12"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-13"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-13"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate-3"></a> `missingState?` | `boolean` | - | - |
| <a id="state-6"></a> `state?` | `number` | - | - |
| <a id="type-14"></a> `type` | `"number"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### SelectEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-13"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-14"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-14"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate-4"></a> `missingState?` | `boolean` | - | - |
| <a id="state-7"></a> `state?` | `string` | - | - |
| <a id="type-15"></a> `type` | `"select"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### SensorEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-14"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-15"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-15"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate-5"></a> `missingState?` | `boolean` | - | - |
| <a id="state-8"></a> `state?` | `number` | - | - |
| <a id="type-16"></a> `type` | `"sensor"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### ServiceArgument

Represents a user-defined service argument definition.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="name-3"></a> `name` | `string` | The name of the argument. |
| <a id="type-17"></a> `type` | [`ServiceArgType`](#serviceargtype) | The type of the argument (from ServiceArgType enum). |

***

### ServiceEntity

Represents a user-defined service entity.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="args"></a> `args` | [`ServiceArgument`](#serviceargument)[] | The list of arguments the service accepts. |
| <a id="key-16"></a> `key` | `number` | The unique numeric identifier for the service. |
| <a id="name-4"></a> `name` | `string` | The name of the service. |

***

### SirenEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-15"></a> `deviceId?` | `number` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) | - |
| <a id="entity-16"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-17"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="state-9"></a> `state?` | `boolean` | - | - |
| <a id="type-18"></a> `type` | `"siren"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### SwitchEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-16"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-17"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-18"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="state-10"></a> `state?` | `boolean` | - | - |
| <a id="type-19"></a> `type` | `"switch"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### TelemetryBaseEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extended by

- [`BinarySensorEvent`](#binarysensorevent)
- [`DateEvent`](#dateevent)
- [`DateTimeEvent`](#datetimeevent)
- [`NumberEvent`](#numberevent)
- [`SelectEvent`](#selectevent)
- [`SensorEvent`](#sensorevent)
- [`SwitchEvent`](#switchevent)
- [`TextEvent`](#textevent)
- [`TextSensorEvent`](#textsensorevent)
- [`TimeEvent`](#timeevent)
- [`ClimateEvent`](#climateevent)
- [`CoverEvent`](#coverevent)
- [`EventEntityEvent`](#evententityevent)
- [`LightEvent`](#lightevent)
- [`ValveEvent`](#valveevent)
- [`AlarmControlPanelEvent`](#alarmcontrolpanelevent)
- [`ButtonEvent`](#buttonevent)
- [`FanEvent`](#fanevent)
- [`LockEvent`](#lockevent)
- [`MediaPlayerEvent`](#mediaplayerevent)
- [`SirenEvent`](#sirenevent)
- [`UpdateEvent`](#updateevent)

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="deviceid-17"></a> `deviceId?` | `number` |
| <a id="entity-18"></a> `entity` | `string` |
| <a id="key-19"></a> `key` | `number` |
| <a id="type-20"></a> `type` | [`TelemetryEventType`](#telemetryeventtype) |

***

### TextEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-18"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-19"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-20"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate-6"></a> `missingState?` | `boolean` | - | - |
| <a id="state-11"></a> `state?` | `string` | - | - |
| <a id="type-21"></a> `type` | `"text"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### TextSensorEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-19"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-20"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-21"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="missingstate-7"></a> `missingState?` | `boolean` | - | - |
| <a id="state-12"></a> `state?` | `string` | - | - |
| <a id="type-22"></a> `type` | `"text_sensor"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### TimeEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="deviceid-20"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-21"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="hour"></a> `hour?` | `number` | - | - |
| <a id="key-22"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="minute"></a> `minute?` | `number` | - | - |
| <a id="missingstate-8"></a> `missingState?` | `boolean` | - | - |
| <a id="second"></a> `second?` | `number` | - | - |
| <a id="type-23"></a> `type` | `"time"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### UpdateEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent)

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="currentversion"></a> `currentVersion?` | `string` | - | - |
| <a id="deviceid-21"></a> `deviceId?` | `number` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) | - |
| <a id="entity-22"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="hasprogress"></a> `hasProgress?` | `boolean` | - | - |
| <a id="inprogress"></a> `inProgress?` | `boolean` | - | - |
| <a id="key-23"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="latestversion"></a> `latestVersion?` | `string` | - | - |
| <a id="missingstate-9"></a> `missingState?` | `boolean` | - | - |
| <a id="progress"></a> `progress?` | `number` | - | - |
| <a id="releasesummary"></a> `releaseSummary?` | `string` | - | - |
| <a id="releaseurl"></a> `releaseUrl?` | `string` | - | - |
| <a id="title"></a> `title?` | `string` | - | - |
| <a id="type-24"></a> `type` | `"update"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |

***

### ValveEvent

This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.

#### Extends

- [`TelemetryBaseEvent`](#telemetrybaseevent).`Omit`\<`ValveTelemetryData`, `"type"`\>

#### Properties

| Property | Type | Overrides | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="currentoperation-1"></a> `currentOperation?` | `number` | - | `Omit.currentOperation` |
| <a id="deviceid-22"></a> `deviceId?` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`deviceId`](#deviceid-17) |
| <a id="entity-23"></a> `entity` | `string` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`entity`](#entity-18) |
| <a id="key-24"></a> `key` | `number` | - | [`TelemetryBaseEvent`](#telemetrybaseevent).[`key`](#key-19) |
| <a id="position-1"></a> `position?` | `string` \| `number` | - | `Omit.position` |
| <a id="type-25"></a> `type` | `"valve"` | [`TelemetryBaseEvent`](#telemetrybaseevent).[`type`](#type-20) | - |
| <a id="value-2"></a> `value?` | `string` \| `number` | - | `Omit.value` |

***

### VoiceAssistantConfiguration

Voice assistant configuration response.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="activewakewords"></a> `activeWakeWords` | `string`[] | List of currently active wake word IDs. |
| <a id="availablewakewords"></a> `availableWakeWords` | [`VoiceAssistantWakeWord`](#voiceassistantwakeword)[] | List of available wake words. |
| <a id="maxactivewakewords"></a> `maxActiveWakeWords` | `number` | Maximum number of wake words that can be active. |

***

### VoiceAssistantEventData

Voice assistant event data that provides additional information about an event.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="name-5"></a> `name` | `string` | The name of the event data field. |
| <a id="value-3"></a> `value` | `string` | The value of the event data field. |

***

### VoiceAssistantTimerEventData

Voice assistant timer event data.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="eventtype-1"></a> `eventType` | [`VoiceAssistantTimerEvent`](#voiceassistanttimerevent) | The type of timer event. |
| <a id="isactive"></a> `isActive` | `boolean` | Whether the timer is currently active. |
| <a id="name-6"></a> `name` | `string` | The name of the timer. |
| <a id="secondsleft"></a> `secondsLeft` | `number` | The remaining time in seconds. |
| <a id="timerid"></a> `timerId` | `string` | The unique identifier for the timer. |
| <a id="totalseconds"></a> `totalSeconds` | `number` | The total duration of the timer in seconds. |

***

### VoiceAssistantWakeWord

Voice assistant wake word configuration.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="id"></a> `id` | `string` | The unique identifier for the wake word. |
| <a id="trainedlanguages"></a> `trainedLanguages` | `string`[] | List of languages the wake word is trained for. |
| <a id="wakeword"></a> `wakeWord` | `string` | The wake word phrase. |

## Type Aliases

### TelemetryEvent

```ts
type TelemetryEvent = 
  | AlarmControlPanelEvent
  | BinarySensorEvent
  | ButtonEvent
  | ClimateEvent
  | CoverEvent
  | DateEvent
  | DateTimeEvent
  | EventEntityEvent
  | FanEvent
  | LightEvent
  | LockEvent
  | MediaPlayerEvent
  | NumberEvent
  | SelectEvent
  | SensorEvent
  | SirenEvent
  | SwitchEvent
  | TextEvent
  | TextSensorEvent
  | TimeEvent
  | UpdateEvent
  | ValveEvent;
```

This exported union type represents every telemetry payload we emit. Consumers should narrow on `type` to receive the appropriate interface. This provides strong
typing for both the generic "telemetry" channel and per-kind channels.

***

### TelemetryEventType

```ts
type TelemetryEventType = 
  | "alarm_control_panel"
  | "binary_sensor"
  | "button"
  | "climate"
  | "cover"
  | "date"
  | "datetime"
  | "event"
  | "fan"
  | "light"
  | "lock"
  | "media_player"
  | "number"
  | "select"
  | "sensor"
  | "siren"
  | "switch"
  | "text"
  | "text_sensor"
  | "time"
  | "update"
  | "valve";
```

This union enumerates every telemetry family we currently support. We use these literal strings as the discriminant on the `type` property in every telemetry payload.
Doing so allows consumers to narrow by `type` and receive precise typing.

## Events

### EspHomeClient

The main ESPHome native API client class for communicating with ESP8266/ESP32 devices running ESPHome firmware. This class provides a complete implementation of the
ESPHome native API protocol, handling all the complexity of binary message encoding/decoding, connection management, entity discovery, and state synchronization.

The client operates as an event-driven state machine that manages the entire connection lifecycle. It automatically handles encryption negotiation, falls back to
plaintext when needed, discovers all available entities, and maintains real-time state synchronization through the subscription system. The design prioritizes
reliability with automatic reconnection, comprehensive error handling, and detailed logging for debugging.

## Connection Management

The client intelligently manages connections based on the provided configuration. When an encryption key is provided, it attempts a Noise-encrypted connection first,
falling back to plaintext if the device doesn't support encryption. This adaptive approach ensures maximum compatibility while preferring security when available.

## Entity Discovery and Control

Upon connection, the client automatically discovers all entities configured on the ESPHome device. Each entity is assigned a unique identifier following the pattern
`{type}-{object_id}`, making it easy to reference entities in your code. The client provides type-safe methods for controlling each entity type, from simple switches
to complex climate systems.

## Real-time State Synchronization

The client maintains a real-time view of all entity states through its subscription system. State changes are immediately pushed from the device and emitted as typed
events, allowing your application to react instantly to changes in the physical world.

#### Examples

```typescript
import { EspHomeClient, LogLevel } from "./esphome-client";

// Create a robust client with full error handling and reconnection.
const client = new EspHomeClient({
  host: "192.168.1.100",
  port: 6053,
  encryptionKey: process.env.ESPHOME_KEY, // Store keys securely
  clientId: "home-automation-hub",
  reconnect: true,
  reconnectInterval: 15000,
  connectionTimeout: 30000,
  logger: {
    debug: (msg) => console.log(`[DEBUG] ${msg}`),
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`)
  }
});

// Set up comprehensive event handling.
client.on("connect", ({ encrypted }) => {
  console.log(`✓ Connected to ESPHome device (encrypted: ${encrypted})`);

  // Subscribe to logs for debugging.
  client.subscribeToLogs(LogLevel.INFO);

  // Log all available entities.
  client.logAllEntityIds();
});

client.on("disconnect", (reason) => {
  console.log(`✗ Disconnected: ${reason || "Connection lost"}`);
});

client.on("error", (error) => {
  console.error("Client error:", error);
  // Implement your error recovery logic here.
});

client.on("deviceInfo", (info) => {
  console.log(`Device: ${info.name} v${info.esphomeVersion}`);
  console.log(`Model: ${info.model}, MAC: ${info.macAddress}`);
});

// Connect with error handling.
try {
  await client.connect();
} catch (error) {
  console.error("Failed to connect:", error);
  process.exit(1);
}

// Graceful shutdown.
process.on("SIGINT", () => {
  console.log("\\nShutting down...");
  client.disconnect();
  process.exit(0);
});
```

```typescript
// Build a motion-activated lighting system with time-based rules.
const client = new EspHomeClient({ host: "hallway-controller.local" });

// Track motion and light states.
let motionDetected = false;
let lightsOn = false;
let lastMotion = Date.now();

client.on("binary_sensor", (data) => {
  if (data.entity === "binary_sensor-hallway_motion") {
    motionDetected = data.state;
    lastMotion = Date.now();

    if (motionDetected && !lightsOn) {
      // Check time of day for brightness.
      const hour = new Date().getHours();
      const brightness = ((hour >= 22) || (hour < 6)) ? 0.1 : 0.8;

      client.sendLightCommand("light-hallway", {
        state: true,
        brightness,
        transition: 1.0
      });
    }
  }
});

client.on("light", (data) => {
  if (data.entity === "light-hallway") {
    lightsOn = data.state;
  }
});

// Auto-off timer.
setInterval(() => {
  if (lightsOn && !motionDetected && (Date.now() - lastMotion) > 300000) {
    client.sendLightCommand("light-hallway", {
      state: false,
      transition: 3.0
    });
  }
}, 10000);
```

```typescript
// Integrate with voice assistant capabilities.
const client = new EspHomeClient({ host: "voice-device.local" });

// Subscribe to voice assistant with audio streaming.
client.subscribeVoiceAssistant(VoiceAssistantSubscribeFlag.API_AUDIO);

// Handle wake word detection.
client.on("voiceAssistantRequest", async (data) => {
  if (data.start && data.flags & VoiceAssistantRequestFlag.USE_WAKE_WORD) {
    console.log(`Wake word detected: "${data.wakeWordPhrase}"`);

    // Start your audio streaming server.
    const audioPort = await startAudioServer();
    client.sendVoiceAssistantResponse(audioPort, false);
  }
});

// Process voice assistant events.
client.sendVoiceAssistantEvent(VoiceAssistantEvent.STT_START);
// ... perform speech recognition ...
client.sendVoiceAssistantEvent(VoiceAssistantEvent.STT_END, [
  { name: "text", value: "Turn on the living room lights" }
]);
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
Returns a copy of the device information to prevent external mutation.

###### Returns

[`Nullable`](types.md#nullable)\<[`DeviceInfo`](#deviceinfo-3)\>

The device information if available, or `null` if not yet received.

##### disconnect()

```ts
disconnect(): void;
```

Disconnect from the ESPHome device and cleanup resources. This method should be called when you're done communicating with the device.

###### Returns

`void`

##### executeService()

```ts
executeService(key, args): void;
```

Execute a user-defined service on the ESPHome device.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `key` | `number` | `undefined` | The service key (numeric identifier). |
| `args` | [`ExecuteServiceArgumentValue`](#executeserviceargumentvalue)[] | `[]` | An array of argument values matching the service definition. |

###### Returns

`void`

###### Example

```typescript
// Execute a service with a string and number argument
await client.executeService(12345, [
  { stringValue: "test" },
  { intValue: 42 }
]);

// Execute a service with array arguments
await client.executeService(54321, [
  { boolArray: [true, false, true] },
  { floatArray: [1.5, 2.5, 3.5] }
]);
```

##### executeServiceByName()

```ts
executeServiceByName(name, args): void;
```

Execute a user-defined service on the ESPHome device by name.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `name` | `string` | `undefined` | The service name. |
| `args` | [`ExecuteServiceArgumentValue`](#executeserviceargumentvalue)[] | `[]` | An array of argument values matching the service definition. |

###### Returns

`void`

###### Example

```typescript
// Execute a service by name
await client.executeServiceByName("my_custom_service", [
  { stringValue: "test" },
  { intValue: 42 }
]);
```

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

[`Entity`](#entity-7) & \{
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

[`Nullable`](types.md#nullable)\<[`Entity`](#entity-7)\>

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

##### getServices()

```ts
getServices(): ServiceEntity[];
```

Get the list of discovered user-defined services.

###### Returns

[`ServiceEntity`](#serviceentity)[]

An array of discovered service entities.

###### Example

```typescript
const services = client.getServices();
services.forEach(service => {
  console.log(`Service: ${service.name} (key: ${service.key})`);
  service.args.forEach(arg => {
    console.log(`  - ${arg.name}: ${ServiceArgType[arg.type]}`);
  });
});
```

##### getVoiceAssistantConfiguration()

```ts
getVoiceAssistantConfiguration(): null | VoiceAssistantConfiguration;
```

Get the current voice assistant configuration.

###### Returns

`null` \| [`VoiceAssistantConfiguration`](#voiceassistantconfiguration-1)

The voice assistant configuration or null if not available.

###### Example

```typescript
const config = client.getVoiceAssistantConfiguration();
if (config) {
  console.log("Available wake words:", config.availableWakeWords);
}
```

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

##### isVoiceAssistantSubscribed()

```ts
isVoiceAssistantSubscribed(): boolean;
```

Check if subscribed to voice assistant.

###### Returns

`boolean`

Whether voice assistant subscription is active.

###### Example

```typescript
if (client.isVoiceAssistantSubscribed()) {
  console.log("Voice assistant is active");
}
```

##### logAllEntityIds()

```ts
logAllEntityIds(): void;
```

Log all registered entity IDs for debugging. Logs entities grouped by type with their names and keys. This is primarily a debugging and development tool.

###### Returns

`void`

##### on()

```ts
on<K>(event, listener): this;
```

Subscribes to an event and invokes the listener every time the event is emitted. The payload type is inferred from the event name based on [ClientEventsMap](#clienteventsmap).

###### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ClientEventsMap`](#clienteventsmap) |

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The name of the event to subscribe to. |
| `listener` | (`payload`) => `void` | The function to invoke when the event is emitted. |

###### Returns

`this`

The client instance, to allow chaining.

###### Inherited from

```ts
EventEmitter.on
```

##### once()

```ts
once<K>(event, listener): this;
```

Subscribes to an event and invokes the listener at most once. After the first invocation, the listener is removed. The payload type is inferred from the event name
based on [ClientEventsMap](#clienteventsmap).

###### Type Parameters

| Type Parameter |
| ------ |
| `K` *extends* keyof [`ClientEventsMap`](#clienteventsmap) |

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `event` | `K` | The name of the event to subscribe to. |
| `listener` | (`payload`) => `void` | The function to invoke once when the event is emitted. |

###### Returns

`this`

The client instance, to allow chaining.

###### Inherited from

```ts
EventEmitter.once
```

##### requestVoiceAssistantConfiguration()

```ts
requestVoiceAssistantConfiguration(): void;
```

Request voice assistant configuration from the device.

###### Returns

`void`

###### Example

```typescript
client.requestVoiceAssistantConfiguration();

// Listen for the response
client.on("voiceAssistantConfiguration", (config) => {
  console.log("Available wake words:", config.availableWakeWords);
  console.log("Active wake words:", config.activeWakeWords);
});
```

##### sendAlarmControlPanelCommand()

```ts
sendAlarmControlPanelCommand(
   id, 
   command, 
   code?): void;
```

Sends an AlarmControlPanelCommandRequest to control an alarm panel entity. Alarm control panel entities represent security system interfaces.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "alarm_control_panel-object_id"). |
| `command` | \| `"disarm"` \| `"arm_home"` \| `"arm_away"` \| `"arm_night"` \| `"arm_vacation"` \| `"arm_custom_bypass"` \| `"trigger"` | The command: "disarm", "arm_home", "arm_away", "arm_night", "arm_vacation", "arm_custom_bypass", "trigger". |
| `code?` | `string` | Optional alarm code for arming/disarming (field 3). |

###### Returns

`void`

###### Example

```typescript
// Disarm with code
await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "disarm", "1234");

// Arm in home mode without code
await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "arm_home");

// Arm in away mode with code
await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "arm_away", "1234");

// Trigger alarm (usually for testing)
await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "trigger");
```

##### sendButtonCommand()

```ts
sendButtonCommand(id): void;
```

Sends a ButtonCommandRequest to press a button entity. Button entities trigger one-time actions when pressed.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "button-object_id"). |

###### Returns

`void`

##### sendCameraImageRequest()

```ts
sendCameraImageRequest(single): void;
```

Sends a CameraImageRequest to capture an image from a camera entity. Camera entities represent image capture devices.
Note: Unlike other commands, camera image requests don't target a specific entity - the device will send images from all cameras.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `single` | `boolean` | Whether to capture a single image (true) or stream images continuously (false). |

###### Returns

`void`

###### Example

```typescript
// Capture a single image from all cameras
await client.sendCameraImageRequest(true);

// Start streaming images from all cameras
await client.sendCameraImageRequest(false);

// Listen for camera images
client.on("camera", (data) => {
  console.log(`Image from ${data.entity}: ${data.image.length} bytes`);
  if (data.done) {
    console.log("Image capture complete");
  }
  // Save image to file
  fs.writeFileSync(`camera-${data.entity}.jpg`, data.image);
});
```

##### sendClimateCommand()

```ts
sendClimateCommand(id, options): void;
```

Sends a ClimateCommandRequest to control a climate/HVAC entity. Climate entities represent heating, ventilation, and air conditioning systems with comprehensive
control over temperature, fan modes, swing modes, and operating modes.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "climate-object_id"). |
| `options` | \{ `customFanMode?`: `string`; `customPreset?`: `string`; `fanMode?`: \| `"auto"` \| `"high"` \| `"low"` \| `"medium"` \| `"off"` \| `"middle"` \| `"focus"` \| `"on"` \| `"diffuse"` \| `"quiet"`; `mode?`: `"auto"` \| `"off"` \| `"heat_cool"` \| `"cool"` \| `"heat"` \| `"fan_only"` \| `"dry"`; `preset?`: \| `"none"` \| `"home"` \| `"away"` \| `"boost"` \| `"comfort"` \| `"eco"` \| `"sleep"` \| `"activity"`; `swingMode?`: `"both"` \| `"off"` \| `"vertical"` \| `"horizontal"`; `targetHumidity?`: `number`; `targetTemperature?`: `number`; `targetTemperatureHigh?`: `number`; `targetTemperatureLow?`: `number`; \} | Command options (at least one option must be provided). |
| `options.customFanMode?` | `string` | Custom fan mode string when using a custom fan configuration (optional). |
| `options.customPreset?` | `string` | Custom preset string when using a custom preset configuration (optional). |
| `options.fanMode?` | \| `"auto"` \| `"high"` \| `"low"` \| `"medium"` \| `"off"` \| `"middle"` \| `"focus"` \| `"on"` \| `"diffuse"` \| `"quiet"` | Fan mode: "on", "off", "auto", "low", "medium", "high", "middle", "focus", "diffuse", "quiet" (optional). |
| `options.mode?` | `"auto"` \| `"off"` \| `"heat_cool"` \| `"cool"` \| `"heat"` \| `"fan_only"` \| `"dry"` | Operating mode: "off", "heat_cool", "cool", "heat", "fan_only", "dry", "auto" (optional). |
| `options.preset?` | \| `"none"` \| `"home"` \| `"away"` \| `"boost"` \| `"comfort"` \| `"eco"` \| `"sleep"` \| `"activity"` | Preset mode: "none", "home", "away", "boost", "comfort", "eco", "sleep", "activity" (optional). |
| `options.swingMode?` | `"both"` \| `"off"` \| `"vertical"` \| `"horizontal"` | Swing mode: "off", "both", "vertical", "horizontal" (optional). |
| `options.targetHumidity?` | `number` | Target humidity percentage 0-100 (optional). |
| `options.targetTemperature?` | `number` | Target temperature in the unit configured on the device (optional). |
| `options.targetTemperatureHigh?` | `number` | High point for heat_cool mode in the unit configured on the device (optional). |
| `options.targetTemperatureLow?` | `number` | Low point for heat_cool mode in the unit configured on the device (optional). |

###### Returns

`void`

###### Example

```typescript
// Turn on heating to 72°F
await client.sendClimateCommand("climate-thermostat_climate", {
  mode: "heat",
  targetTemperature: 72
});

// Set to heat_cool mode with temperature range
await client.sendClimateCommand("climate-thermostat_climate", {
  mode: "heat_cool",
  targetTemperatureLow: 68,
  targetTemperatureHigh: 76
});

// Turn on cooling with specific fan and swing settings
await client.sendClimateCommand("climate-ac_climate", {
  mode: "cool",
  targetTemperature: 74,
  fanMode: "high",
  swingMode: "vertical"
});

// Set to eco preset
await client.sendClimateCommand("climate-thermostat_climate", {
  preset: "eco"
});

// Turn off the climate system
await client.sendClimateCommand("climate-thermostat_climate", { mode: "off" });

// Set custom fan mode
await client.sendClimateCommand("climate-ac_climate", {
  customFanMode: "turbo"
});

// Control humidity along with temperature
await client.sendClimateCommand("climate-hvac_climate", {
  mode: "auto",
  targetTemperature: 72,
  targetHumidity: 45
});
```

##### sendCoverCommand()

```ts
sendCoverCommand(id, options): void;
```

Sends a CoverCommandRequest for the given entity ID. Cover entities represent things like garage doors, blinds, or shades.
This implementation uses modern API semantics only - no deprecated legacy commands.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "cover-object_id"). |
| `options` | `Partial`\<\{ `position`: `number`; `stop`: `boolean`; `tilt`: `number`; \}\> | Command options (at least one option must be provided). |

###### Returns

`void`

###### Example

```typescript
// Open fully
await client.sendCoverCommand("cover-garage_door_cover", { position: 1.0 });

// Close fully
await client.sendCoverCommand("cover-garage_door_cover", { position: 0.0 });

// Stop movement
await client.sendCoverCommand("cover-garage_door_cover", { stop: true });

// Set to specific position - 50% open.
await client.sendCoverCommand("cover-garage_door_cover", { position: 0.5 });

// Set position and tilt for blinds
await client.sendCoverCommand("cover-blinds_cover", { position: 1.0, tilt: 0.25 });
```

##### sendDateCommand()

```ts
sendDateCommand(
   id, 
   year, 
   month, 
   day): void;
```

Sends a DateCommandRequest to set the value of a date entity. Date entities represent calendar dates without time information.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "date-object_id"). |
| `year` | `number` | The year (e.g., 2025). |
| `month` | `number` | The month (1-12). |
| `day` | `number` | The day of month (1-31). |

###### Returns

`void`

###### Example

```typescript
// Set a target date
await client.sendDateCommand("date-target_date", 2025, 12, 25);

// Set a birthday
await client.sendDateCommand("date-birthday", 1990, 5, 15);
```

##### sendDateTimeCommand()

```ts
sendDateTimeCommand(id, epochSeconds): void;
```

Sends a DateTimeCommandRequest to set the value of a datetime entity. DateTime entities represent both date and time information.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "datetime-object_id"). |
| `epochSeconds` | `number` | The Unix timestamp in seconds. |

###### Returns

`void`

###### Example

```typescript
// Set to current time
await client.sendDateTimeCommand("datetime-last_update", Math.floor(Date.now() / 1000));

// Set to a specific datetime
const targetDate = new Date("2025-12-25T08:00:00");
await client.sendDateTimeCommand("datetime-scheduled", Math.floor(targetDate.getTime() / 1000));
```

##### sendFanCommand()

```ts
sendFanCommand(id, options): void;
```

Sends a FanCommandRequest to control a fan entity. Fan entities represent devices that move air with optional speed and oscillation control.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "fan-object_id"). |
| `options` | \{ `direction?`: `"reverse"` \| `"forward"`; `oscillating?`: `boolean`; `presetMode?`: `string`; `speedLevel?`: `number`; `state?`: `boolean`; \} | Command options (at least one option must be provided). |
| `options.direction?` | `"reverse"` \| `"forward"` | Fan direction: "forward" or "reverse" (optional). |
| `options.oscillating?` | `boolean` | Enable (true) or disable (false) oscillation (optional). |
| `options.presetMode?` | `string` | Preset mode string (optional). |
| `options.speedLevel?` | `number` | Fan speed level as an integer (0-100 or device-specific range) (optional). |
| `options.state?` | `boolean` | Turn fan on (true) or off (false) (optional). |

###### Returns

`void`

###### Example

```typescript
// Turn on fan at 50% speed
await client.sendFanCommand("fan-bedroom_fan", { state: true, speedLevel: 50 });

// Turn on oscillation
await client.sendFanCommand("fan-bedroom_fan", { oscillating: true });

// Set to reverse direction
await client.sendFanCommand("fan-ceiling_fan", { direction: "reverse" });

// Set preset mode
await client.sendFanCommand("fan-bedroom_fan", { presetMode: "sleep" });

// Turn off fan
await client.sendFanCommand("fan-bedroom_fan", { state: false });
```

##### sendLightCommand()

```ts
sendLightCommand(id, options): void;
```

Sends a comprehensive LightCommandRequest to control all aspects of a light entity. Light entities support various color modes, effects, and transitions.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "light-object_id"). |
| `options` | \{ `brightness?`: `number`; `coldWhite?`: `number`; `colorBrightness?`: `number`; `colorMode?`: [`ColorMode`](#colormode); `colorTemperature?`: `number`; `effect?`: `string`; `flashLength?`: `number`; `rgb?`: \{ `b`: `number`; `g`: `number`; `r`: `number`; \}; `state?`: `boolean`; `transitionLength?`: `number`; `warmWhite?`: `number`; `white?`: `number`; \} | Command options. |
| `options.brightness?` | `number` | Brightness level 0.0-1.0 (optional). |
| `options.coldWhite?` | `number` | Cold white channel value 0.0-1.0 (optional). |
| `options.colorBrightness?` | `number` | Color brightness 0.0-1.0 for RGB modes (optional). |
| `options.colorMode?` | [`ColorMode`](#colormode) | The color mode to use (see ColorMode enum) (optional). |
| `options.colorTemperature?` | `number` | Color temperature in mireds (optional). |
| `options.effect?` | `string` | Effect name string (optional). |
| `options.flashLength?` | `number` | Flash duration in milliseconds (optional). |
| `options.rgb?` | \{ `b`: `number`; `g`: `number`; `r`: `number`; \} | RGB color values with r, g, b properties 0.0-1.0 (optional). |
| `options.rgb.b` | `number` | - |
| `options.rgb.g` | `number` | - |
| `options.rgb.r` | `number` | - |
| `options.state?` | `boolean` | Turn light on (true) or off (false) (optional). |
| `options.transitionLength?` | `number` | Transition duration in milliseconds (optional). |
| `options.warmWhite?` | `number` | Warm white channel value 0.0-1.0 (optional). |
| `options.white?` | `number` | White channel value 0.0-1.0 (optional). |

###### Returns

`void`

###### Example

```typescript
// Simple on/off with brightness.
await client.sendLightCommand("light-living_room_light", { state: true, brightness: 0.8 });

// Set RGB color.
await client.sendLightCommand("light-led_strip_light", {
  state: true,
  colorMode: ColorMode.RGB,
  rgb: { r: 1.0, g: 0.0, b: 0.5 },
  colorBrightness: 0.9
});

// Set color temperature to warm white in mireds.
await client.sendLightCommand("light-bedroom_light", {
  state: true,
  colorMode: ColorMode.COLOR_TEMPERATURE,
  colorTemperature: 300,
  brightness: 0.7
});

// Set cold/warm white balance.
await client.sendLightCommand("light-kitchen_light", {
  state: true,
  colorMode: ColorMode.COLD_WARM_WHITE,
  coldWhite: 0.3,
  warmWhite: 0.7
});

// Apply effect with a 2 second transition.
await client.sendLightCommand("light-accent_light", {
  state: true,
  effect: "rainbow",
  transitionLength: 2000
});

// Flash the light for 500ms.
await client.sendLightCommand("light-notification_light", {
  state: true,
  flashLength: 500
});
```

##### sendLockCommand()

```ts
sendLockCommand(
   id, 
   command, 
   code?): void;
```

Sends a complete LockCommandRequest to control lock entities. Lock entities support lock, unlock, and open commands with optional codes.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "lock-object_id"). |
| `command` | `"open"` \| `"lock"` \| `"unlock"` | The command to send: "lock", "unlock", or "open". |
| `code?` | `string` | Optional unlock/lock code (optional). |

###### Returns

`void`

###### Example

```typescript
// Lock without code
await client.sendLockCommand("lock-front_door_lock", "lock");

// Unlock with code
await client.sendLockCommand("lock-front_door_lock", "unlock", "1234");

// Open (for locks that support it, like gate locks)
await client.sendLockCommand("lock-gate_lock", "open", "5678");
```

##### sendMediaPlayerCommand()

```ts
sendMediaPlayerCommand(id, options): void;
```

Sends a comprehensive MediaPlayerCommandRequest to control all aspects of a media player entity. Media player entities support playback control, volume
adjustments, playlist management, and media loading with announcement support.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "media_player-object_id"). |
| `options` | \{ `announcement?`: `boolean`; `command?`: [`MediaPlayerCommand`](#mediaplayercommand); `mediaUrl?`: `string`; `volume?`: `number`; \} | Command options (at least one option must be provided). |
| `options.announcement?` | `boolean` | Whether this is an announcement that should interrupt current playback (optional). |
| `options.command?` | [`MediaPlayerCommand`](#mediaplayercommand) | Media command from MediaPlayerCommand enum (optional). |
| `options.mediaUrl?` | `string` | URL of media to play (optional). |
| `options.volume?` | `number` | Volume level 0.0-1.0 (optional). |

###### Returns

`void`

###### Example

```typescript
// Simple playback control using enum
await client.sendMediaPlayerCommand("media_player-living_room", {
  command: MediaPlayerCommand.PLAY
});

// Pause playback
await client.sendMediaPlayerCommand("media_player-living_room", {
  command: MediaPlayerCommand.PAUSE
});

// Set volume
await client.sendMediaPlayerCommand("media_player-living_room", {
  volume: 0.5
});

// Mute/unmute
await client.sendMediaPlayerCommand("media_player-living_room", {
  command: MediaPlayerCommand.MUTE
});

// Play a specific URL
await client.sendMediaPlayerCommand("media_player-living_room", {
  mediaUrl: "http://example.com/music.mp3",
  command: MediaPlayerCommand.PLAY
});

// Play an announcement (interrupts current playback)
await client.sendMediaPlayerCommand("media_player-living_room", {
  mediaUrl: "http://example.com/doorbell.mp3",
  announcement: true,
  volume: 0.8
});

// Control playlist
await client.sendMediaPlayerCommand("media_player-living_room", {
  command: MediaPlayerCommand.REPEAT_ONE
});
await client.sendMediaPlayerCommand("media_player-living_room", {
  command: MediaPlayerCommand.CLEAR_PLAYLIST
});

// Turn on/off the media player
await client.sendMediaPlayerCommand("media_player-living_room", {
  command: MediaPlayerCommand.TURN_ON
});
```

##### sendNumberCommand()

```ts
sendNumberCommand(id, value): void;
```

Sends a NumberCommandRequest to set the value of a number entity. Number entities represent numeric values that can be adjusted within a defined range.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "number-object_id"). |
| `value` | `number` | The numeric value to set. |

###### Returns

`void`

###### Example

```typescript
// Set a temperature setpoint
await client.sendNumberCommand("number-thermostat_setpoint_number", 72.5);

// Set a brightness percentage
await client.sendNumberCommand("number-brightness_percent_number", 85);

// Set a timer duration
await client.sendNumberCommand("number-timer_minutes_number", 30);
```

##### sendPing()

```ts
sendPing(): void;
```

Send a ping request to the device to heartbeat the connection. This can be used to keep the connection alive and verify connectivity.

###### Returns

`void`

##### sendSelectCommand()

```ts
sendSelectCommand(id, option): void;
```

Sends a SelectCommandRequest to set the value of a select entity. Select entities represent a choice from a list of predefined options.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "select-object_id"). |
| `option` | `string` | The option string to select. |

###### Returns

`void`

###### Example

```typescript
// Set a mode selection
await client.sendSelectCommand("select-hvac_mode_select", "cooling");

// Set a fan speed
await client.sendSelectCommand("select-fan_speed_select", "high");

// Set a preset
await client.sendSelectCommand("select-preset_select", "eco");
```

##### sendSirenCommand()

```ts
sendSirenCommand(id, options): void;
```

Sends a SirenCommandRequest to control a siren entity. Siren entities represent audible or visual alarm devices.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "siren-object_id"). |
| `options` | \{ `duration?`: `number`; `state?`: `boolean`; `tone?`: `string`; `volume?`: `number`; \} | Command options. |
| `options.duration?` | `number` | Duration in seconds (uint32) for the siren to sound (optional). |
| `options.state?` | `boolean` | Turn siren on (true) or off (false) (optional). |
| `options.tone?` | `string` | Siren tone/pattern string to use (optional). |
| `options.volume?` | `number` | Volume level 0.0-1.0 (optional). |

###### Returns

`void`

###### Example

```typescript
// Turn on siren
await client.sendSirenCommand("siren-alarm", { state: true });

// Turn on with specific tone and duration
await client.sendSirenCommand("siren-alarm", {
  state: true,
  tone: "burglar",
  duration: 30,
  volume: 0.8
});

// Turn off siren
await client.sendSirenCommand("siren-alarm", { state: false });
```

##### sendSwitchCommand()

```ts
sendSwitchCommand(id, state): void;
```

Sends a SwitchCommandRequest for the given entity ID and on/off state. This controls binary switch entities like garage door openers.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "switch-object_id"). |
| `state` | `boolean` | `true` for on, `false` for off. |

###### Returns

`void`

##### sendTextCommand()

```ts
sendTextCommand(id, text): void;
```

Sends a TextCommandRequest to set the value of a text input entity. Text entities allow free-form text input within configured constraints.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "text-object_id"). |
| `text` | `string` | The text string to set. |

###### Returns

`void`

###### Example

```typescript
// Set a name field
await client.sendTextCommand("text-device_name_text", "Living Room Light");

// Set a message
await client.sendTextCommand("text-status_message_text", "Away until 6pm");

// Set a custom value
await client.sendTextCommand("text-custom_field_text", "User defined value");
```

##### sendTimeCommand()

```ts
sendTimeCommand(
   id, 
   hour, 
   minute, 
   second): void;
```

Sends a TimeCommandRequest to set the value of a time entity. Time entities represent time of day without date information.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `id` | `string` | `undefined` | The entity ID (format: "time-object_id"). |
| `hour` | `number` | `undefined` | The hour (0-23). |
| `minute` | `number` | `undefined` | The minute (0-59). |
| `second` | `number` | `0` | The second (0-59, optional, defaults to 0). |

###### Returns

`void`

###### Example

```typescript
// Set an alarm time
await client.sendTimeCommand("time-alarm", 7, 30);

// Set a schedule time with seconds
await client.sendTimeCommand("time-schedule", 14, 45, 30);
```

##### sendUpdateCommand()

```ts
sendUpdateCommand(id, command): void;
```

Sends an UpdateCommandRequest to control an update entity. Update entities represent firmware or software updates that can be installed.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "update-object_id"). |
| `command` | `"none"` \| `"update"` \| `"check"` | The command: "update" to install the update, "check" to check for updates, or "none" for no action. |

###### Returns

`void`

###### Example

```typescript
// Check for updates
await client.sendUpdateCommand("update-firmware", "check");

// Install available update
await client.sendUpdateCommand("update-firmware", "update");
```

##### sendValveCommand()

```ts
sendValveCommand(id, options): void;
```

Sends a ValveCommandRequest for the given entity ID. Valve entities represent controllable valves for fluid or gas flow control.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | `string` | The entity ID (format: "valve-object_id"). |
| `options` | \{ `position?`: `number`; `stop?`: `boolean`; \} | Command options (at least one option must be provided). |
| `options.position?` | `number` | Target position 0.0-1.0 where 0 is closed, 1 is open (optional). |
| `options.stop?` | `boolean` | Stop the valve at its current position (optional). |

###### Returns

`void`

###### Example

```typescript
// Open valve fully
await client.sendValveCommand("valve-water_main", { position: 1.0 });

// Close valve
await client.sendValveCommand("valve-water_main", { position: 0.0 });

// Set to 50% open
await client.sendValveCommand("valve-water_main", { position: 0.5 });

// Stop valve movement
await client.sendValveCommand("valve-water_main", { stop: true });
```

##### sendVoiceAssistantAnnounce()

```ts
sendVoiceAssistantAnnounce(options): void;
```

Send a voice assistant announce request to the device.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | \{ `mediaId?`: `string`; `preannounceMediaId?`: `string`; `startConversation?`: `boolean`; `text?`: `string`; \} | The announce options. |
| `options.mediaId?` | `string` | - |
| `options.preannounceMediaId?` | `string` | - |
| `options.startConversation?` | `boolean` | - |
| `options.text?` | `string` | - |

###### Returns

`void`

###### Example

```typescript
// Simple announcement
client.sendVoiceAssistantAnnounce({
  text: "Dinner is ready"
});

// Announcement with media and conversation start
client.sendVoiceAssistantAnnounce({
  mediaId: "doorbell.mp3",
  text: "Someone is at the door",
  preannounceMediaId: "chime.mp3",
  startConversation: true
});
```

##### sendVoiceAssistantAudio()

```ts
sendVoiceAssistantAudio(audioData, end): void;
```

Send voice assistant audio data to the device.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `audioData` | `Buffer` | `undefined` | The audio data buffer. |
| `end` | `boolean` | `false` | Whether this is the last audio packet. |

###### Returns

`void`

###### Example

```typescript
// Send audio chunk
client.sendVoiceAssistantAudio(audioBuffer, false);

// Send final audio chunk
client.sendVoiceAssistantAudio(lastAudioBuffer, true);
```

##### sendVoiceAssistantEvent()

```ts
sendVoiceAssistantEvent(eventType, data): void;
```

Send a voice assistant event to the device.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `eventType` | [`VoiceAssistantEvent`](#voiceassistantevent) | `undefined` | The type of event. |
| `data` | [`VoiceAssistantEventData`](#voiceassistanteventdata)[] | `[]` | Optional event data. |

###### Returns

`void`

###### Example

```typescript
// Send run start event
client.sendVoiceAssistantEvent(VoiceAssistantEvent.RUN_START);

// Send event with data
client.sendVoiceAssistantEvent(VoiceAssistantEvent.STT_END, [
  { name: "text", value: "Turn on the lights" }
]);
```

##### sendVoiceAssistantResponse()

```ts
sendVoiceAssistantResponse(port, error): void;
```

Send a voice assistant response to the device. Most clients use the API-audio path, and this port-based path is likely going to be deprecated in the future.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `port` | `number` | The port number for audio streaming (0 for no audio). |
| `error` | `boolean` | Whether an error occurred. |

###### Returns

`void`

###### Example

```typescript
// Respond with audio port
client.sendVoiceAssistantResponse(12345, false);

// Respond with error
client.sendVoiceAssistantResponse(0, true);
```

##### sendVoiceAssistantTimerEvent()

```ts
sendVoiceAssistantTimerEvent(timerData): void;
```

Send a voice assistant timer event to the device.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `timerData` | [`VoiceAssistantTimerEventData`](#voiceassistanttimereventdata) | The timer event data. |

###### Returns

`void`

###### Example

```typescript
client.sendVoiceAssistantTimerEvent({
  eventType: VoiceAssistantTimerEvent.STARTED,
  timerId: "timer-123",
  name: "Kitchen Timer",
  totalSeconds: 300,
  secondsLeft: 300,
  isActive: true
});
```

##### setNoiseEncryptionKey()

```ts
setNoiseEncryptionKey(key): Promise<boolean>;
```

Set a new Noise encryption key on the device. This allows changing the encryption key used for future connections.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `key` | `string` | The new encryption key (base64 encoded, must decode to exactly 32 bytes). |

###### Returns

`Promise`\<`boolean`\>

A promise that resolves to true if the key was successfully set, false otherwise.

###### Example

```typescript
// Set a new encryption key
const success = await client.setNoiseEncryptionKey("newBase64EncodedKey");
if (success) {
  console.log("Encryption key updated successfully");
  // Note: You'll need to reconnect with the new key
}
```

##### setVoiceAssistantConfiguration()

```ts
setVoiceAssistantConfiguration(activeWakeWords): void;
```

Set voice assistant configuration on the device.

###### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `activeWakeWords` | `string`[] | Array of wake word IDs to activate. |

###### Returns

`void`

###### Example

```typescript
// Set active wake words
client.setVoiceAssistantConfiguration(["alexa", "hey_google"]);
```

##### subscribeToLogs()

```ts
subscribeToLogs(level, dumpConfig): void;
```

Subscribe to log messages from the ESPHome device. This enables real-time log streaming from the device for monitoring and debugging purposes.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `level` | [`LogLevel`](#loglevel) | `LogLevel.INFO` | The minimum log level to subscribe to (default: LogLevel.INFO). Messages at this level and higher severity will be received. |
| `dumpConfig` | `boolean` | `false` | Whether to request a dump of the device configuration (default: false). This provides additional configuration details in the logs. |

###### Returns

`void`

###### Example

```typescript
// Subscribe to INFO level logs and above
await client.subscribeToLogs(LogLevel.INFO);

// Subscribe to all logs including VERY_VERBOSE
await client.subscribeToLogs(LogLevel.VERY_VERBOSE);

// Subscribe to ERROR logs only with config dump
await client.subscribeToLogs(LogLevel.ERROR, true);

// Listen for log events
client.on("log", (data) => {
  console.log(`[${LogLevel[data.level]}] ${data.message}`);
});
```

##### subscribeVoiceAssistant()

```ts
subscribeVoiceAssistant(flags): void;
```

Subscribe to voice assistant events from the ESPHome device.

###### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `flags` | [`VoiceAssistantSubscribeFlag`](#voiceassistantsubscribeflag) | `VoiceAssistantSubscribeFlag.NONE` | Subscription flags (optional, defaults to NONE). |

###### Returns

`void`

###### Example

```typescript
// Subscribe to voice assistant without audio streaming
client.subscribeVoiceAssistant();

// Subscribe with audio streaming
client.subscribeVoiceAssistant(VoiceAssistantSubscribeFlag.API_AUDIO);
```

##### unsubscribeVoiceAssistant()

```ts
unsubscribeVoiceAssistant(): void;
```

Unsubscribe from voice assistant events.

###### Returns

`void`

###### Example

```typescript
client.unsubscribeVoiceAssistant();
```
