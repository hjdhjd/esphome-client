/* Copyright(C) 2017-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * esphome-client.ts: ESPHome native API client with Noise encryption support.
 */
import type { EspHomeLogging, Nullable } from "./types.js";
import { type HandshakeState, createESPHomeHandshake } from "./crypto-noise.js";
import { type Socket, createConnection } from "node:net";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";

// Define the minimum frame header size for message validation.
const MIN_FRAME_SIZE = 3;

// Define the fixed32 field size in bytes.
const FIXED32_SIZE = 4;

// Define the Noise handshake states.
enum Handshake {

  HELLO = 1,
  HANDSHAKE = 2,
  READY = 3,
  CLOSED = 4
}

// Connection states for adaptive encryption detection. When a PSK is provided, we try encryption first before falling back to attempting a plaintext connection.
// Without a PSK, we only attempt a plaintext connection.
enum ConnectionState {

  INITIAL           = 0,
  TRYING_PLAINTEXT  = 1,
  TRYING_NOISE      = 2,
  CONNECTED         = 3,
  FAILED            = 4
}

// Protocols that the ESPHome API supports.
enum ProtocolType {

  PLAINTEXT         = 0x00,
  NOISE             = 0x01
}

/**
 * We support a subset of the ESPHome API message types currently. These message types define the protocol communication between the client and the ESPHome device.
 */
enum MessageType {

  HELLO_REQUEST                          = 1,
  HELLO_RESPONSE                         = 2,
  CONNECT_REQUEST                        = 3,
  CONNECT_RESPONSE                       = 4,
  DISCONNECT_REQUEST                     = 5,
  DISCONNECT_RESPONSE                    = 6,
  PING_REQUEST                           = 7,
  PING_RESPONSE                          = 8,
  DEVICE_INFO_REQUEST                    = 9,
  DEVICE_INFO_RESPONSE                   = 10,
  LIST_ENTITIES_REQUEST                  = 11,
  LIST_ENTITIES_BINARY_SENSOR_RESPONSE   = 12,
  LIST_ENTITIES_COVER_RESPONSE           = 13,
  LIST_ENTITIES_LIGHT_RESPONSE           = 15,
  LIST_ENTITIES_SENSOR_RESPONSE          = 16,
  LIST_ENTITIES_SWITCH_RESPONSE          = 17,
  LIST_ENTITIES_TEXT_SENSOR_RESPONSE     = 18,
  LIST_ENTITIES_DONE_RESPONSE            = 19,
  SUBSCRIBE_STATES_REQUEST               = 20,
  BINARY_SENSOR_STATE                    = 21,
  COVER_STATE                            = 22,
  LIGHT_STATE                            = 24,
  SENSOR_STATE                           = 25,
  SWITCH_STATE                           = 26,
  TEXT_SENSOR_STATE                      = 27,
  COVER_COMMAND_REQUEST                  = 30,
  FAN_COMMAND_REQUEST                    = 31,
  LIGHT_COMMAND_REQUEST                  = 32,
  SWITCH_COMMAND_REQUEST                 = 33,
  GET_TIME_REQUEST                       = 36,
  GET_TIME_RESPONSE                      = 37,
  LIST_ENTITIES_SERVICES_RESPONSE        = 41,
  LIST_ENTITIES_NUMBER_RESPONSE          = 49,
  NUMBER_STATE                           = 50,
  LIST_ENTITIES_LOCK_RESPONSE            = 58,
  LOCK_STATE                             = 59,
  LOCK_COMMAND_REQUEST                   = 60,
  LIST_ENTITIES_BUTTON_RESPONSE          = 61,
  BUTTON_COMMAND_REQUEST                 = 62
}

/**
 * Define the valid types that a decoded ESPHome field value can have. Field values can be either raw bytes in a Buffer or numeric values.
 */
type FieldValue = Buffer | number;

/**
 * Wire types used in protobuf encoding. These define how data is encoded on the wire in the protocol buffer format.
 */
enum WireType {

  VARINT = 0,
  FIXED64 = 1,
  LENGTH_DELIMITED = 2,
  FIXED32 = 5
}

/**
 * Represents one entity from the ESPHome device. An entity is any controllable or observable component on the device.
 *
 * @property key - The numeric key identifier for the entity.
 * @property name - The human-readable name of the entity.
 * @property type - The type of entity (e.g., "switch", "light", "cover").
 */
interface Entity {

  key: number;
  name: string;
  type: string;
}

/**
 * Represents a protobuf field with tag and wire type. This is used when encoding messages to send to the ESPHome device.
 *
 * @property fieldNumber - The field number in the protobuf message.
 * @property wireType - The wire type for encoding the field.
 * @property value - The field value (number or Buffer).
 */
interface ProtoField {

  fieldNumber: number;
  wireType: WireType;
  value: number | Buffer;
}

/**
 * Device information to send when requested by the ESPHome device. This structure contains metadata about the connected ESPHome device.
 *
 * @property bluetoothProxyFeatureFlags - Bluetooth proxy feature flags.
 * @property compilationTime - When the client was compiled/started.
 * @property esphomeVersion - Version of ESPHome protocol being used.
 * @property hasDeepSleep - Whether the client supports deep sleep.
 * @property legacyBluetoothProxyVersion - Legacy Bluetooth proxy version.
 * @property macAddress - MAC address of the client (format: "AA:BB:CC:DD:EE:FF").
 * @property model - Model or type of the client.
 * @property name - Friendly name of the client.
 * @property projectName - Name of the project/plugin.
 * @property projectVersion - Version of the project/plugin.
 * @property usesPassword - Whether the client uses password authentication.
 * @property webserverPort - Port number of any web server.
 */
export interface DeviceInfo {

  bluetoothProxyFeatureFlags?: number;
  compilationTime?: string;
  esphomeVersion?: string;
  hasDeepSleep?: boolean;
  legacyBluetoothProxyVersion?: number;
  macAddress?: string;
  model?: string;
  name?: string;
  projectName?: string;
  projectVersion?: string;
  usesPassword?: boolean;
  webserverPort?: number;
}

/**
 * Message event data. This structure is emitted with the 'message' event for raw protocol messages.
 */
interface MessageEventData {

  type: number;
  payload: Buffer;
}

/**
 * Telemetry data emitted by the client. This is the base structure for all telemetry events from entities.
 */
interface TelemetryData {

  entity: string;
  type: string;
  value: number | string | undefined;
}

/**
 * Cover state telemetry data with additional fields. Cover entities have more complex state than simple on/off entities.
 */
interface CoverTelemetryData extends Omit<TelemetryData, "value"> {

  currentOperation?: number;
  deviceId?: number;
  legacyState?: number;
  position?: number | string;
  tilt?: number | string;
  value?: number | string | undefined;
}


/**
 * Configuration options for creating an ESPHome client instance. These options control how the client connects to and communicates with ESPHome devices.
 *
 * @property clientId - Optional client identifier to announce when connecting (default: "esphome-client").
 * @property host - The hostname or IP address of the ESPHome device.
 * @property logger - Optional logging interface for debug and error messages.
 * @property port - The port number for the ESPHome API (default: 6053).
 * @property psk - Optional base64 encoded pre-shared key for Noise encryption.
 * @property serverName - Optional expected server name for validation during encrypted connections.
 */
export interface EspHomeClientOptions {

  clientId?: Nullable<string>;
  host: string;
  logger?: EspHomeLogging;
  port?: number;
  psk?: Nullable<string>;
  serverName?: Nullable<string>;
}

