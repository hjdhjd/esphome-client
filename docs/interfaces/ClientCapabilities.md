[**esphome-client**](../README.md)

***

[Home](../README.md) / ClientCapabilities

# Interface: ClientCapabilities

Structured capability record. Consumers gate on named capabilities rather than version numbers or raw bitfields. Version-gated capabilities derive from the
`API_FEATURE_VERSIONS` table; subsystem-flag capabilities derive from `DeviceInfo` feature-flag bits.

Usage:

```ts
export async function capabilityFeatureGatingExample(client: EspHomeClient): Promise<void> {

  const caps = client.capabilities();

  // Feature: voice-assistant subscribe. The handshake sends SUBSCRIBE_VOICE_ASSISTANT_REQUEST; sending it to a device without VA support is a silent no-op on the
  // wire but a confusing dead path for the consumer. Gate it.
  if(caps.voiceAssistant.supported) {

    client.voiceAssistant.subscribe();
  }

  // Feature: noise-key rotation. Devices below the rotation gate do not understand the request; the response would be `success: false` after a wasted round-trip.
  // Gate it. The version comparison is invisible here - `caps.noiseKeyRotation` is the named fact about the device, derived once at capability construction.
  if(caps.noiseKeyRotation && (process.env["ESPHOME_NEW_PSK"] !== undefined)) {

    await client.setNoiseEncryptionKey(process.env["ESPHOME_NEW_PSK"]);
  }
}
```

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="api"></a> `api` | \{ `major`: `number`; `minor`: `number`; \} | Negotiated protocol version. `minor` comes from the negotiated `HelloResponse.api_version_minor` value. `major` is currently always 1, a synthesized constant reflecting the connect-time major-version gate performed earlier in the handshake rather than a value read from the wire at this call site. |
| `api.major` | `number` | - |
| `api.minor` | `number` | - |
| <a id="bluetoothproxy"></a> `bluetoothProxy` | \{ `activeConnections`: `boolean`; `legacyAdvertisements`: `boolean`; `rawAdvertisements`: `boolean`; `supported`: `boolean`; \} | Bluetooth proxy support details. `supported` is true when the device declares any non-zero bluetooth-proxy feature flag. **Remarks** `legacyAdvertisements` is true when the device advertises the module-private `BLUETOOTH_PROXY_FLAG.PASSIVE_SCAN` bit, which is upstream ESPHome's bit for the legacy standardized-advertisement reporting mode. Newer firmware also exposes `BLUETOOTH_PROXY_FLAG.RAW_ADVERTISEMENTS`, surfaced separately as `rawAdvertisements`. |
| `bluetoothProxy.activeConnections` | `boolean` | - |
| `bluetoothProxy.legacyAdvertisements` | `boolean` | - |
| `bluetoothProxy.rawAdvertisements` | `boolean` | - |
| `bluetoothProxy.supported` | `boolean` | - |
| <a id="clientderivedobjectid"></a> `clientDerivedObjectId` | `boolean` | The server omits `object_id` from `ListEntities*Response` for clients that advertise this version or higher, since the value is always derivable from `name` via the upstream `sanitize(snake_case(name))` algorithm. The discovery decoder mirrors that algorithm in `deriveObjectId` and resolves the field via wire-first-with-fallback: when the server sends the wire value (older firmware) we use it; when the server omits it (this version or higher) we derive. Both paths produce byte-identical canonical ids, so this flag is purely informational - consumers can read it to know which protocol generation the device speaks, but the resulting `objectId` on every entity record is the same value either way. |
| <a id="climatetemperatureunit"></a> `climateTemperatureUnit` | `boolean` | `ListEntitiesClimateResponse` and `ListEntitiesWaterHeaterResponse` carry a `temperature_unit` enum field (celsius/fahrenheit/kelvin) declaring the unit the device reports temperatures in. When false, the field is absent on the wire and consumers should treat the unit as celsius by default (ESPHome's pre-1.14 convention). |
| <a id="encryption"></a> `encryption` | \{ `active`: `boolean`; `supported`: `boolean`; \} | Encryption status. `supported` reflects what the device advertises (`api_encryption_supported`); `active` reflects whether this session is actually encrypted (the noise handshake completed). |
| `encryption.active` | `boolean` | - |
| `encryption.supported` | `boolean` | - |
| <a id="lockopenstates"></a> `lockOpenStates` | `boolean` | `LockState` enum extended with `LOCK_STATE_OPENING` (6) and `LOCK_STATE_OPEN` (7). Devices on older firmware never emit these values; consumers narrowing on the extended union can short-circuit pre-1.14 devices via this flag. |
| <a id="modernhandshake"></a> `modernHandshake` | `boolean` | Modern handshake path availability. When true, the client can skip `CONNECT_REQUEST` for unauthenticated sessions because the device's API minor supports the unified Hello/Connect exchange. |
| <a id="noisekeyrotation"></a> `noiseKeyRotation` | `boolean` | Noise pre-shared-key rotation availability. When true, `client.setNoiseEncryptionKey(...)` reaches a device that understands `NOISE_ENCRYPTION_SET_KEY_REQUEST`. |
| <a id="serialproxy"></a> `serialProxy` | \{ `count`: `number`; `supported`: `boolean`; \} | Serial-proxy support details. `supported` is true when the device advertises at least one serial-proxy instance on `DeviceInfoResponse.serial_proxies` (field 25); `count` is the number of advertised instances. `client.deviceInfo()?.serialProxies` carries only the advertised per-instance metadata (`SerialProxyInfo`'s `name` and `portType`); baud rate, data bits, and parity are write-side settings passed to `SerialProxyApi.configure()`, not values readable from device info - the structured-capability record stays focused on the per-subsystem availability question. |
| `serialProxy.count` | `number` | - |
| `serialProxy.supported` | `boolean` | - |
| <a id="voiceassistant"></a> `voiceAssistant` | \{ `announcements`: `boolean`; `apiAudio`: `boolean`; `speaker`: `boolean`; `startConversation`: `boolean`; `stereoAudio`: `boolean`; `supported`: `boolean`; `timerEvents`: `boolean`; \} | Voice-assistant support details. `supported` is true when the device declares any non-zero voice-assistant feature flag, or - on older firmware - `legacyVoiceAssistantVersion > 0`. Each per-feature boolean reflects one bit of `voice_assistant_feature_flags`; see the module-private `VOICE_ASSISTANT_FLAG` table for the bit assignments. `stereoAudio` is the one exception: it derives from the negotiated API version (see `API_FEATURE_VERSIONS.voiceAssistantStereo`) rather than a feature-flag bit, because the wire shape change is a protocol-version concern rather than a per-device feature toggle. |
| `voiceAssistant.announcements` | `boolean` | - |
| `voiceAssistant.apiAudio` | `boolean` | - |
| `voiceAssistant.speaker` | `boolean` | - |
| `voiceAssistant.startConversation` | `boolean` | - |
| `voiceAssistant.stereoAudio` | `boolean` | - |
| `voiceAssistant.supported` | `boolean` | - |
| `voiceAssistant.timerEvents` | `boolean` | - |
| <a id="zwaveproxy"></a> `zwaveProxy` | \{ `featureFlags`: `number`; `homeId`: `number` \| `null`; `supported`: `boolean`; \} | Z-Wave-proxy support details. `supported` is true when the device advertises a nonzero `zwave_proxy_feature_flags` bitmask (field 23); `featureFlags` exposes that bitmask verbatim for forward compatibility with future ESPHome feature bits. `homeId` mirrors `DeviceInfoResponse.zwave_home_id` (field 24), normalised so a value of `0` (no Z-Wave network joined) surfaces as `null`; absent device-info field 24 also surfaces as `null`. The runtime-authoritative home id - updated by inbound `HOME_ID_CHANGE` request pushes - is read via [ZWaveProxyApi.homeId](../classes/ZWaveProxyApi.md#homeid); this record carries the snapshot observed at the most recent connect. |
| `zwaveProxy.featureFlags` | `number` | - |
| `zwaveProxy.homeId` | `number` \| `null` | - |
| `zwaveProxy.supported` | `boolean` | - |
