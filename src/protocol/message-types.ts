/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * message-types.ts: ESPHome API message type identifiers.
 */

/**
 * ESPHome API message type identifiers for protocol communication.
 *
 * @module protocol/message-types
 */

/**
 * Identifiers for ESPHome API messages. Values match each message's `option (id) = N;` (message-type id) declared in the upstream `api.proto` specification.
 *
 * @remarks Implemented as an `as const` object plus a derived literal-union type, the modern replacement for `enum`, compatible with TypeScript's `erasableSyntaxOnly`
 * mode and with build pipelines that strip types at compile time. The forward map (name -> number) is the SSOT; the reverse map (number -> name) is derived from the
 * same object via {@link messageTypeName} so that adding a new entry extends both directions automatically with no parallel hand-maintained structure. Keys are
 * alphabetized to match house lint rules; the canonical protocol ordering by numeric id lives in `src/api.proto`.
 *
 * `CONNECT_REQUEST/RESPONSE` and `AUTHENTICATION_REQUEST/RESPONSE` deliberately share IDs 3 and 4. Ids 3 and 4 originally addressed `AuthenticationRequest`/
 * `AuthenticationResponse`, which upstream `api.proto` now marks deprecated - password authentication is no longer supported and the server does not process
 * those messages. This client always speaks to those ids through the `CONNECT_REQUEST`/`CONNECT_RESPONSE` alias in its legacy pre-1.11 handshake; the
 * `AUTHENTICATION_*` names are kept only so the deprecated ids remain discoverable by name, not because any call site branches between the two aliases.
 *
 * @internal
 */
