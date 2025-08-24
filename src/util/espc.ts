#!/usr/bin/env node
/* eslint-disable no-console */

import { type DeviceInfo, EspHomeClient, type EspHomeClientOptions } from "../esphome-client.js";
import type { EspHomeLogging } from "../types.js";
import { createInterface } from "node:readline";

// Logger implementation for the CLI that uses console output.
class CLILogger implements EspHomeLogging {

  private verbose: boolean;

  constructor(verbose: boolean = false) {

    this.verbose = verbose;
  }

  debug(message: string, context?: unknown): void {

    if(this.verbose) {

      const parts = [ "[DEBUG]", message ];

      if(context) {

        parts.push(JSON.stringify(context, null, 2));
      }

      console.log(parts.join(" "));
    }
  }

  error(message: string, context?: unknown): void {

    const parts = [ "[ERROR]", message ];

    if(context) {

      parts.push(JSON.stringify(context, null, 2));
    }

    console.error(parts.join(" "));
  }

  info(message: string, context?: unknown): void {

    const parts = [ "[INFO]", message ];

    if(context) {

      parts.push(JSON.stringify(context, null, 2));
    }

    console.log(parts.join(" "));
  }

  warn(message: string, context?: unknown): void {

    const parts = [ "[WARN]", message ];

    if(context) {

      parts.push(JSON.stringify(context, null, 2));
    }

    console.warn(parts.join(" "));
  }
}

// Helper to join string parts without template literals.
function joinParts(parts: Array<string | number>): string {

  return parts.map(p => String(p)).join("");
}

// Display usage information.
function showUsage(): void {

  console.log("espc - ESPHome Client CLI Utility");
  console.log("");
  console.log("Usage: espc [options] <command> [command-options]");
  console.log("");
  console.log("Global Options:");
  console.log("  -h, --host <host>       ESPHome device hostname or IP address (required)");
  console.log("  -p, --port <port>       Port number (default: 6053)");
  console.log("  -k, --psk <psk>         Pre-shared key for encryption");
  console.log("  -v, --verbose           Enable verbose debug output");
  console.log("  -i, --interactive       Enter interactive mode");
  console.log("  --help                  Show this help message");
  console.log("");
  console.log("Commands:");
  console.log("  info                    Get device information");
  console.log("  list [--type <type>]    List all discovered entities (optionally filtered by type)");
  console.log("  monitor [--entity <key|id>] [--duration <seconds>]");
  console.log("                          Monitor entity state changes in real-time");
  console.log("  control <key|id> [args] Send command to any entity (type auto-detected)");
  console.log("    For switches:         <on|off>");
  console.log("    For buttons:          (no args, just press)");
  console.log("    For lights:           <on|off> or [options]");
  console.log("      --state <on|off>    Turn light on/off");
  console.log("      --brightness <0-255> Set brightness level");
  console.log("      --rgb <R,G,B>       Set RGB color");
  console.log("      --temp <mireds>     Set color temperature");
  console.log("      --effect <name>     Set light effect");
  console.log("    For covers:           open|close|stop");
  console.log("    For fans:             on|off");
  console.log("    For locks:            lock|unlock|open");
  console.log("    For numbers:          <value>");
  console.log("    For selects:          <option>");
  console.log("    For climate:          off|heat|cool|auto|dry|fan_only");
  console.log("    For text:             <text value>");
  console.log("");
  console.log("Examples:");
  console.log("  espc --host 192.168.1.100 info");
  console.log("  espc --host esp-device.local --psk MySecret123 list");
  console.log("  espc --host 192.168.1.100 control bedroom_light on");
  console.log("  espc --host 192.168.1.100 control 5 on                  # Using key");
  console.log("  espc --host esp-device.local monitor --duration 60");
  console.log("  espc --host 192.168.1.100 control my_light --brightness 128 --rgb 255,0,128");
  console.log("  espc -h 192.168.1.100 -i                                # Interactive mode");
}

// Type definitions for parsed arguments.
type ParsedOptions = {

  host: string | null;
  interactive: boolean;
  port: number;
  psk?: string;
  verbose: boolean;
};

type CommandOptions = Record<string, string | boolean>;

// Type for entities with IDs.
type EntityWithId = {

  id: string;
  key: number;
  name: string;
  type: string;
};