/**
 * ESPHome API client for communicating with ESPHome devices.
 * Implements the ESPHome native API protocol over TCP with optional Noise encryption.
 *
 * This client automatically handles encryption based on the presence of a pre-shared key (PSK). When a PSK is provided, the client will attempt an encrypted connection
 * first and fall back to plaintext if the device doesn't support encryption. Without a PSK, only plaintext connections are attempted.
 *
 * @extends EventEmitter
 * @emits connect - Connected to device with encryption status (boolean).
 * @emits disconnect - Disconnected from device with optional reason string.
 * @emits message - Raw message received with type and payload in MessageEventData format.
 * @emits entities - List of discovered entities after enumeration completes.
 * @emits telemetry - Generic telemetry update for any entity with TelemetryData.
 * @emits heartbeat - Heartbeat response received (ping/pong).
 * @emits time - Time response received with epoch seconds as number.
 * @emits deviceInfo - Device information received with DeviceInfo and encryption status.
 * @emits {entityType} - Type-specific telemetry events (e.g., "cover", "light", "switch", "binary_sensor", "sensor", "text_sensor", "number", "lock").
 *
 * @example
 * ```typescript
 * // Create a client without encryption for devices that don't require it.
 * const client = new EspHomeClient({
 *   host: "192.168.1.100",
 *   logger: log
 * });
 * client.connect();
 *
 * // Create a client with encryption - will try encrypted first, then plaintext.
 * const encryptedClient = new EspHomeClient({
 *   host: "192.168.1.100",
 *   port: 6053,
 *   psk: "base64encodedkey",
 *   logger: log
 * });
 * encryptedClient.connect();
 *
 * // Create a client with custom client ID and server name validation.
 * const customClient = new EspHomeClient({
 *   host: "192.168.1.100",
 *   clientId: "my-custom-client",
 *   serverName: "garage-controller",
 *   psk: "base64encodedkey",
 *   logger: log
 * });
 * customClient.connect();
 *
 * // Listen for connection events to know when the device is ready.
 * client.on("connect", (usingEncryption) => {
 *   console.log(`Connected ${usingEncryption ? 'with' : 'without'} encryption`);
 * });
 *
 * // Listen for discovered entities to see what's available.
 * client.on("entities", (entities) => {
 *   // Log all available entity IDs for reference.
 *   client.logAllEntityIds();
 * });
 *
 * // Send commands using entity IDs once entities are discovered.
 * await client.sendSwitchCommand("switch-garagedoor", true);
 * await client.sendLightCommand("light-light", { state: true, brightness: 0.8 });
 * await client.sendCoverCommand("cover-door", { command: "open" });
 * ```
 */
export class EspHomeClient extends EventEmitter {

  // The client information string to announce when we connect to an ESPHome device.
  private clientId: string;

  // The TCP socket connection to the ESPHome device.
  private clientSocket: Nullable<Socket>;

  // The data event listener function reference for cleanup.
  private dataListener: Nullable<(chunk: Buffer) => void>;

  // The hostname or IP address of the ESPHome device.
  private host: string;

  // Logging interface for debug and error messages.
  private log: EspHomeLogging;

  // The port number for the ESPHome API connection.
  private port: number;

  // Buffer for accumulating incoming data until complete messages are received.
  private recvBuffer: Buffer;

  // Device information received from the ESPHome device.
  private remoteDeviceInfo: Nullable<DeviceInfo>;

  // Array storing all discovered entities from the device.
  private discoveredEntities: Entity[];

  // Map from entity identifier strings to their numeric keys.
  private entityKeys: Map<string, number>;

  // Map from entity keys to their human-readable names.
  private entityNames: Map<number, string>;

  // Map from entity keys to their type labels.
  private entityTypes: Map<number, string>;

  // The pre-shared key for Noise encryption (base64 encoded).
  private encryptionKey: Nullable<string>;

  // The expected server name for validation (optional).
  private expectedServerName: Nullable<string>;

  // Noise handshake client instance.
  private noiseClient: Nullable<HandshakeState>;

  // Current handshake state.
  private handshakeState: number;

  // Connection state for adaptive encryption detection.
  private connectionState: number;

  // Timer for connection timeout.
  private connectionTimer: Nullable<NodeJS.Timeout>;

  // Flag to track if we're using encryption for this connection.
  private usingEncryption: boolean;

  /**
   * Creates a new ESPHome client instance. The client can be configured for both encrypted and unencrypted connections depending on the provided options. When a PSK
   * is provided, the client will automatically attempt encryption first and fall back to plaintext if the device doesn't support it.
   *
   * @param options - Configuration options for the client connection.
   * @param options.clientId - Optional client identifier to announce when connecting (default: "esphome-client").
   * @param options.host - The hostname or IP address of the ESPHome device.
   * @param options.logger - Optional logging interface for debug and error messages. If not provided, defaults to console methods.
   * @param options.port - The port number for the ESPHome API (default: 6053).
   * @param options.psk - Optional base64 encoded pre-shared key for Noise encryption. Must be exactly 32 bytes when decoded.
   * @param options.serverName - Optional expected server name for validation during encrypted connections.
   *
   * @example
   * ```typescript
   * // Minimal configuration for unencrypted connection.
   * const client = new EspHomeClient({ host: "192.168.1.100" });
   *
   * // Full configuration with all options except serverName.
   * const client = new EspHomeClient({
   *   host: "192.168.1.100",
   *   port: 6053,
   *   clientId: "homebridge-ratgdo",
   *   psk: "base64encodedkey",
   *   logger: myLogger
   * });
   * ```
   */
  constructor(options: EspHomeClientOptions) {

    super();

    options.logger ??= {

      /* eslint-disable no-console */
      debug: (): void => { /* No debug logging by default. */ },
      error: (message: string, ...parameters: unknown[]): void => console.error(message, ...parameters),
      info: (message: string, ...parameters: unknown[]): void => console.log(message, ...parameters),
      warn: (message: string, ...parameters: unknown[]): void => console.log(message, ...parameters)
      /* eslint-enable no-console */
    };

    this.clientId = options.clientId ?? "esphome-client";
    this.clientSocket = null;
    this.dataListener = null;
    this.discoveredEntities = [];
    this.entityKeys = new Map<string, number>();
    this.entityNames = new Map<number, string>();
    this.entityTypes = new Map<number, string>();
    this.host = options.host;
    this.log = options.logger;
    this.port = options.port ?? 6053;
    this.recvBuffer = Buffer.alloc(0);
    this.remoteDeviceInfo = null;
    this.encryptionKey = options.psk ?? null;
    this.expectedServerName = options.serverName ?? null;
    this.noiseClient = null;
    this.handshakeState = Handshake.CLOSED;
    this.connectionState = ConnectionState.INITIAL;
    this.connectionTimer = null;
    this.usingEncryption = false;

    // Validate the encryption key format if provided.
    if(this.encryptionKey) {

      const keyBuffer = Buffer.from(this.encryptionKey, "base64");

      if(keyBuffer.length !== 32) {

        this.log.error("Invalid encryption key provided.");
        this.encryptionKey = null;
      }
    }
  }

  /**
   * Connect to the ESPHome device and start communication. This method initializes a new connection. If an encryption key is provided, it will attempt an encrypted
   * connection first and fall back to plaintext if the device doesn't support encryption. Without an encryption key, only plaintext connections are attempted.
   */
  public connect(): void {

    // Clean up any existing connections and resources before starting fresh.
    if(this.clientSocket) {

      this.clientSocket.destroy();
      this.clientSocket = null;
    }

    this.cleanupNoiseResources();
    this.cleanupDataListener();
    this.clearConnectionTimer();

    // Reset buffer state to ensure clean message processing.
    this.recvBuffer = Buffer.alloc(0);

    // Reset entity discovery state for the new connection.
    this.discoveredEntities = [];
    this.entityKeys.clear();
    this.entityNames.clear();
    this.entityTypes.clear();
    this.remoteDeviceInfo = null;

    // Reset the handshake state for a fresh connection.
    this.handshakeState = Handshake.CLOSED;
    this.noiseClient = null;
    this.connectionState = ConnectionState.INITIAL;
    this.usingEncryption = false;

    // Create the initial connection.
    this.createConnection();
  }

  /**
   * Create a new TCP connection to the ESPHome device. This is a separate method to allow reconnection with different protocols when falling back from encrypted to
   * plaintext connections.
   */
  private createConnection(): void {

    // Create a new TCP connection to the ESPHome device.
    this.clientSocket = createConnection({ host: this.host, port: this.port });

    // Handle successful connection by initiating the handshake process.
    this.clientSocket.on("connect", () => this.handleConnect());

    // Set up the data handler for incoming messages.
    this.dataListener = (chunk: Buffer): void => this.handleData(chunk);
    this.clientSocket.on("data", this.dataListener);

    // Handle socket errors by logging and disconnecting.
    this.clientSocket.once("error", (err: Error) => this.handleSocketError(err as NodeJS.ErrnoException));

    // Handle socket closure by checking if we need to retry with encryption.
    this.clientSocket.once("close", () => this.handleSocketClose());
  }

  /**
   * Internal disconnect method that cleans up resources and emits the disconnect event.
   *
   * @param reason - Optional reason for the disconnection.
   */
  private _disconnect(reason?: string): void {

    // Clean up the data listener.
    this.cleanupDataListener();

    // Clean up Noise resources.
    this.cleanupNoiseResources();

    // Clear connection timer.
    this.clearConnectionTimer();

    // Destroy the socket connection.
    if(this.clientSocket) {

      this.clientSocket.destroy();
      this.clientSocket = null;
    }

    this.connectionState = ConnectionState.FAILED;
    this.emit("disconnect", reason);
  }

  /**
   * Disconnect from the ESPHome device and cleanup resources. This method should be called when you're done communicating with the device.
   */
  public disconnect(): void {

    this._disconnect();
  }