export const MessageType = {

  ALARM_CONTROL_PANEL_COMMAND_REQUEST:           96,
  ALARM_CONTROL_PANEL_STATE_RESPONSE:            95,
  AUTHENTICATION_REQUEST:                        3,
  AUTHENTICATION_RESPONSE:                       4,
  BINARY_SENSOR_STATE_RESPONSE:                  21,
  BLUETOOTH_CONNECTIONS_FREE_RESPONSE:           81,
  BLUETOOTH_DEVICE_CLEAR_CACHE_RESPONSE:         88,
  BLUETOOTH_DEVICE_CONNECTION_RESPONSE:          69,
  BLUETOOTH_DEVICE_PAIRING_RESPONSE:             85,
  BLUETOOTH_DEVICE_REQUEST:                      68,
  BLUETOOTH_DEVICE_UNPAIRING_RESPONSE:           86,
  BLUETOOTH_GATT_ERROR_RESPONSE:                 82,
  BLUETOOTH_GATT_GET_SERVICES_DONE_RESPONSE:     72,
  BLUETOOTH_GATT_GET_SERVICES_REQUEST:           70,
  BLUETOOTH_GATT_GET_SERVICES_RESPONSE:          71,
  BLUETOOTH_GATT_NOTIFY_DATA_RESPONSE:           79,
  BLUETOOTH_GATT_NOTIFY_REQUEST:                 78,
  BLUETOOTH_GATT_NOTIFY_RESPONSE:                84,
  BLUETOOTH_GATT_READ_DESCRIPTOR_REQUEST:        76,
  BLUETOOTH_GATT_READ_REQUEST:                   73,
  BLUETOOTH_GATT_READ_RESPONSE:                  74,
  BLUETOOTH_GATT_WRITE_DESCRIPTOR_REQUEST:       77,
  BLUETOOTH_GATT_WRITE_REQUEST:                  75,
  BLUETOOTH_GATT_WRITE_RESPONSE:                 83,
  BLUETOOTH_LE_RAW_ADVERTISEMENTS_RESPONSE:      93,
  BLUETOOTH_SCANNER_SET_MODE_REQUEST:            127,
  BLUETOOTH_SCANNER_STATE_RESPONSE:              126,
  BLUETOOTH_SET_CONNECTION_PARAMS_REQUEST:       145,
  BLUETOOTH_SET_CONNECTION_PARAMS_RESPONSE:      146,
  BUTTON_COMMAND_REQUEST:                        62,
  CAMERA_IMAGE_REQUEST:                          45,
  CAMERA_IMAGE_RESPONSE:                         44,
  CLIMATE_COMMAND_REQUEST:                       48,
  CLIMATE_STATE_RESPONSE:                        47,
  CONNECT_REQUEST:                               3,
  CONNECT_RESPONSE:                              4,
  COVER_COMMAND_REQUEST:                         30,
  COVER_STATE_RESPONSE:                          22,
  DATETIME_COMMAND_REQUEST:                      114,
  DATETIME_STATE_RESPONSE:                       113,
  DATE_COMMAND_REQUEST:                          102,
  DATE_STATE_RESPONSE:                           101,
  DEVICE_INFO_REQUEST:                           9,
  DEVICE_INFO_RESPONSE:                          10,
  DISCONNECT_REQUEST:                            5,
  DISCONNECT_RESPONSE:                           6,
  EVENT_RESPONSE:                                108,
  EXECUTE_SERVICE_REQUEST:                       42,
  EXECUTE_SERVICE_RESPONSE:                      131,
  FAN_COMMAND_REQUEST:                           31,
  FAN_STATE_RESPONSE:                            23,
  GET_TIME_REQUEST:                              36,
  GET_TIME_RESPONSE:                             37,
  HELLO_REQUEST:                                 1,
  HELLO_RESPONSE:                                2,
  HOMEASSISTANT_ACTION_RESPONSE:                 130,
  HOMEASSISTANT_SERVICE_RESPONSE:                35,
  HOME_ASSISTANT_STATE_RESPONSE:                 40,
  INFRARED_RF_RECEIVE_EVENT:                     137,
  INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST:      136,
  LIGHT_COMMAND_REQUEST:                         32,
  LIGHT_STATE_RESPONSE:                          24,
  LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE:    94,
  LIST_ENTITIES_BINARY_SENSOR_RESPONSE:          12,
  LIST_ENTITIES_BUTTON_RESPONSE:                 61,
  LIST_ENTITIES_CAMERA_RESPONSE:                 43,
  LIST_ENTITIES_CLIMATE_RESPONSE:                46,
  LIST_ENTITIES_COVER_RESPONSE:                  13,
  LIST_ENTITIES_DATETIME_RESPONSE:               112,
  LIST_ENTITIES_DATE_RESPONSE:                   100,
  LIST_ENTITIES_DONE_RESPONSE:                   19,
  LIST_ENTITIES_EVENT_RESPONSE:                  107,
  LIST_ENTITIES_FAN_RESPONSE:                    14,
  LIST_ENTITIES_INFRARED_RESPONSE:               135,
  LIST_ENTITIES_LIGHT_RESPONSE:                  15,
  LIST_ENTITIES_LOCK_RESPONSE:                   58,
  LIST_ENTITIES_MEDIA_PLAYER_RESPONSE:           63,
  LIST_ENTITIES_NUMBER_RESPONSE:                 49,
  LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE:        148,
  LIST_ENTITIES_REQUEST:                         11,
  LIST_ENTITIES_SELECT_RESPONSE:                 52,
  LIST_ENTITIES_SENSOR_RESPONSE:                 16,
  LIST_ENTITIES_SERVICES_RESPONSE:               41,
  LIST_ENTITIES_SIREN_RESPONSE:                  55,
  LIST_ENTITIES_SWITCH_RESPONSE:                 17,
  LIST_ENTITIES_TEXT_RESPONSE:                   97,
  LIST_ENTITIES_TEXT_SENSOR_RESPONSE:            18,
  LIST_ENTITIES_TIME_RESPONSE:                   103,
  LIST_ENTITIES_UPDATE_RESPONSE:                 116,
  LIST_ENTITIES_VALVE_RESPONSE:                  109,
  LIST_ENTITIES_WATER_HEATER_RESPONSE:           132,
  LOCK_COMMAND_REQUEST:                          60,
  LOCK_STATE_RESPONSE:                           59,
  MEDIA_PLAYER_COMMAND_REQUEST:                  65,
  MEDIA_PLAYER_STATE_RESPONSE:                   64,
  NOISE_ENCRYPTION_SET_KEY_REQUEST:              124,
  NOISE_ENCRYPTION_SET_KEY_RESPONSE:             125,
  NUMBER_COMMAND_REQUEST:                        51,
  NUMBER_STATE_RESPONSE:                         50,
  PING_REQUEST:                                  7,
  PING_RESPONSE:                                 8,
  SELECT_COMMAND_REQUEST:                        54,
  SELECT_STATE_RESPONSE:                         53,
  SENSOR_STATE_RESPONSE:                         25,
  SERIAL_PROXY_CONFIGURE_REQUEST:                138,
  SERIAL_PROXY_DATA_RECEIVED:                    139,
  SERIAL_PROXY_GET_MODEM_PINS_REQUEST:           142,
  SERIAL_PROXY_GET_MODEM_PINS_RESPONSE:          143,
  SERIAL_PROXY_REQUEST:                          144,
  SERIAL_PROXY_REQUEST_RESPONSE:                 147,
  SERIAL_PROXY_SET_MODEM_PINS_REQUEST:           141,
  SERIAL_PROXY_WRITE_REQUEST:                    140,
  SIREN_COMMAND_REQUEST:                         57,
  SIREN_STATE_RESPONSE:                          56,
  SUBSCRIBE_BLUETOOTH_CONNECTIONS_FREE_REQUEST:  80,
  SUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST: 66,
  SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST:      34,
  SUBSCRIBE_HOME_ASSISTANT_STATES_REQUEST:       38,
  SUBSCRIBE_HOME_ASSISTANT_STATE_RESPONSE:       39,
  SUBSCRIBE_LOGS_REQUEST:                        28,
  SUBSCRIBE_LOGS_RESPONSE:                       29,
  SUBSCRIBE_STATES_REQUEST:                      20,
  SUBSCRIBE_VOICE_ASSISTANT_REQUEST:             89,
  SWITCH_COMMAND_REQUEST:                        33,
  SWITCH_STATE_RESPONSE:                         26,
  TEXT_COMMAND_REQUEST:                          99,
  TEXT_SENSOR_STATE_RESPONSE:                    27,
  TEXT_STATE_RESPONSE:                           98,
  TIME_COMMAND_REQUEST:                          105,
  TIME_STATE_RESPONSE:                           104,
  UNSUBSCRIBE_BLUETOOTH_LE_ADVERTISEMENTS_REQUEST: 87,
  UPDATE_COMMAND_REQUEST:                        118,
  UPDATE_STATE_RESPONSE:                         117,
  VALVE_COMMAND_REQUEST:                         111,
  VALVE_STATE_RESPONSE:                          110,
  VOICE_ASSISTANT_ANNOUNCE_FINISHED:             120,
  VOICE_ASSISTANT_ANNOUNCE_REQUEST:              119,
  VOICE_ASSISTANT_AUDIO:                         106,
  VOICE_ASSISTANT_CONFIGURATION_REQUEST:         121,
  VOICE_ASSISTANT_CONFIGURATION_RESPONSE:        122,
  VOICE_ASSISTANT_EVENT_RESPONSE:                92,
  VOICE_ASSISTANT_REQUEST:                       90,
  VOICE_ASSISTANT_RESPONSE:                      91,
  VOICE_ASSISTANT_SET_CONFIGURATION:             123,
  VOICE_ASSISTANT_TIMER_EVENT_RESPONSE:          115,
  WATER_HEATER_COMMAND_REQUEST:                  134,
  WATER_HEATER_STATE_RESPONSE:                   133,
  ZWAVE_PROXY_FRAME:                             128,
  ZWAVE_PROXY_REQUEST:                           129
} as const;