// Parse command line arguments manually.
function parseCommandLine(): { command: string | null; commandArgs: string[]; commandOptions: CommandOptions; options: ParsedOptions } {

  const args = process.argv.slice(2);

  if(args.length === 0 || args.includes("--help")) {

    showUsage();
    process.exit(0);
  }

  const options: ParsedOptions = {

    host: null,
    interactive: false,
    port: 6053,
    psk: undefined,
    verbose: false
  };

  let command: string | null = null;
  const commandArgs: string[] = [];
  const commandOptions: CommandOptions = {};

  let i = 0;

  while(i < args.length) {

    const arg = args[i];

    // Check if this is the command.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if(!arg.startsWith("-") && !command) {

      command = arg;
      i++;

      // Collect remaining args for the command.
      while(i < args.length) {

        const cmdArg = args[i];

        if(cmdArg.startsWith("--")) {

          // Command option.
          const optName = cmdArg.slice(2);

          if(i + 1 < args.length && !args[i + 1].startsWith("-")) {

            commandOptions[optName] = args[i + 1];
            i += 2;
          } else {

            commandOptions[optName] = true;
            i++;
          }
        } else if(!cmdArg.startsWith("-")) {

          commandArgs.push(cmdArg);
          i++;
        } else {

          i++;
        }
      }

      break;
    }

    // Global options.
    switch(arg) {
      case "-h":
      case "--host":
        options.host = args[++i];

        break;
      case "-p":
      case "--port":
        options.port = parseInt(args[++i]);

        break;
      case "-k":
      case "--psk":
        options.psk = args[++i];

        break;
      case "-v":
      case "--verbose":
        options.verbose = true;

        break;
      case "-i":
      case "--interactive":
        options.interactive = true;

        break;
      default:
        console.error(joinParts([ "Unknown option: ", arg ]));
        process.exit(1);
    }

    i++;
  }

  return { command, commandArgs, commandOptions, options };
}

// Helper to find an entity by key or ID.
function findEntity(entities: EntityWithId[], identifier: string): EntityWithId | undefined {

  // First try to parse as a number (key).
  const asNumber = parseInt(identifier);

  if(!isNaN(asNumber)) {

    const byKey = entities.find(e => e.key === asNumber);

    if(byKey) {

      return byKey;
    }
  }

  // Then try as an ID string.
  return entities.find(e => e.id === identifier);
}

// Helper function to create and connect a client.
async function createClient(options: ParsedOptions): Promise<EspHomeClient> {

  if(!options.host) {

    throw new Error("Host is required");
  }

  const config: EspHomeClientOptions = {

    host: options.host,
    logger: new CLILogger(options.verbose),
    port: options.port || 6053,
    psk: options.psk ?? undefined
  };

  const client = new EspHomeClient(config);

  // Set up event listeners for monitoring.
  client.on("log", (data) => {

    if(data.level === 1) {

      // ERROR level
      console.error(joinParts([ "Device log error: ", data.message ]));
    }
  });

  client.on("disconnect", (reason) => {

    if(options.verbose) {

      console.log(joinParts([ "Client disconnected: ", reason ?? "unknown" ]));
    }
  });

  client.connect();
  // Wait for connection.
  await new Promise((resolve) => {

    client.once("connect", resolve);
  });

  return client;
}

// Format device info for display.
function formatDeviceInfo(info: DeviceInfo): string {

  const lines: string[] = [];

  lines.push("Device Information:");

  if(info.name) {

    lines.push(joinParts([ "  Name: ", info.name ]));
  }

  if(info.model) {

    lines.push(joinParts([ "  Model: ", info.model ]));
  }

  if(info.manufacturer) {

    lines.push(joinParts([ "  Manufacturer: ", info.manufacturer ]));
  }

  if(info.friendlyName) {

    lines.push(joinParts([ "  Friendly Name: ", info.friendlyName ]));
  }

  if(info.macAddress) {

    lines.push(joinParts([ "  MAC Address: ", info.macAddress ]));
  }

  if(info.esphomeVersion) {

    lines.push(joinParts([ "  ESPHome Version: ", info.esphomeVersion ]));
  }

  if(info.compilationTime) {

    lines.push(joinParts([ "  Compilation Time: ", info.compilationTime ]));
  }
  lines.push(joinParts([ "  Uses Password: ", info.usesPassword ? "Yes" : "No" ]));

  if(info.webserverPort !== undefined) {

    lines.push(joinParts([ "  Webserver Port: ", info.webserverPort.toString() ]));
  }

  if(info.legacyBluetoothProxyVersion !== undefined) {

    lines.push(joinParts([ "  Bluetooth Proxy Version: ", info.legacyBluetoothProxyVersion.toString() ]));
  }

  if(info.legacyVoiceAssistantVersion !== undefined) {

    lines.push(joinParts([ "  Voice Assistant Version: ", info.legacyVoiceAssistantVersion.toString() ]));
  }

  return lines.join("\n");
}

