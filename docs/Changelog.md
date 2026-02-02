# Changelog

All notable changes to this project will be documented in this file. This project tries to use [semantic versioning](https://semver.org/).

## 1.3.1 (2026-02-02)
  * Housekeeping.

## 1.3.0 (2026-01-22)
  * New feature: extended entity metadata parsing. The `entities` event now includes all fields from ListEntities responses - things like `icon`, `deviceClass`, `unitOfMeasurement`, `stateClass`, `supportedColorModes`, `effects`, `options`, and capability flags. Each of the 22 entity types now has a dedicated TypeScript interface with type-specific properties.
  * New feature: exported entity types and enums for consumers. You can now import `Entity`, `SensorEntity`, `LightEntity`, etc., along with enums like `EntityCategory`, `StateClass`, `NumberMode`, and `TextMode`.
  * Improvement: schema-driven entity parsing. Entity field definitions are now centralized in the schema system, making future protocol changes easier to maintain.
  * Improvement: better error logging when entity discovery fails due to missing required fields.
  * Housekeeping.

## 1.2.1 (2025-11-03)
  * Housekeeping.

## 1.2.0 (2025-11-03)
  * Improvement: ESPHome 2025.10 and beyond compatibility.
  * Housekeeping.

## 1.1.2 (2025-09-01)
  * Housekeeping.

## 1.1.1 (2025-08-24)
  * Housekeeping.

## 1.1.0 (2025-08-24)
  * New features: completed the API client implementation. We now support all the message and entity types except for Home Assistant and Bluetooth-related ones. I've primarily extensively tested the entity and message types that relate to homebridge-ratgdo. Feedback welcomed.
  * Housekeeping.

## 1.0.0 (2025-08-11)
  * Initial release.