/**
 * @internal
 */
export type MessageType = typeof MessageType[keyof typeof MessageType];

// Reverse map (number -> name) derived from the same SSOT object. We compute it once at module init via Object.entries; adding a new entry to the forward map extends
// the reverse map automatically with no parallel hand-maintained structure. Because the forward map has aliased entries (CONNECT_REQUEST and AUTHENTICATION_REQUEST
// share id 3, CONNECT_RESPONSE and AUTHENTICATION_RESPONSE share id 4), the reverse map preserves whichever name is encountered last in the iteration; this is fine
// because the reverse lookup is used for diagnostic logging and metric tags where either alias is meaningful.
const MESSAGE_TYPE_NAMES = new Map<number, string>(Object.entries(MessageType).map(([ name, id ]) => [ id, name ]));

/**
 * Resolve a numeric message type id back to its canonical name. Used by metrics tags and diagnostic logging where the human-readable name carries more information
 * than the numeric id. Falls back to a stable `Unknown(<id>)` placeholder when the id is outside the known set so consumers never see `undefined`.
 *
 * @remarks `discovery.ts`'s `getEntityTypeLabel` is a consumer beyond diagnostics: it parses the returned canonical name programmatically, stripping
 * the `LIST_ENTITIES_` prefix and `_RESPONSE`/`_STATE` suffix, to derive the entity-type tag used both to select the schema during discovery and to
 * resolve entity type for telemetry fallback paths. That coupling means the naming convention here is part of the entity-type derivation contract, not purely
 * cosmetic.
 *
 * @param type - Numeric message type id.
 * @returns The canonical name from {@link MessageType}, or `"Unknown(<id>)"` for unrecognized ids.
 * @internal
 */
export function messageTypeName(type: number): string {

  return MESSAGE_TYPE_NAMES.get(type) ?? ("Unknown(" + String(type) + ")");
}