// Command handler for 'info'.
async function handleInfo(options: ParsedOptions): Promise<void> {

  if(!options.host) {

    console.error("Error: --host option is required.");
    process.exit(1);
  }

  try {

    const client = await createClient(options);

    // Wait for device info to be available.
    let info = client.deviceInfo();

    if(!info) {

      // Wait up to 5 seconds for device info.
      await new Promise<void>((resolve) => {

        const timeout = setTimeout(() => resolve(), 5000);

        client.once("deviceInfo", () => {

          clearTimeout(timeout);
          resolve();
        });
      });
      info = client.deviceInfo();
    }

    if(info) {

      console.log(formatDeviceInfo(info));
    } else {

      console.log("Device information not available. The device may not be responding.");
    }
    client.disconnect();
  } catch(error) {

    console.error(joinParts([ "Failed to get device info: ", error instanceof Error ? error.message : String(error) ]));
    process.exit(1);
  }
}

// Command handler for 'list'.
async function handleList(options: ParsedOptions, commandOptions: CommandOptions): Promise<void> {

  if(!options.host) {

    console.error("Error: --host option is required.");
    process.exit(1);
  }

  try {

    const client = await createClient(options);

    // Wait a bit for discovery to complete.
    await new Promise<void>(resolve => setTimeout(resolve, 2000));

    const entities = client.getEntitiesWithIds();
    const typeFilter = commandOptions.type && typeof commandOptions.type === "string" ? commandOptions.type.toLowerCase() : null;

    console.log("Discovered Entities:");

    for(const entity of entities) {

      if(typeFilter && !entity.type.toLowerCase().includes(typeFilter)) {

        continue;
      }
      console.log(joinParts([ "  [", entity.type, "] ", entity.name, " (id: ", entity.id, ", key: ", entity.key.toString(), ")" ]));
    }

    client.disconnect();
  } catch(error) {

    console.error(joinParts([ "Failed to list entities: ", error instanceof Error ? error.message : String(error) ]));
    process.exit(1);
  }
}

// Command handler for 'monitor'.
async function handleMonitor(options: ParsedOptions, commandOptions: CommandOptions): Promise<void> {

  if(!options.host) {

    console.error("Error: --host option is required.");
    process.exit(1);
  }

  try {

    const client = await createClient(options);

    console.log("Monitoring entity state changes... Press Ctrl+C to stop.");

    // Set up telemetry listener for all entity updates.
    client.on("telemetry", (data) => {

      if(commandOptions.entity) {

        const entityKey = typeof commandOptions.entity === "string" ? parseInt(commandOptions.entity) : 0;
        const entity = typeof commandOptions.entity === "string" ? client.getEntityById(commandOptions.entity) : null;

        if(entity && entity.key !== entityKey) {

          return;
        }
      }

      // The entity field contains the name.
      console.log(joinParts([ "[", new Date().toISOString(), "] ", data.entity || "Unknown", " (", data.type, ", key: ", data.key.toString(),
        ") -> ", JSON.stringify(data) ]));
    });

    // Handle duration if specified.
    if(commandOptions.duration) {

      const duration = typeof commandOptions.duration === "string" ? parseInt(commandOptions.duration) : 60;

      setTimeout(() => {

        console.log("Monitor duration elapsed.");
        client.disconnect();
        process.exit(0);
      }, duration * 1000);
    }

    // Keep the process running.
    process.on("SIGINT", () => {

      console.log("\nStopping monitor...");
      client.disconnect();
      process.exit(0);
    });

  } catch(error) {

    console.error(joinParts([ "Failed to start monitoring: ", error instanceof Error ? error.message : String(error) ]));
    process.exit(1);
  }
}

