[**esphome-client**](../README.md)

***

[Home](../README.md) / DeviceInfo

# Interface: DeviceInfo

Device information received from the ESPHome device. This structure contains all metadata about the connected ESPHome device.

## Remarks

The client hands out one frozen record per `DeviceInfoResponse`: [EspHomeClient.deviceInfo](../classes/EspHomeClient.md#deviceinfo) and the `deviceInfo` event carry the same object, and a
later response replaces it whole rather than mutating it.

## Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="apiencryptionsupported"></a> `apiEncryptionSupported?` | `readonly` | `boolean` | Whether the device supports API encryption (field 19). |
| <a id="bluetoothmacaddress"></a> `bluetoothMacAddress?` | `readonly` | `string` | The Bluetooth MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 18). |
| <a id="bluetoothproxyfeatureflags"></a> `bluetoothProxyFeatureFlags?` | `readonly` | `number` | Bluetooth proxy feature flags (field 15). |
| <a id="compilationtime"></a> `compilationTime?` | `readonly` | `string` | The date of compilation (field 5). |
| <a id="esphomeversion"></a> `esphomeVersion?` | `readonly` | `string` | A string describing the ESPHome version (field 4). |
| <a id="friendlyname"></a> `friendlyName?` | `readonly` | `string` | User-friendly name of the device (field 13). |
| <a id="hasdeepsleep"></a> `hasDeepSleep?` | `readonly` | `boolean` | Whether the device has deep sleep configured (field 7). |
| <a id="legacybluetoothproxyversion"></a> `legacyBluetoothProxyVersion?` | `readonly` | `number` | Legacy Bluetooth proxy version, deprecated (field 11). |
| <a id="legacyvoiceassistantversion"></a> `legacyVoiceAssistantVersion?` | `readonly` | `number` | Legacy voice assistant version, deprecated (field 14). |
| <a id="macaddress"></a> `macAddress?` | `readonly` | `string` | The MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 3). |
| <a id="manufacturer"></a> `manufacturer?` | `readonly` | `string` | The manufacturer of the device (field 12). |
| <a id="model"></a> `model?` | `readonly` | `string` | The model of the board (e.g., NodeMCU) (field 6). |
| <a id="name"></a> `name?` | `readonly` | `string` | The name of the node, given by "App.set_name()" (field 2). |
| <a id="projectname"></a> `projectName?` | `readonly` | `string` | The ESPHome project name if set (field 8). |
| <a id="projectversion"></a> `projectVersion?` | `readonly` | `string` | The ESPHome project version if set (field 9). |
| <a id="serialproxies"></a> `serialProxies?` | `readonly` | readonly [`SerialProxyInfo`](SerialProxyInfo.md)[] | Per-instance metadata for every serial-proxy port advertised by the device (field 25). Empty (or absent) when the device firmware was not compiled with `USE_SERIAL_PROXY`; otherwise the array index is the `instance` number used in every subsequent serial-proxy wire message. |
| <a id="suggestedarea"></a> `suggestedArea?` | `readonly` | `string` | Suggested area for the device (field 16). |
| <a id="usespassword"></a> `usesPassword?` | `readonly` | `boolean` | Whether the device uses password authentication (field 1). |
| <a id="voiceassistantfeatureflags"></a> `voiceAssistantFeatureFlags?` | `readonly` | `number` | Voice assistant feature flags (field 17). |
| <a id="webserverport"></a> `webserverPort?` | `readonly` | `number` | Port number of the web server if enabled (field 10). |
| <a id="zwavehomeid"></a> `zwaveHomeId?` | `readonly` | `number` | Z-Wave home id reported by the device's Z-Wave radio (field 24). Zero indicates no Z-Wave network is currently joined; absent indicates the device firmware does not include the Z-Wave proxy component. The value is updated over the wire via `HOME_ID_CHANGE` request pushes and re-surfaced via [ZWaveProxyApi.homeId](ZWaveProxyApi.md#homeid). |
| <a id="zwaveproxyfeatureflags"></a> `zwaveProxyFeatureFlags?` | `readonly` | `number` | Z-Wave-proxy feature-flags bitmask (field 23). Nonzero indicates the device firmware was compiled with `USE_ZWAVE_PROXY` and is advertising the Z-Wave Serial-API byte-pipe surface; absent or zero indicates Z-Wave proxy is unavailable on this device. See [ZWaveProxyApi](ZWaveProxyApi.md). |
