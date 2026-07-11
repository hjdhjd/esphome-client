[**esphome-client**](../README.md)

***

[Home](../README.md) / DeviceInfo

# Interface: DeviceInfo

Device information received from the ESPHome device. This structure contains all metadata about the connected ESPHome device.

## Properties

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
| <a id="name"></a> `name?` | `string` | The name of the node, given by "App.set_name()" (field 2). |
| <a id="projectname"></a> `projectName?` | `string` | The ESPHome project name if set (field 8). |
| <a id="projectversion"></a> `projectVersion?` | `string` | The ESPHome project version if set (field 9). |
| <a id="serialproxies"></a> `serialProxies?` | readonly [`SerialProxyInfo`](SerialProxyInfo.md)[] | Per-instance metadata for every serial-proxy port advertised by the device (field 25). Empty (or absent) when the device firmware was not compiled with `USE_SERIAL_PROXY`; otherwise the array index is the `instance` number used in every subsequent serial-proxy wire message. |
| <a id="suggestedarea"></a> `suggestedArea?` | `string` | Suggested area for the device (field 16). |
| <a id="usespassword"></a> `usesPassword?` | `boolean` | Whether the device uses password authentication (field 1). |
| <a id="voiceassistantfeatureflags"></a> `voiceAssistantFeatureFlags?` | `number` | Voice assistant feature flags (field 17). |
| <a id="webserverport"></a> `webserverPort?` | `number` | Port number of the web server if enabled (field 10). |
| <a id="zwavehomeid"></a> `zwaveHomeId?` | `number` | Z-Wave home id reported by the device's Z-Wave radio (field 24). Zero indicates no Z-Wave network is currently joined; absent indicates the device firmware does not include the Z-Wave proxy component. The value is updated over the wire via `HOME_ID_CHANGE` request pushes and re-surfaced via [ZWaveProxyApi.homeId](../classes/ZWaveProxyApi.md#homeid). |
| <a id="zwaveproxyfeatureflags"></a> `zwaveProxyFeatureFlags?` | `number` | Z-Wave-proxy feature-flags bitmask (field 23). Nonzero indicates the device firmware was compiled with `USE_ZWAVE_PROXY` and is advertising the Z-Wave Serial-API byte-pipe surface; absent or zero indicates Z-Wave proxy is unavailable on this device. See [ZWaveProxyApi](../classes/ZWaveProxyApi.md). |