// Command handler for 'control' - universal entity control.
async function handleControl(options: ParsedOptions, commandArgs: string[], commandOptions: CommandOptions): Promise<void> {

  if(!options.host) {

    console.error("Error: --host option is required.");
    process.exit(1);
  }

  if(commandArgs.length < 1) {

    console.error("Error: control command requires at least an entity identifier.");
    console.error("Usage: espc --host <host> control <key|id> [args]");
    process.exit(1);
  }

  const identifier = commandArgs[0];

  try {

    const client = await createClient(options);

    // Wait for discovery.
    await new Promise<void>(resolve => setTimeout(resolve, 1500));

    // Find entity by key or ID.
    const entities = client.getEntitiesWithIds();
    const entity = findEntity(entities, identifier);

    if(!entity) {

      console.error(joinParts([ "Error: Entity '", identifier, "' not found." ]));
      client.disconnect();
      process.exit(1);
    }

    // Handle based on entity type (case-insensitive).
    const entityType = entity.type.toLowerCase();

    switch(entityType) {

      case "switch": {

        const state = commandArgs[1]?.toLowerCase();

        if(state !== "on" && state !== "off") {

          console.error("Error: Switch requires 'on' or 'off' state.");
          client.disconnect();
          process.exit(1);
        }

        const turnOn = state === "on";

        console.log(joinParts([ "Turning ", entity.name, " ", turnOn ? "ON" : "OFF", "..." ]));
        client.sendSwitchCommand(entity.id, turnOn);

        break;
      }

      case "button": {

        console.log(joinParts([ "Pressing button ", entity.name, "..." ]));
        client.sendButtonCommand(entity.id);

        break;
      }

      case "light": {

        const lightCommand: Record<string, unknown> = {};

        // Check for simple on/off in commandArgs.
        if(commandArgs[1] && (commandArgs[1] === "on" || commandArgs[1] === "off")) {

          lightCommand.state = commandArgs[1] === "on";
        }

        // Process command options.
        if(commandOptions.state && typeof commandOptions.state === "string") {

          lightCommand.state = commandOptions.state.toLowerCase() === "on";
        }

        if(commandOptions.brightness && typeof commandOptions.brightness === "string") {

          const brightness = parseInt(commandOptions.brightness);

          lightCommand.brightness = Math.max(0, Math.min(255, brightness));
        }

        if(commandOptions.rgb && typeof commandOptions.rgb === "string") {

          const parts = commandOptions.rgb.split(",").map((v: string) => parseInt(v.trim()));

          if(parts.length === 3 && parts.every((v: number) => !isNaN(v))) {

            lightCommand.rgb = {

              blue: parts[2],
              green: parts[1],
              red: parts[0]
            };
          }
        }

        if(commandOptions.temp && typeof commandOptions.temp === "string") {

          lightCommand.colorTemperature = parseInt(commandOptions.temp);
        }

        if(commandOptions.effect && typeof commandOptions.effect === "string") {

          lightCommand.effect = commandOptions.effect;
        }

        console.log(joinParts([ "Sending light command to ", entity.name, "..." ]));
        client.sendLightCommand(entity.id, lightCommand);

        break;
      }

      case "cover": {

        const position = commandArgs[1];

        if(position === "open") {

          console.log(joinParts([ "Opening cover ", entity.name, "..." ]));
          client.sendCoverCommand(entity.id, { position: 1.0 });
        } else if(position === "close") {

          console.log(joinParts([ "Closing cover ", entity.name, "..." ]));
          client.sendCoverCommand(entity.id, { position: 0.0 });
        } else if(position === "stop") {

          console.log(joinParts([ "Stopping cover ", entity.name, "..." ]));
          client.sendCoverCommand(entity.id, { stop: true });
        } else {

          console.error("Error: Cover requires 'open', 'close', or 'stop'.");
          client.disconnect();
          process.exit(1);
        }

        break;
      }

      case "fan": {

        const state = commandArgs[1]?.toLowerCase();

        if(state === "on" || state === "off") {

          console.log(joinParts([ "Turning fan ", entity.name, " ", state.toUpperCase(), "..." ]));
          client.sendFanCommand(entity.id, { state: state === "on" });
        } else {

          console.error("Error: Fan requires 'on' or 'off' state.");
          client.disconnect();
          process.exit(1);
        }

        break;
      }

      case "lock": {

        const cmd = commandArgs[1]?.toLowerCase();

        if(cmd === "lock" || cmd === "unlock" || cmd === "open") {

          console.log(joinParts([ "Sending ", cmd, " command to ", entity.name, "..." ]));
          client.sendLockCommand(entity.id, cmd as "lock" | "unlock" | "open");
        } else {

          console.error("Error: Lock requires 'lock', 'unlock', or 'open' command.");
          client.disconnect();
          process.exit(1);
        }

        break;
      }

      case "number": {

        const value = commandArgs[1];

        if(!value) {

          console.error("Error: Number entity requires a value.");
          client.disconnect();
          process.exit(1);
        }

        const numValue = parseFloat(value);

        if(isNaN(numValue)) {

          console.error("Error: Invalid number value.");
          client.disconnect();
          process.exit(1);
        }

        console.log(joinParts([ "Setting number ", entity.name, " to ", numValue.toString(), "..." ]));
        client.sendNumberCommand(entity.id, numValue);

        break;
      }

      case "select": {

        const option = commandArgs.slice(1).join(" ");

        if(!option) {

          console.error("Error: Select entity requires an option value.");
          client.disconnect();
          process.exit(1);
        }

        console.log(joinParts([ "Setting select ", entity.name, " to '", option, "'..." ]));
        client.sendSelectCommand(entity.id, option);

        break;
      }

      case "climate": {

        const mode = commandArgs[1]?.toLowerCase();

        if(!mode) {

          console.error("Error: Climate entity requires a mode (off, heat, cool, heat_cool, auto, dry, fan_only).");
          client.disconnect();
          process.exit(1);
        }

        const climateOptions: Record<string, unknown> = {};

        if(mode === "off") {

          climateOptions.mode = "off";
        } else if([ "heat", "cool", "heat_cool", "auto", "dry", "fan_only" ].includes(mode)) {

          climateOptions.mode = mode;
        } else {

          console.error("Error: Invalid climate mode.");
          client.disconnect();
          process.exit(1);
        }

        console.log(joinParts([ "Setting climate ", entity.name, " to mode ", mode, "..." ]));
        client.sendClimateCommand(entity.id, climateOptions);

        break;
      }

      case "text": {

        const text = commandArgs.slice(1).join(" ");

        if(!text) {

          console.error("Error: Text entity requires text value.");
          client.disconnect();
          process.exit(1);
        }

        console.log(joinParts([ "Setting text ", entity.name, " to '", text, "'..." ]));
        client.sendTextCommand(entity.id, text);

        break;
      }

      case "sensor":
      case "binary_sensor":
      case "text_sensor": {

        console.error(joinParts([ "Error: ", entity.type, " entities are read-only and cannot be controlled." ]));
        client.disconnect();
        process.exit(1);

        break;
      }

      default:
        console.error(joinParts([ "Error: Entity type '", entity.type, "' is not yet supported for control commands." ]));
        client.disconnect();
        process.exit(1);
    }

    console.log("Command sent successfully.");
    client.disconnect();
  } catch(error) {

    console.error(joinParts([ "Failed to control entity: ", error instanceof Error ? error.message : String(error) ]));
    process.exit(1);
  }
}