  /**
   * Clean up Noise encryption resources. This ensures we don't leak memory from the WebAssembly Noise library.
   */
  private cleanupNoiseResources(): void {

    this.noiseClient?.destroy();
    this.noiseClient = null;

    // After all resources have been cleaned up, we reset the handshake state.
    this.handshakeState = Handshake.CLOSED;
  }

  /**
   * Clear the connection timer if it exists. This prevents timeout callbacks from firing after they're no longer needed.
   */
  private clearConnectionTimer(): void {

    if(this.connectionTimer) {

      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  }

  /**
   * Set a connection timer for timeout detection. This helps detect when a connection attempt has stalled.
   *
   * @param timeout - Timeout duration in milliseconds (default: 5000).
   */
  private setConnectionTimer(timeout: number = 5000): void {

    this.clearConnectionTimer();

    this.connectionTimer = setTimeout(() => this.handleConnectionTimeout, timeout);
  }

  /**
   * Handle connection timeout based on the current connection state. This method determines what to do when a connection attempt times out.
   */
  private handleConnectionTimeout(): void {

    this.log.debug("Connection attempt timed out in state: " + this.connectionState);

    switch(this.connectionState) {

      case ConnectionState.TRYING_NOISE:

        // Noise encryption handshake timed out. This could mean the device doesn't support encryption, so we try plaintext as a fallback.
        this.log.debug("Noise encryption handshake timed out. The device may not support encryption. Trying plaintext connection.");

        // Close the current connection and try again with plaintext.
        this.cleanupDataListener();
        this.cleanupNoiseResources();

        if(this.clientSocket) {

          this.clientSocket.destroy();
          this.clientSocket = null;
        }

        // Reset the buffer and set state for plaintext connection.
        this.recvBuffer = Buffer.alloc(0);
        this.connectionState = ConnectionState.TRYING_PLAINTEXT;
        this.usingEncryption = false;

        // Create a new connection for plaintext protocol.
        this.createConnection();

        break;

      case ConnectionState.TRYING_PLAINTEXT:

        // Plaintext connection attempt timed out. If we started with encryption and fell back to plaintext, this means the device is not responding. If we started with
        // plaintext because no PSK was provided, the device might still require encryption.
        if(this.encryptionKey && this.noiseClient) {

          // We have an encryption key but haven't tried it yet (only possible if we started without PSK).
          this.log.error("Connection failed. The device is not responding to connection attempts.");

        } else {

          // No encryption key is available, and plaintext failed.
          this.log.error("Connection failed. The device is not responding or may require encryption.");
        }

        this._disconnect("connection timeout");

        break;

      default:

        // Unexpected timeout in an unknown state.
        this.log.error("Connection timeout in unexpected state: " + this.connectionState);
        this.disconnect();

        break;
    }
  }

  /**
   * Handle a newly connected socket. This method is called when the TCP connection is established.
   */
  private handleConnect(): void {

    this.log.debug("Connected to " + this.host + ":" + this.port + ".");

    // Defines a helper to start a plaintext connection by setting the state, initializing the connection timer, and sending the hello message.
    const startPlaintext = (): void => {

      this.connectionState = ConnectionState.TRYING_PLAINTEXT;
      this.setConnectionTimer();
      this.sendHello();
    };

    // Determine which protocol to use based on the current connection state.
    switch(this.connectionState) {

      case ConnectionState.TRYING_PLAINTEXT:

        // If we are already trying plaintext, continue the plaintext workflow.
        startPlaintext();

        break;

      case ConnectionState.TRYING_NOISE:

        // If we are already trying Noise, continue with the Noise handshake.
        this.initializeNoiseHandshake();

        break;

      default:

        // Otherwise, this is the initial attempt, so decide based on encryption availability. If an encryption key and Noise are available, attempt encrypted first.
        if(this.encryptionKey) {

          this.log.debug("Encryption key provided, attempting encrypted connection first.");
          this.connectionState = ConnectionState.TRYING_NOISE;
          this.initializeNoiseHandshake();

          break;
        }

        // If no key is available, fall back to a plaintext connection.
        startPlaintext();

        break;
    }
  }

  /**
   * Initialize the Noise handshake for encrypted connections. This sets up the Noise protocol state and sends the initial handshake message.
   */
  private initializeNoiseHandshake(): void {

    // Ensure we have the required dependencies before proceeding.
    if(!this.encryptionKey) {

      throw new Error("Missing encryption key");
    }

    // Create the Noise handshake state.
    this.noiseClient = createESPHomeHandshake({ logger: this.log, psk: Buffer.from(this.encryptionKey, "base64")});

    this.handshakeState = Handshake.HELLO;
    this.usingEncryption = true;

    // Send empty frame to start the handshake.
    this.writeNoiseFrame(Buffer.alloc(0));
    this.setConnectionTimer();
  }

  /**
   * Send a hello request to let ESPHome know who we are. This is the initial message sent to establish communication when unencrypted. When encrypted, this is sent
   * after we've established a secure connection.
   */
  private sendHello(): void {

    // Prepare the client information string for the hello message.
    const clientInfo = Buffer.from(this.clientId, "utf8");

    // Build the hello payload fields, encode, and then send the hello request.
    this.frameAndSend(MessageType.HELLO_REQUEST, this.encodeProtoFields([

      { fieldNumber: 1, value: clientInfo, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 3, value: 10, wireType: WireType.VARINT }
    ]));
  }

  /**
   * Handle socket errors by logging appropriate messages and disconnecting.
   *
   * @param err - The socket error that occurred.
   */
  private handleSocketError(err: NodeJS.ErrnoException): void {

    switch(err.code) {

      case "ECONNREFUSED":

        this.log.error("Connection refused.");

        break;

      case "ECONNRESET":

        this.log.error("Connection reset.");

        break;

      case "EHOSTDOWN":
      case "EHOSTUNREACH":

        this.log.error("Device unreachable.");

        break;

      case "ETIMEDOUT":

        this.log.error("Connection timed out.");

        break;

      default:

        this.log.error("Socket error: %s | %s", err.code, err);

        break;
    }

    this.disconnect();
  }

  /**
   * Handle socket closure. If we were trying encryption and the socket closed, it might be because the device doesn't support encryption.
   */
  private handleSocketClose(): void {

    this.log.debug("Socket closed");
    this.handshakeState = Handshake.CLOSED;

    // Check if we need to fall back based on the connection state.
    if(this.connectionState === ConnectionState.TRYING_NOISE) {

      // We were trying encryption and the socket closed. This might mean the device doesn't support encryption, so let's try plaintext.
      this.log.debug("Socket closed during encryption attempt. The device may not support encryption. Trying plaintext connection.");

      // Clean up and try again with plaintext.
      this.cleanupDataListener();
      this.cleanupNoiseResources();
      this.recvBuffer = Buffer.alloc(0);
      this.connectionState = ConnectionState.TRYING_PLAINTEXT;
      this.usingEncryption = false;

      // Create a new connection for plaintext protocol.
      this.createConnection();

      return;
    }

    // Log an issue in our fallback to plaintext connectivity.
    if(this.connectionState === ConnectionState.TRYING_PLAINTEXT && this.encryptionKey && this.noiseClient) {

      // We were trying plaintext and the socket closed. We're done.
      this.log.debug("Socket closed during plaintext attempt after encryption fallback.");
    }
  }

  /**
   * Clean up the data listener if it exists.
   */
  private cleanupDataListener(): void {

    if(this.dataListener && this.clientSocket) {

      this.clientSocket.off("data", this.dataListener);
      this.dataListener = null;
    }
  }

  /**
   * Handle incoming raw data, frame messages, and dispatch. This method accumulates data and processes complete frames.
   *
   * @param chunk - The incoming data chunk from the socket.
   */
  private handleData(chunk: Buffer): void {

    // Append the new data chunk to our receive buffer.
    this.recvBuffer = Buffer.concat([ this.recvBuffer, chunk ]);

    // Check if we need to detect encryption based on the first byte. This only happens when no PSK was provided initially.
    if(this.connectionState === ConnectionState.TRYING_PLAINTEXT && this.recvBuffer.length > 0 && !this.encryptionKey) {

      // If the first byte is 0x01, indicating we have a Noise frame. This means the server requires encryption but no key was provided.
      if(this.recvBuffer[0] === ProtocolType.NOISE) {

        this.log.debug("Detected Noise frame indicator. The server requires encryption.");

        // The server requires encryption but we don't have a key.
        this._disconnect("encryption key missing");

        return;
      }
    }

    // Sanity check.
    if(this.recvBuffer.length === 0) {

      return;
    }

    // Process frames based on whether we're using encryption, based on our indicator byte.
    const indicator = this.recvBuffer[0];

    // If server requires Noise but we have no key, bail out early.
    if((indicator === ProtocolType.NOISE) && !this.encryptionKey) {

      this.log.debug("Detected Noise frame indicator. The server requires encryption.");
      this._disconnect("encryption key missing");

      return;
    }

    if(indicator === ProtocolType.NOISE) {

      this.processNoiseFrames();

      return;
    }

    if(indicator === ProtocolType.PLAINTEXT) {

      this.processPlaintextFrames();

      return;
    }

    // Unknown sentinel: drop buffer to resync.
    this.log.error("Unknown frame indicator: 0x" + indicator.toString(16));
    this.recvBuffer = Buffer.alloc(0);
  }

  /**
   * Process Noise protocol frames. This handles the Noise handshake and encrypted message processing.
   */
  private processNoiseFrames(): void {

    let frame;
    let message;

    try {

      while((frame = this.extractNoiseFrame())) {

        switch(this.handshakeState) {

          case Handshake.HELLO:

            this.handleNoiseHello(frame);

            break;

          case Handshake.HANDSHAKE:

            this.handleNoiseHandshake(frame);

            break;

          case Handshake.READY:

            // Ensure we have a decryptor before attempting to decrypt.
            if(!this.noiseClient?.receiveCipher) {

              throw new Error("Decryptor not available");
            }

            // Decrypt and process the message.
            message = this.deserializeNoiseMessage(Buffer.from(this.noiseClient.receiveCipher.DecryptWithAd(Buffer.alloc(0), frame)));

            if(message) {

              this.handleMessage(message.type, message.payload);
            }

            break;
        }
      }
    } catch(err) {

      const isPlaintext = this.recvBuffer[0] === ProtocolType.PLAINTEXT;
      const noiseFailed = (this.connectionState === ConnectionState.TRYING_NOISE) && (this.handshakeState !== Handshake.READY);

      // If Noise was expected but failed and it's not plaintext, disconnect as encryption key is invalid.
      if(!isPlaintext && noiseFailed) {

        this._disconnect("encryption key invalid");

        return;
      }

      // If it's not plaintext and another error occurred, just log and exit.
      if(!isPlaintext) {

        this.log.error("Error processing Noise frames: " + err);

        return;
      }

      // If Noise failed but plaintext is possible, fall back to plaintext connection.
      if(noiseFailed) {

        this.log.debug("Noise handshake failed. Attempting to fall back to plaintext connection.");

        this.cleanupDataListener();
        this.cleanupNoiseResources();

        if(this.clientSocket) {

          this.clientSocket.destroy();
          this.clientSocket = null;
        }

        this.recvBuffer = Buffer.alloc(0);
        this.connectionState = ConnectionState.TRYING_PLAINTEXT;
        this.usingEncryption = false;
        this.createConnection();

        return;
      }

      // Otherwise, just disconnect.
      this.disconnect();
    }
  }

  /**
   * Extract a Noise frame from the receive buffer. Noise frames have a specific format: [0x01][size_high][size_low][data...].
   *
   * @returns The frame data or null if incomplete.
   */
  private extractNoiseFrame(): Nullable<Buffer> {

    if(this.recvBuffer.length < 3) {

      return null;
    }

    const indicator = this.recvBuffer[0];

    if(indicator !== ProtocolType.NOISE) {

      throw new Error("Bad format. Expected 0x01 indicator, got 0x" + indicator.toString(16));
    }

    // Read frame size (big-endian).
    const frameSize = (this.recvBuffer[1] << 8) | this.recvBuffer[2];
    const frameEnd = 3 + frameSize;

    if(this.recvBuffer.length < frameEnd) {

      return null;
    }

    // Extract the frame.
    const frame = this.recvBuffer.subarray(3, frameEnd);

    // Remove the processed frame from the buffer.
    this.recvBuffer = this.recvBuffer.subarray(frameEnd);

    return frame;
  }

  /**
   * Handle the Noise hello response. This processes the server's protocol selection and validates the server name if configured.
   *
   * @param serverHello - The server hello data.
   */
  private handleNoiseHello(serverHello: Buffer): void {

    const chosenProto = serverHello[0];

    if(chosenProto !== 1) {

      throw new Error("Unknown protocol selected by server: " + chosenProto);
    }

    // Validate server name if expected.
    if(this.expectedServerName) {

      const serverNameEnd = serverHello.indexOf(0, 1);

      if(serverNameEnd > 1) {

        const serverName = serverHello.subarray(1, serverNameEnd).toString();

        if(this.expectedServerName !== serverName) {

          throw new Error("Server name mismatch, expected " + this.expectedServerName + ", got " + serverName + ".");
        }
      }
    }

    // Proceed to handshake phase.
    this.handshakeState = Handshake.HANDSHAKE;

    // Send the Noise handshake message.
    if(!this.noiseClient) {

      throw new Error("Noise client not initialized.");
    }

    const handshakeMessage = this.noiseClient.writeMessage();

    this.writeNoiseFrame(Buffer.concat([ Buffer.from([0]), handshakeMessage ]));
    this.setConnectionTimer();
  }

  /**
   * Handle the Noise handshake response. This completes the Noise handshake and establishes the encrypted channel.
   *
   * @param serverHandshake - The server handshake data.
   */
  private handleNoiseHandshake(serverHandshake: Buffer): void {

    const header = serverHandshake[0];
    const message = serverHandshake.subarray(1);

    if(header !== 0) {

      throw new Error("Handshake failure: " + message.toString());
    }

    // Ensure we have a noise client before proceeding.
    if(!this.noiseClient) {

      throw new Error("Noise client not initialized");
    }

    // Process the handshake message.
    this.noiseClient.readMessage(message);

    // Update state to ready.
    this.handshakeState = Handshake.READY;
    this.connectionState = ConnectionState.CONNECTED;
    this.clearConnectionTimer();

    this.log.debug("Noise handshake complete, encryption enabled.");

    // Emit connect event with encryption status.
    this.emit("connect", this.usingEncryption);

    // Continue with our hello.
    this.sendHello();
  }

  /**
   * Write a Noise protocol frame. Frames are sent with a specific header format for the Noise protocol.
   *
   * @param frame - The frame data to send.
   */
  private writeNoiseFrame(frame: Buffer): void {

    if(!this.clientSocket || this.clientSocket.destroyed) {

      this.log.debug("Attempted to write to a closed socket.");

      return;
    }

    const frameData = frame;
    const frameLength = frameData.length;

    // Create the header: [0x01][size_high][size_low].
    const header = Buffer.from([ ProtocolType.NOISE, (frameLength >> 8) & 0xFF, frameLength & 0xFF ]);

    // Send the complete frame.
    this.clientSocket.write(Buffer.concat([ header, frameData ]));
  }

  /**
   * Serialize a message for Noise protocol. This creates the message format used within encrypted frames.
   *
   * @param type - The message type.
   * @param payload - The message payload.
   *
   * @returns The serialized message buffer.
   */
  private serializeNoiseMessage(type: MessageType, payload: Buffer): Buffer {

    const messageId = type;
    const messageLength = payload.length;

    // Create the message format: [id_high][id_low][len_high][len_low][payload].
    const buffer = Buffer.concat([ Buffer.from([ (messageId >> 8) & 0xFF, messageId & 0xFF, (messageLength >> 8) & 0xFF, messageLength & 0xFF ]), payload ]);

    return buffer;
  }

  /**
   * Deserialize a Noise protocol message. This extracts the message type and payload from the decrypted data.
   *
   * @param buffer - The buffer to deserialize.
   *
   * @returns The message type and payload, or null if invalid.
   */
  private deserializeNoiseMessage(buffer: Buffer): Nullable<{ type: number; payload: Buffer }> {

    if(buffer.length < 4) {

      return null;
    }

    const messageId = (buffer[0] << 8) | buffer[1];
    const messageLength = (buffer[2] << 8) | buffer[3];

    if(buffer.length < 4 + messageLength) {

      return null;
    }

    const payload = buffer.subarray(4, 4 + messageLength);

    return { payload, type: messageId };
  }

  /**
   * Process plaintext frames during the handshake phase. This handles unencrypted message processing for devices that don't require encryption.
   */
  private processPlaintextFrames(): void {

    while(this.recvBuffer.length >= MIN_FRAME_SIZE) {

      const indicator = this.recvBuffer[0];

      // If a Noise frame shows up here, redirect instead of erroring.
      if((indicator === ProtocolType.NOISE) && this.encryptionKey) {

        this.log.debug("Plaintext parser saw Noise indicator; redirecting to Noise processing.");
        this.processNoiseFrames();

        return;
      }

      // Verify the frame starts with the expected sentinel byte.
      if(indicator !== ProtocolType.PLAINTEXT) {

        this.log.error("Framing error: missing 0x00.");
        this.recvBuffer = Buffer.alloc(0);

        return;
      }

      // Read the message length as a varint.
      const [ length, lenBytes ] = this.readVarint(this.recvBuffer, 1);

      // Read the message type as a varint.
      const [ type, typeBytes ] = this.readVarint(this.recvBuffer, 1 + lenBytes);

      // Calculate the total header size.
      const headerSize = 1 + lenBytes + typeBytes;

      // Check if we have received the complete message payload.
      if(this.recvBuffer.length < (headerSize + length)) {

        break;
      }

      // Extract the message payload.
      const payload = this.recvBuffer.subarray(headerSize, headerSize + length);

      // Process the complete message.
      this.handleMessage(type, payload);

      // Remove the processed message from the receive buffer.
      this.recvBuffer = this.recvBuffer.subarray(headerSize + length);
    }
  }

  /**
   * Dispatch based on message type. This is the main message router that handles all protocol messages.
   *
   * @param type - The message type identifier.
   * @param payload - The message payload data.
   */
  private handleMessage(type: number, payload: Buffer): void {

    let epoch, nowBuf;

    // Emit a generic message event for all message types.
    this.emit("message", { payload, type } as MessageEventData);

    // Handle specific message types.
    switch(type) {

      case MessageType.HELLO_RESPONSE:

        this.clearConnectionTimer();

        // We got a plaintext hello response, indicate we are connected and we're done.
        if(!this.usingEncryption) {

          this.connectionState = ConnectionState.CONNECTED;
          this.usingEncryption = false;

          // Log if we have an encryption key but the device doesn't use it.
          if(this.encryptionKey) {

            this.log.debug("Device responded to plaintext hello. The device does not support encryption, using plaintext connection.");
          }
        }

        // Send the connect request to complete the protocol handshake.
        this.frameAndSend(MessageType.CONNECT_REQUEST, Buffer.alloc(0));

        break;

      case MessageType.CONNECT_RESPONSE:

        // Only emit connect for plaintext connections (Noise emits it after handshake).
        if(!this.usingEncryption) {

          this.emit("connect", this.usingEncryption);
        }

        // Query device information once we're connected.
        this.frameAndSend(MessageType.DEVICE_INFO_REQUEST, Buffer.alloc(0));

        // Start entity enumeration after successful connection.
        this.frameAndSend(MessageType.LIST_ENTITIES_REQUEST, Buffer.alloc(0));

        break;

      case MessageType.DISCONNECT_REQUEST:

        // Respond to disconnect request and then disconnect.
        this.frameAndSend(MessageType.DISCONNECT_RESPONSE, Buffer.alloc(0));

        this.disconnect();

        break;

      case MessageType.DISCONNECT_RESPONSE:

        // The device has acknowledged our disconnect request.
        this.disconnect();

        break;


      case MessageType.DEVICE_INFO_RESPONSE:

        // Process the device information response.
        this.handleDeviceInfoResponse(payload);

        // Emit the device info event with encryption status.
        this.emit("deviceInfo", this.remoteDeviceInfo, this.usingEncryption);

        break;

      case MessageType.LIST_ENTITIES_DONE_RESPONSE:

        // Entity enumeration is complete.
        // Emit the complete list of discovered entities.
        this.emit("entities", this.discoveredEntities);

        // Now that we know all the entities we have available, subscribe to state updates.
        this.frameAndSend(MessageType.SUBSCRIBE_STATES_REQUEST, Buffer.alloc(0));

        break;

      case MessageType.PING_REQUEST:

        this.log.debug("Received PingRequest, replying");

        // Respond to ping requests to keep the connection alive.
        this.frameAndSend(MessageType.PING_RESPONSE, Buffer.alloc(0));

        // Emit heartbeat event for connection monitoring.
        this.emit("heartbeat");

        break;

      case MessageType.PING_RESPONSE:

        // Emit heartbeat event for connection monitoring.
        this.emit("heartbeat");

        break;

      case MessageType.GET_TIME_REQUEST:

        // We got a time‐sync request from the device; reply with our current epoch.
        this.log.debug("Received GetTimeRequest, replying with current epoch time");

        // Prepare a four-byte little‐endian buffer.
        nowBuf = Buffer.alloc(FIXED32_SIZE);

        // Calculate our time in seconds and encode it in our buffer.
        nowBuf.writeUInt32LE(Math.floor(Date.now() / 1000), 0);

        // Build the protobuf field: field 1, fixed32 wire type, then encode and send the message.
        this.frameAndSend(MessageType.GET_TIME_RESPONSE, this.encodeProtoFields([{ fieldNumber: 1, value: nowBuf, wireType: WireType.FIXED32 }]));

        break;

      case MessageType.GET_TIME_RESPONSE:

        // Decode the fields in the GetTimeResponse payload and extract the epoch_seconds fixed32 field (field 1).
        epoch = this.extractFixed32Field(this.decodeProtobuf(payload), 1);

        if(epoch !== undefined) {

          // Emit a `time` event carrying the returned epoch seconds.
          this.emit("time", epoch);

          this.log.debug("Received GetTimeResponse: epoch seconds", epoch);
        }

        break;

      default:

        // Check if this is a list entities response.
        if(this.isListEntitiesResponse(type)) {

          this.handleListEntity(type, payload);

          return;
        }

        // Check if this is a state update.
        if(this.isStateUpdate(type)) {

          this.handleTelemetry(type, payload);

          return;
        }

        // Unhandled message type.
        this.log.warn("Unhandled message type: " + type + " | payload: " + payload.toString("hex"));

        break;
    }
  }

  /**
   * Handle device info response from the ESPHome device. This extracts all the device metadata from the response message.
   *
   * @param payload - The device info response payload.
   */
  private handleDeviceInfoResponse(payload: Buffer): void {

    this.log.debug("Received DeviceInfoResponse");

    // Decode the protobuf fields from the payload.
    const fields = this.decodeProtobuf(payload);

    // Build the device info object from the response.
    const info: DeviceInfo = {};

    // Extract uses_password (field 1).
    info.usesPassword = this.extractNumberField(fields, 1) === 1;

    // Extract name (field 2).
    info.name = this.extractStringField(fields, 2);

    // Extract MAC address (field 3).
    info.macAddress = this.extractStringField(fields, 3);

    // Extract ESPHome version (field 4).
    info.esphomeVersion = this.extractStringField(fields, 4);

    // Extract compilation time (field 5).
    info.compilationTime = this.extractStringField(fields, 5);

    // Extract model (field 6).
    info.model = this.extractStringField(fields, 6);

    // Extract has_deep_sleep (field 7).
    info.hasDeepSleep = this.extractNumberField(fields, 7) === 1;

    // Extract project_name (field 8).
    info.projectName = this.extractStringField(fields, 8);

    // Extract project_version (field 9).
    info.projectVersion = this.extractStringField(fields, 9);

    // Extract webserver_port (field 10).
    info.webserverPort = this.extractNumberField(fields, 10);

    // Extract legacy_bluetooth_proxy_version (field 11).
    info.legacyBluetoothProxyVersion = this.extractNumberField(fields, 11);

    // Extract bluetooth_proxy_feature_flags (field 12).
    info.bluetoothProxyFeatureFlags = this.extractNumberField(fields, 12);

    // Store the remote device info.
    this.remoteDeviceInfo = info;
  }

  /**
   * Return the device information of the connected ESPHome device if available.
   *
   * @returns The device information if available, or `null`.
   */
  public deviceInfo(): Nullable<DeviceInfo> {

    // Ensure the device information can't be mutated by our caller.
    return this.remoteDeviceInfo ? { ...this.remoteDeviceInfo } : null;
  }

  /**
   * Check if a message type is a list entities response. These messages contain entity discovery information.
   *
   * @param type - The message type to check.
   * @returns `true` if this is a list entities response, `false` otherwise.
   */
  private isListEntitiesResponse(type: number): boolean {

    return (type >= MessageType.LIST_ENTITIES_BINARY_SENSOR_RESPONSE && type <= MessageType.LIST_ENTITIES_TEXT_SENSOR_RESPONSE) ||
    [ MessageType.LIST_ENTITIES_SERVICES_RESPONSE, MessageType.LIST_ENTITIES_NUMBER_RESPONSE, MessageType.LIST_ENTITIES_LOCK_RESPONSE,
      MessageType.LIST_ENTITIES_BUTTON_RESPONSE ].includes(type);
  }

  /**
   * Check if a message type is a state update. These messages contain current state information for entities.
   *
   * @param type - The message type to check.
   * @returns `true` if this is a state update message, `false` otherwise.
   */
  private isStateUpdate(type: number): boolean {

    return [ MessageType.BINARY_SENSOR_STATE, MessageType.COVER_STATE, MessageType.LIGHT_STATE, MessageType.SENSOR_STATE, MessageType.SWITCH_STATE,
      MessageType.TEXT_SENSOR_STATE, MessageType.NUMBER_STATE, MessageType.LOCK_STATE, MessageType.BUTTON_COMMAND_REQUEST ].includes(type);
  }

  /**
   * Extract entity type label from message type. This converts the message type enum to a lowercase string identifier.
   *
   * @param type - The message type enum value.
   * @returns The entity type label string.
   */
  private getEntityTypeLabel(type: MessageType): string {

    return MessageType[type].replace(/^LIST_ENTITIES_/, "").replace(/_RESPONSE$/, "").replace(/_STATE$/, "").toLowerCase();
  }

  /**
   * Parses a single ListEntities*Response, logs it, and stores it. This registers a discovered entity in our internal maps for later reference.
   *
   * @param type - The message type indicating the entity type.
   * @param payload - The entity description payload.
   */
  private handleListEntity(type: number, payload: Buffer): void {

    // Decode the protobuf fields from the payload.
    const fields = this.decodeProtobuf(payload);

    // Extract and validate the entity key.
    const key = this.extractFixed32Field(fields, 2);

    if(key === undefined) {

      return;
    }

    // Extract and validate the entity name.
    const name = this.extractStringField(fields, 3);

    if(name === undefined) {

      return;
    }

    // Determine the entity type label from the message type enum.
    const label = this.getEntityTypeLabel(type);

    // Store the entity information in our lookup maps.
    const entityId = (label + "-" + name).replace(/ /g, "_").toLowerCase();

    this.entityKeys.set(entityId, key);
    this.entityNames.set(key, name);
    this.entityTypes.set(key, label);

    // Create an entity object and add it to our discovered entities list.
    const ent: Entity = { key, name, type: label };

    this.discoveredEntities.push(ent);

    // Log the entity registration for debugging.
    this.log.debug("Registered entity: [" + key + "] " + name + " (" + label + ") | " + type);
  }

  /**
   * Decodes a state update, looks up entity info, and emits events. This processes telemetry data from entities and emits appropriate events.
   *
   * @param type - The message type indicating the entity type.
   * @param payload - The state update payload.
   */
  private handleTelemetry(type: number, payload: Buffer): void {

    // Decode the protobuf fields from the payload.
    const fields = this.decodeProtobuf(payload);

    // Extract the entity key from field 1.
    const key = this.extractEntityKey(fields, 1);

    if(key === undefined) {

      return;
    }

    // Look up the entity information using the key.
    const name = this.entityNames.get(key) || ("unknown(" + key + ")");
    const typeLabel = this.entityTypes.get(key) || this.getEntityTypeLabel(type);
    const eventType = typeLabel.toLowerCase();

    // Handle cover state messages specially as they have additional fields. We handle all other entity types with a simpler value extraction.
    const data = (type === MessageType.COVER_STATE) ?
      this.decodeCoverState(fields, eventType, name) : { entity: name, type: eventType, value: this.extractTelemetryValue(fields, 2) };

    // Emit both the generic telemetry event and the type-specific event with our decoded data.
    this.emit("telemetry", data);
    this.emit(eventType, data);

    this.log.debug("TYPE: " + eventType + " | data: " + JSON.stringify(data));
  }

  /**
   * Decode cover state telemetry. Cover entities have complex state with position, tilt, and operation status.
   *
   * @param fields - The decoded protobuf fields.
   * @param eventType - The event type string.
   * @param name - The entity name.
   */
  private decodeCoverState(fields: Record<number, FieldValue[]>, eventType: string, name: string): CoverTelemetryData {

    // Extract all the cover-specific fields and build a comprehensive cover state object.
    return {

      currentOperation: this.extractNumberField(fields, 5),
      deviceId: this.extractNumberField(fields, 6),
      entity: name,
      legacyState: this.extractNumberField(fields, 2),
      position: this.extractTelemetryValue(fields, 3),
      tilt: this.extractTelemetryValue(fields, 4),
      type: eventType
    };
  }

  /**
   * Extract entity key from protobuf fields. Entity keys can be encoded as either Buffer or number types.
   *
   * @param fields - The decoded protobuf fields.
   * @param fieldNum - The field number to extract.
   * @returns The entity key or undefined if not found.
   */
  private extractEntityKey(fields: Record<number, FieldValue[]>, fieldNum: number): number | undefined {

    const rawKey = fields[fieldNum]?.[0];

    if(!rawKey) {

      return undefined;
    }

    // Handle both Buffer and number types.
    if(Buffer.isBuffer(rawKey)) {

      return rawKey.readUInt32LE(0);
    }

    if(typeof rawKey === "number") {

      return rawKey;
    }

    return undefined;
  }

  /**
   * Extract fixed32 field from protobuf fields. Fixed32 fields are always 4 bytes and represent 32-bit values.
   *
   * @param fields - The decoded protobuf fields.
   * @param fieldNum - The field number to extract.
   * @returns The numeric value or undefined if not found.
   */
  private extractFixed32Field(fields: Record<number, FieldValue[]>, fieldNum: number): number | undefined {

    const rawBuf = fields[fieldNum]?.[0];

    if(!Buffer.isBuffer(rawBuf) || rawBuf.length !== FIXED32_SIZE) {

      return undefined;
    }

    return rawBuf.readUInt32LE(0);
  }

  /**
   * Extract string field from protobuf fields. String fields are encoded as UTF-8 bytes.
   *
   * @param fields - The decoded protobuf fields.
   * @param fieldNum - The field number to extract.
   * @returns The string value or undefined if not found.
   */
  private extractStringField(fields: Record<number, FieldValue[]>, fieldNum: number): string | undefined {

    const rawBuf = fields[fieldNum]?.[0];

    if(!Buffer.isBuffer(rawBuf)) {

      return undefined;
    }

    return rawBuf.toString("utf8");
  }

  /**
   * Extract number field from protobuf fields. Number fields are encoded as varints.
   *
   * @param fields - The decoded protobuf fields.
   * @param fieldNum - The field number to extract.
   * @returns The numeric value or undefined if not found.
   */
  private extractNumberField(fields: Record<number, FieldValue[]>, fieldNum: number): number | undefined {

    const raw = fields[fieldNum]?.[0];

    return typeof raw === "number" ? raw : undefined;
  }

  /**
   * Extract telemetry value from protobuf fields. Telemetry values can be numbers, floats, or strings depending on the entity type.
   *
   * @param fields - The decoded protobuf fields.
   * @param fieldNum - The field number to extract.
   * @returns The telemetry value or undefined if not found.
   */
  private extractTelemetryValue(fields: Record<number, FieldValue[]>, fieldNum: number): number | string | undefined {

    const valRaw = fields[fieldNum]?.[0];

    if(Buffer.isBuffer(valRaw)) {

      // Interpret 4-byte buffers as float32, others as UTF-8 strings.
      return valRaw.length === FIXED32_SIZE ? valRaw.readFloatLE(0) : valRaw.toString("utf8");
    }

    return valRaw as number;
  }

  /**
   * Frames a raw protobuf payload with the appropriate framing based on encryption state. This method automatically chooses between encrypted and plaintext framing.
   *
   * @param type - The message type.
   * @param payload - The message payload.
   */
  private frameAndSend(type: MessageType, payload: Buffer): void {

    if(this.handshakeState === Handshake.READY && this.noiseClient?.sendCipher) {

      // Use Noise encryption.
      const message = this.serializeNoiseMessage(type, payload);
      const encrypted = this.noiseClient.sendCipher.EncryptWithAd(Buffer.alloc(0), message);

      this.writeNoiseFrame(Buffer.from(encrypted));
    } else {

      // Use plaintext framing.
      this.sendPlaintextMessage(type, payload);
    }
  }

  /**
   * Send a plaintext message with standard framing. Plaintext messages use a simple length-prefixed format.
   *
   * @param type - The message type.
   * @param payload - The message payload.
   */
  private sendPlaintextMessage(type: MessageType, payload: Buffer): void {

    // Construct the message header with sentinel, length, and type.
    const header = Buffer.concat([ Buffer.from([ProtocolType.PLAINTEXT]), this.encodeVarint(payload.length), this.encodeVarint(type) ]);

    // Write the complete framed message to the socket.
    if(this.clientSocket && !this.clientSocket.destroyed) {

      this.clientSocket.write(Buffer.concat([ header, payload ]));
    }
  }

  /**
   * Encode protobuf fields into a buffer. This creates a protobuf message from field definitions.
   *
   * @param fields - The fields to encode.
   * @returns The encoded protobuf message.
   */
  private encodeProtoFields(fields: ProtoField[]): Buffer {

    const parts: Buffer[] = [];
    let buf: Buffer;

    for(const field of fields) {

      // Encode the field tag.
      parts.push(this.encodeVarint((field.fieldNumber << 3) | field.wireType));

      // Encode the field value based on wire type.
      switch(field.wireType) {

        case WireType.VARINT:

          parts.push(this.encodeVarint(field.value as number));

          break;

        case WireType.LENGTH_DELIMITED:

          buf = field.value as Buffer;

          parts.push(this.encodeVarint(buf.length));
          parts.push(buf);

          break;

        case WireType.FIXED32:

          buf = Buffer.alloc(FIXED32_SIZE);

          if(typeof field.value === "number") {

            buf.writeUInt32LE(field.value, 0);
          } else {

            (field.value as Buffer).copy(buf);
          }

          parts.push(buf);

          break;
      }
    }

    return Buffer.concat(parts);
  }

  /**
   * Build key field as fixed32 for command requests. Entity keys are always sent as fixed32 fields in command messages.
   *
   * @param key - The entity key.
   * @returns The field definition.
   */
  private buildKeyField(key: number): ProtoField {

    return { fieldNumber: 1, value: key, wireType: WireType.FIXED32 };
  }

  /**
   * Get entity key by ID. This looks up the numeric key for an entity given its string ID.
   *
   * @param id - The entity ID to look up.
   *
   * @returns The entity key or `null` if not found.
   */
  public getEntityKey(id: string): Nullable<number> {

    return this.entityKeys.get(id) ?? null;
  }

  /**
   * Log all registered entity IDs for debugging. Logs entities grouped by type with their names and keys. This is primarily a debugging and development tool.
   */
  public logAllEntityIds(): void {

    this.log.warn("Registered Entity IDs:");

    for(const [ type, ids ] of Object.entries(this.getAvailableEntityIds())) {

      this.log.warn("  " + type + ":");

      for(const id of ids) {

        const entity = this.getEntityById(id);

        if(entity) {

          this.log.warn("    " + id + " => " + entity.name + " (key: " + entity.key + ")");
        }
      }
    }
  }

  /**
   * Get entity information by ID. This retrieves full entity details given its string ID.
   *
   * @param id - The entity ID to look up.
   *
   * @returns The entity information or `null` if not found.
   */
  public getEntityById(id: string): Nullable<Entity> {

    const key = this.entityKeys.get(id);

    if(!key) {

      return null;
    }

    const name = this.entityNames.get(key);
    const type = this.entityTypes.get(key);

    if(!name || !type) {

      return null;
    }

    return { key, name, type };
  }

  /**
   * Check if an entity ID exists. This is useful for validating entity IDs before sending commands.
   *
   * @param id - The entity ID to check.
   *
   * @returns `true` if the entity exists, `false` otherwise.
   */
  public hasEntity(id: string): boolean {

    return this.entityKeys.has(id);
  }

  /**
   * Get all available entity IDs grouped by type. This provides a structured view of all discovered entities.
   *
   * @returns Object with entity types as keys and arrays of IDs as values.
   */
  public getAvailableEntityIds(): Record<string, string[]> {

    const result: Record<string, string[]> = {};

    for(const id of this.entityKeys.keys()) {

      const type = id.split("-")[0];

      result[type] ??= [];
      result[type].push(id);
    }

    return result;
  }

  /**
   * Get all entities with their IDs. This returns the complete list of entities with their string IDs included.
   *
   * @returns Array of entities with their corresponding IDs.
   */
  public getEntitiesWithIds(): Array<Entity & { id: string }> {

    return this.discoveredEntities.map(entity => {

      const id = (entity.type + "-" + entity.name).replace(/ /g, "_").toLowerCase();

      return { ...entity, id };
    });
  }

  /**
   * Send a ping request to the device to heartbeat the connection. This can be used to keep the connection alive and verify connectivity.
   */
  public sendPing(): void {

    this.frameAndSend(MessageType.PING_REQUEST, Buffer.alloc(0));
  }

  /**
   * Sends a SwitchCommandRequest for the given entity ID and on/off state. This controls binary switch entities like garage door openers.
   *
   * @param id - The entity ID (format: "switch-entityname").
   * @param state - `true` for on, `false` for off.
   */
  public sendSwitchCommand(id: string, state: boolean): void {

    // Look up the entity key using the provided ID.
    const key = this.entityKeys.get(id);

    // Log debugging information.
    this.log.debug("sendSwitchCommand - ID: " + id + " | KEY: " + key + " | state: " + state);

    // Return early if the entity key is not found.
    if(!key) {

      this.log.warn("Entity key not found for ID: " + id);

      return;
    }

    // Build the protobuf fields.
    const fields: ProtoField[] = [ this.buildKeyField(key), { fieldNumber: 2, value: state ? 1 : 0, wireType: WireType.VARINT } ];

    // Encode and send the switch command request.
    const payload = this.encodeProtoFields(fields);

    this.frameAndSend(MessageType.SWITCH_COMMAND_REQUEST, payload);
  }

  /**
   * Sends a ButtonCommandRequest to press a button entity. Button entities trigger one-time actions when pressed.
   *
   * @param id - The entity ID (format: "button-entityname").
   */
  public sendButtonCommand(id: string): void {

    // Look up the entity key using the provided ID.
    const key = this.entityKeys.get(id);

    // Log debugging information.
    this.log.debug("sendButtonCommand - ID: " + id + " | KEY: " + key);

    // Return early if the entity key is not found.
    if(!key) {

      this.log.warn("Entity key not found for ID: " + id);

      return;
    }

    // Build the protobuf fields.
    const fields: ProtoField[] = [this.buildKeyField(key)];

    // Encode and send the button command request.
    const payload = this.encodeProtoFields(fields);

    this.frameAndSend(MessageType.BUTTON_COMMAND_REQUEST, payload);
  }

  /**
   * Sends a CoverCommandRequest for the given entity ID. Cover entities represent things like garage doors, blinds, or shades.
   *
   * @param id - The entity ID (format: "cover-entityname").
   * @param options - Command options (at least one option must be provided).
   * @param options.command - The command: "open", "close", or "stop" (optional).
   * @param options.position - Target position 0.0-1.0 where 0 is closed, 1 is open (optional).
   * @param options.tilt - Target tilt 0.0-1.0 where 0 is closed, 1 is open (optional).
   *
   * @example
   * ```typescript
   * // Send a simple command
   * await client.sendCoverCommand("cover-garagedoor", { command: "open" });
   *
   * // Set to specific position
   * await client.sendCoverCommand("cover-garagedoor", { position: 0.5 }); // 50% open
   *
   * // Set position and tilt for blinds
   * await client.sendCoverCommand("cover-blinds", { position: 1.0, tilt: 0.25 });
   * ```
   */
  public sendCoverCommand(id: string, options: { command?: "open" | "close" | "stop"; position?: number; tilt?: number }): void {

    // Validate that at least one option is provided.
    if(!options.command && typeof options.position !== "number" && typeof options.tilt !== "number") {

      this.log.warn("sendCoverCommand requires at least one option: command, position, or tilt");

      return;
    }

    // Look up the entity key using the provided ID.
    const key = this.entityKeys.get(id);

    // Log debugging information.
    this.log.debug("sendCoverCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));

    // Return early if the entity key is not found.
    if(!key) {

      this.log.warn("Entity key not found for ID: " + id);

      return;
    }

    // Build the protobuf fields.
    const fields: ProtoField[] = [this.buildKeyField(key)];

    // Add legacy command fields if a command is specified.
    if(options.command) {

      // Map user-friendly commands to legacy enum values.
      const cmdMap = { close: 1, open: 0, stop: 2 };

      fields.push(

        { fieldNumber: 2, value: 1, wireType: WireType.VARINT },  // has_legacy_command
        { fieldNumber: 3, value: cmdMap[options.command], wireType: WireType.VARINT }  // legacy_command
      );
    }

    // Add position field if specified.
    if(typeof options.position === "number") {

      fields.push(

        { fieldNumber: 4, value: 1, wireType: WireType.VARINT }  // has_position
      );

      // Create position buffer as float32.
      const positionBuf = Buffer.alloc(FIXED32_SIZE);

      positionBuf.writeFloatLE(options.position, 0);
      fields.push(

        { fieldNumber: 5, value: positionBuf, wireType: WireType.FIXED32 }  // position
      );
    }

    // Add tilt field if specified.
    if(typeof options.tilt === "number") {

      fields.push(

        { fieldNumber: 6, value: 1, wireType: WireType.VARINT }  // has_tilt
      );

      // Create tilt buffer as float32.
      const tiltBuf = Buffer.alloc(FIXED32_SIZE);

      tiltBuf.writeFloatLE(options.tilt, 0);
      fields.push(

        { fieldNumber: 7, value: tiltBuf, wireType: WireType.FIXED32 }  // tilt
      );
    }

    // Encode and send the cover command request.
    const payload = this.encodeProtoFields(fields);

    this.frameAndSend(MessageType.COVER_COMMAND_REQUEST, payload);
  }

  /**
   * Sends a LightCommandRequest to turn on/off and optionally set brightness. Light entities represent controllable lights with optional dimming.
   *
   * @param id - The entity ID (format: "light-entityname").
   * @param options - Command options.
   * @param options.state - `true` for on, `false` for off (optional).
   * @param options.brightness - Brightness level 0.0-1.0 (optional).
   */
  public sendLightCommand(id: string, options: { state?: boolean; brightness?: number }): void {

    // Look up the entity key using the provided ID.
    const key = this.entityKeys.get(id);

    // Log debugging information.
    this.log.debug("sendLightCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));

    // Return early if the entity key is not found.
    if(!key) {

      this.log.warn("Entity key not found for ID: " + id);

      return;
    }

    // Start building the protobuf fields.
    const fields: ProtoField[] = [this.buildKeyField(key)];

    // Add state fields if a state is specified.
    if(options.state !== undefined) {

      fields.push(

        { fieldNumber: 2, value: 1, wireType: WireType.VARINT },  // has_state
        { fieldNumber: 3, value: options.state ? 1 : 0, wireType: WireType.VARINT }  // state
      );
    }

    // Add brightness fields if brightness is specified.
    if(typeof options.brightness === "number") {

      fields.push(

        { fieldNumber: 4, value: 1, wireType: WireType.VARINT }  // has_brightness
      );

      // Create brightness buffer.
      const brightnessBuf = Buffer.alloc(FIXED32_SIZE);

      brightnessBuf.writeFloatLE(options.brightness, 0);
      fields.push(

        { fieldNumber: 5, value: brightnessBuf, wireType: WireType.FIXED32 }  // brightness
      );
    }

    // Encode and send the light command request.
    const payload = this.encodeProtoFields(fields);

    this.frameAndSend(MessageType.LIGHT_COMMAND_REQUEST, payload);
  }

  /**
   * Sends a LockCommandRequest to lock or unlock the given entity ID. Lock entities represent controllable locks with optional code support.
   *
   * @param id - The entity ID (format: "lock-entityname").
   * @param command - The command to send: "lock" or "unlock".
   * @param code - Optional unlock code.
   */
  public sendLockCommand(id: string, command: "lock" | "unlock", code?: string): void {

    // Look up the entity key using the provided ID.
    const key = this.entityKeys.get(id);

    // Log debugging information.
    this.log.debug("sendLockCommand - ID: " + id + " | KEY: " + key + " | command: " + command);

    // Return early if the entity key is not found.
    if(!key) {

      this.log.warn("Entity key not found for ID: " + id);

      return;
    }

    // Map user-friendly commands to enum values.
    const cmdMap = { lock: 1, unlock: 0 };

    // Build the protobuf fields.
    const fields: ProtoField[] = [

      this.buildKeyField(key),
      { fieldNumber: 2, value: cmdMap[command], wireType: WireType.VARINT }  // command
    ];

    // Add the optional code field if provided.
    if(code !== undefined) {

      const codeBuf = Buffer.from(code, "utf8");

      fields.push(

        { fieldNumber: 3, value: codeBuf, wireType: WireType.LENGTH_DELIMITED }  // code
      );
    }

    // Encode and send the lock command request.
    const payload = this.encodeProtoFields(fields);

    this.frameAndSend(MessageType.LOCK_COMMAND_REQUEST, payload);
  }

  /**
   * Encode an integer as a VarInt (protobuf-style). VarInts use 7 bits per byte with a continuation bit in the MSB.
   *
   * @param value - The value to encode.
   * @returns The encoded varint as a Buffer.
   */
  private encodeVarint(value: number): Buffer {

    // Initialize an array to accumulate the encoded bytes.
    const bytes: number[] = [];

    // Loop through the value, seven bits at a time, until all bits are consumed.
    for(let v = value; ; v >>>= 7) {

      // Extract the lowest 7 bits of the current value chunk.
      const bytePart = v & 0x7F;

      // Determine if there are more bits left beyond this chunk.
      const hasMore = (v >>> 7) !== 0;

      // If there are more chunks, set the MSB (continuation) bit; otherwise leave it clear.
      const byte = hasMore ? (bytePart | 0x80) : bytePart;

      // Append this byte into our buffer array.
      bytes.push(byte);

      // If this was the final chunk (no more bits), exit the loop.
      if(!hasMore) {

        break;
      }
    }

    // Convert the array of byte values into a Buffer and return it.
    return Buffer.from(bytes);
  }

  /**
   * Read a VarInt from buffer at offset; returns [value, bytesRead]. This decodes protobuf-style variable-length integers.
   *
   * @param buffer - The buffer to read from.
   * @param offset - The offset to start reading at.
   * @returns A tuple of [decoded value, number of bytes consumed].
   */
  private readVarint(buffer: Buffer, offset: number): [number, number] {

    // Accumulator for the decoded integer result.
    let result = 0;

    // Counter for how many bytes we've consumed.
    let bytesRead = 0;

    // Read byte-by-byte, adding 7 bits at each step, until the continuation bit is clear.
    for(let shift = 0; ; shift += 7) {

      // Fetch the next raw byte from the buffer.
      const byte = buffer[offset + bytesRead];

      // Mask off the continuation bit and merge into the result at the correct position.
      result |= (byte & 0x7F) << shift;

      // Advance our byte counter.
      bytesRead++;

      // If the continuation bit (0x80) is not set, we're done.
      if((byte & 0x80) === 0) {

        break;
      }
    }

    // Return the decoded integer and the number of bytes we consumed.
    return [ result, bytesRead ];
  }

  /**
   * Decode a simple protobuf message into a map of field numbers to values. This implements basic protobuf decoding for the ESPHome protocol.
   *
   * @param buffer - The protobuf message to decode.
   * @returns A map from field numbers to arrays of decoded values.
   */
  private decodeProtobuf(buffer: Buffer): Record<number, FieldValue[]> {

    // Initialize the map from field numbers to arrays of decoded values.
    const fields: Record<number, FieldValue[]> = {};

    // Iterate through the buffer by manually advancing the offset.
    for(let offset = 0; offset < buffer.length; /* offset updated in cases */) {

      let len: number;
      let lenLen: number;
      let v: number;
      let value: FieldValue;
      let vLen: number;

      // Read the next varint as the tag (combines field number and wire type).
      const [ tag, tagLen ] = this.readVarint(buffer, offset);

      // Advance past the tag bytes.
      offset += tagLen;

      // Extract the field number (upper bits of tag).
      const fieldNum = tag >>> 3;

      // Extract the wire type (lower 3 bits of tag).
      const wireType = tag & 0x07;

      // Decode the payload based on its wire type.
      switch(wireType) {

        case WireType.VARINT:

          // Read a varint payload.
          [ v, vLen ] = this.readVarint(buffer, offset);

          // Assign the numeric result.
          value = v;

          // Advance past the varint bytes.
          offset += vLen;

          break;

        case WireType.FIXED64:

          // Read a 64-bit little-endian double.
          value = buffer.readDoubleLE(offset);

          // Advance by eight bytes.
          offset += 8;

          break;

        case WireType.LENGTH_DELIMITED:

          // Read the length prefix as a varint.
          [ len, lenLen ] = this.readVarint(buffer, offset);

          // Advance past the length prefix.
          offset += lenLen;

          // Slice out the next len bytes as a Buffer.
          value = buffer.subarray(offset, offset + len);

          // Advance past the length-delimited payload.
          offset += len;

          break;

        case WireType.FIXED32:

          // For 32-bit fields, return the raw bytes for caller interpretation.
          value = buffer.subarray(offset, offset + 4);

          // Advance by four bytes.
          offset += 4;

          break;

        default:

          // Warn about unsupported wire types and return what's decoded so far.
          this.log.warn("Unsupported wire type " + wireType + ".");

          return fields;
      }

      // Ensure there is an array to hold this field's values.
      if(!fields[fieldNum]) {

        fields[fieldNum] = [];
      }

      // Append the decoded value for this field.
      fields[fieldNum].push(value);
    }

    // Return the completed map of field numbers to value arrays.
    return fields;
  }

  /**
   * Return whether we are on an encrypted connection or not.
   *
   * @returns `true` if we are on an encrypted connection, `false` otherwise.
   */
  public get isEncrypted(): boolean {

    return (this.handshakeState === Handshake.READY) && (this.connectionState === ConnectionState.CONNECTED) && this.usingEncryption;
  }
}
