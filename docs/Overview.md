<SPAN ALIGN="CENTER" STYLE="text-align:center">
<DIV ALIGN="CENTER" STYLE="text-align:center">

[![esphome-client: ESPHome Client API](https://raw.githubusercontent.com/hjdhjd/esphome-client/main/esphome-logo.svg)](https://github.com/hjdhjd/esphome-client)

# ESPHome Client API

[![Downloads](https://img.shields.io/npm/dt/esphome-client?color=%230559C9&logo=icloud&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)
[![Version](https://img.shields.io/npm/v/esphome-client?color=%230559C9&label=ESPHome%20Client%20API&logo=esphome&logoColor=%2318BCF2&style=for-the-badge)](https://www.npmjs.com/package/esphome-client)

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