// Command handler for 'interactive'.
async function handleInteractive(options: ParsedOptions): Promise<void> {

  if(!options.host) {

    console.error("Error: --host option is required.");
    process.exit(1);
  }

  try {

    const client = await createClient(options);

    console.log("Connected to ESPHome device. Entering interactive mode...");
    console.log("Type 'help' for available commands.");

    const rl = createInterface({

      input: process.stdin,
      output: process.stdout,
      prompt: "espc> "
    });

    // Track if we're quitting via command to avoid duplicate messages.
    let quittingViaCommand = false;

    // Set up telemetry monitoring.
    client.on("telemetry", (data) => {

      // The entity field contains the name.
      const entityName = data.entity || "Unknown";

      // Save the current line the user is typing.
      const currentLine = rl.line;

      // Clear the current line from the terminal (including prompt).
      process.stdout.write("\r\x1b[K");

      // Print the telemetry message.
      console.log(joinParts([ "[TELEMETRY] ", entityName, " (", data.type, ") -> ", JSON.stringify(data) ]));

      // Restore the prompt and any text the user was typing.
      rl.prompt();

      if(currentLine) {

        // Restore what the user was typing without triggering a new line event.
        rl.write(currentLine);
      }
    });

    // Delay showing the initial prompt slightly to let initial telemetry print first.
    setTimeout(() => rl.prompt(), 100);

    rl.on("line", (line) => {

      const parts = line.trim().split(" ");
      const cmd = parts[0];

      switch(cmd) {
        case "help": {

          console.log("Available commands:");
          console.log("  help                    - Show this help message");
          console.log("  info                    - Display device information");
          console.log("  list                    - List all discovered entities");
          console.log("  control <key|id> [args] - Control an entity (type auto-detected)");
          console.log("    Examples:");
          console.log("      control bedroom_light on");
          console.log("      control 5 off");
          console.log("      control my_button");
          console.log("      control my_light on --brightness 128");
          console.log("      control my_cover open");
          console.log("  quit, exit              - Disconnect and exit");

          break;
        }

        case "info": {

          const info = client.deviceInfo();

          if(info) {

            console.log(formatDeviceInfo(info));
          } else {

            console.log("Device information not available.");
          }

          break;
        }

        case "list": {

          const entities = client.getEntitiesWithIds();

          console.log("Entities:");

          for(const entity of entities) {

            console.log(joinParts([ "  [", entity.type, "] ", entity.name, " (id: ", entity.id, ", key: ", entity.key.toString(), ")" ]));
          }

          break;
        }

        case "control": {

          if(parts.length < 2) {

            console.log("Usage: control <key|id> [args]");

            break;
          }

          const identifier = parts[1];
          const entities = client.getEntitiesWithIds();
          const entity = findEntity(entities, identifier);

          if(!entity) {

            console.error(joinParts([ "Entity '", identifier, "' not found." ]));

            break;
          }

          try {

            const entityType = entity.type.toLowerCase();

            switch(entityType) {

              case "switch": {

                const state = parts[2]?.toLowerCase();

                if(state === "on" || state === "off") {

                  client.sendSwitchCommand(entity.id, state === "on");
                  console.log(joinParts([ "Switched ", entity.name, " ", state.toUpperCase() ]));
                } else {

                  console.error("Switch requires 'on' or 'off'.");
                }

                break;
              }

              case "button": {

                client.sendButtonCommand(entity.id);
                console.log(joinParts([ "Pressed button ", entity.name ]));

                break;
              }

              case "light": {

                if(parts[2]) {

                  const state = parts[2].toLowerCase() === "on";
                  const brightness = parts[3] ? parseInt(parts[3]) : undefined;
                  const lightOptions: Record<string, unknown> = { state };

                  if(brightness !== undefined) {

                    lightOptions.brightness = brightness;
                  }

                  client.sendLightCommand(entity.id, lightOptions);
                  console.log(joinParts([ "Light command sent to ", entity.name ]));
                } else {

                  console.error("Light requires at least on/off state.");
                }

                break;
              }

              case "cover": {

                const cmd = parts[2]?.toLowerCase();

                if(cmd === "open" || cmd === "close" || cmd === "stop") {

                  if(cmd === "stop") {

                    client.sendCoverCommand(entity.id, { stop: true });
                  } else {

                    client.sendCoverCommand(entity.id, { position: cmd === "open" ? 1.0 : 0.0 });
                  }
                  console.log(joinParts([ "Cover command sent to ", entity.name ]));
                } else {

                  console.error("Cover requires 'open', 'close', or 'stop'.");
                }

                break;
              }

              case "fan": {

                const state = parts[2]?.toLowerCase();

                if(state === "on" || state === "off") {

                  client.sendFanCommand(entity.id, { state: state === "on" });
                  console.log(joinParts([ "Fan ", entity.name, " turned ", state.toUpperCase() ]));
                } else {

                  console.error("Fan requires 'on' or 'off'.");
                }

                break;
              }

              case "lock": {

                const cmd = parts[2]?.toLowerCase();

                if(cmd === "lock" || cmd === "unlock" || cmd === "open") {

                  client.sendLockCommand(entity.id, cmd as "lock" | "unlock" | "open");
                  console.log(joinParts([ "Lock command '", cmd, "' sent to ", entity.name ]));
                } else {

                  console.error("Lock requires 'lock', 'unlock', or 'open'.");
                }

                break;
              }

              case "number": {

                const value = parts[2];

                if(value) {

                  const numValue = parseFloat(value);

                  if(!isNaN(numValue)) {

                    client.sendNumberCommand(entity.id, numValue);
                    console.log(joinParts([ "Set ", entity.name, " to ", numValue.toString() ]));
                  } else {

                    console.error("Invalid number value.");
                  }
                } else {

                  console.error("Number entity requires a value.");
                }

                break;
              }

              case "select": {

                const option = parts.slice(2).join(" ");

                if(option) {

                  client.sendSelectCommand(entity.id, option);
                  console.log(joinParts([ "Set ", entity.name, " to '", option, "'" ]));
                } else {

                  console.error("Select entity requires an option.");
                }

                break;
              }

              case "text": {

                const text = parts.slice(2).join(" ");

                if(text) {

                  client.sendTextCommand(entity.id, text);
                  console.log(joinParts([ "Set ", entity.name, " to '", text, "'" ]));
                } else {

                  console.error("Text entity requires a value.");
                }

                break;
              }

              case "climate": {

                const mode = parts[2]?.toLowerCase();

                if(mode && [ "off", "heat", "cool", "heat_cool", "auto", "dry", "fan_only" ].includes(mode)) {

                  const climateMode = mode === "heat_cool" ? "heat_cool" : mode === "fan_only" ? "fan_only" : mode;

                  client.sendClimateCommand(entity.id, { mode: climateMode as "off" | "heat" | "cool" | "heat_cool" | "auto" | "dry" | "fan_only" });
                  console.log(joinParts([ "Set ", entity.name, " to mode ", mode ]));
                } else {

                  console.error("Climate requires valid mode (off, heat, cool, heat_cool, auto, dry, fan_only).");
                }

                break;
              }

              default:
                console.error(joinParts([ "Entity type '", entity.type, "' not yet supported in interactive mode." ]));
            }
          } catch(error) {

            console.error(joinParts([ "Error: ", error instanceof Error ? error.message : String(error) ]));
          }

          break;
        }


        case "quit":
        case "exit": {

          quittingViaCommand = true;
          console.log("Disconnecting...");
          client.disconnect();
          rl.close();
          // Let the close event handler call process.exit.

          return;
        }

        default: {

          if(cmd) {

            console.log(joinParts([ "Unknown command: ", cmd ]));
          }

          break;
        }
      }

      rl.prompt();
    });

    rl.on("close", () => {

      // Only show message if not already quitting via command.
      if(!quittingViaCommand) {

        console.log("\nDisconnecting...");
        client.disconnect();
      }
      process.exit(0);
    });
  } catch(error) {

    console.error(joinParts([ "Failed to enter interactive mode: ", error instanceof Error ? error.message : String(error) ]));
    process.exit(1);
  }
}

// Main entry point.
async function main(): Promise<void> {

  const { options, command, commandArgs, commandOptions } = parseCommandLine();

  // Check if interactive mode was requested via -i flag.
  if(options.interactive) {

    await handleInteractive(options);

    return;
  }

  switch(command) {

    case "info":

      await handleInfo(options);

      break;

    case "list":

      await handleList(options, commandOptions);

      break;

    case "monitor":

      await handleMonitor(options, commandOptions);

      break;

    case "control":

      await handleControl(options, commandArgs, commandOptions);

      break;

    default:

      console.error(joinParts([ "Unknown command: ", command ?? "(none)" ]));
      console.error("Run 'espc --help' for usage information.");
      process.exit(1);
  }
}

// Run the CLI.
main().catch((error) => {

  console.error(joinParts([ "Fatal error: ", error instanceof Error ? error.message : String(error) ]));
  process.exit(1);
});
