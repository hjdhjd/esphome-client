[**esphome-client**](../README.md)

***

[Home](../README.md) / ENTITY\_SCHEMAS

# Variable: ENTITY\_SCHEMAS

```ts
const ENTITY_SCHEMAS: {
  alarm_control_panel: {
     command: {
        deviceIdFieldNumber: 4;
        enumMappings: {
           command: {
              arm_away: 1;
              arm_custom_bypass: 5;
              arm_home: 2;
              arm_night: 3;
              arm_vacation: 4;
              disarm: 0;
              trigger: 6;
           };
        };
        fields: {
           code: {
              fieldNumber: 3;
              valueType: "string";
              wireType: 2;
           };
           command: {
              fieldNumber: 2;
              valueType: "enum";
              wireType: 0;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 96;
     };
     listEntities: {
        deviceIdFieldNumber: 11;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           requiresCode: {
              fieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
           requiresCodeToArm: {
              fieldNumber: 10;
              valueType: "bool";
              wireType: 0;
           };
           supportedFeatures: {
              fieldNumber: 8;
              valueType: "varint";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 94;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 3;
        enumMappings: {
           state: {
              ARMED_AWAY: 2;
              ARMED_CUSTOM_BYPASS: 5;
              ARMED_HOME: 1;
              ARMED_NIGHT: 3;
              ARMED_VACATION: 4;
              ARMING: 7;
              DISARMED: 0;
              DISARMING: 8;
              PENDING: 6;
              TRIGGERED: 9;
           };
        };
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "enum";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 95;
     };
     type: "alarm_control_panel";
  };
  binary_sensor: {
     listEntities: {
        deviceIdFieldNumber: 10;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           deviceClass: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 7;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 9;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
           isStatusBinarySensor: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 12;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           missingState: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 21;
     };
     type: "binary_sensor";
  };
  button: {
     command: {
        deviceIdFieldNumber: 2;
        fields: {
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 62;
     };
     listEntities: {
        deviceIdFieldNumber: 9;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           deviceClass: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 61;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 0;
        fields: {
        };
        keyFieldNumber: 1;
        messageType: 0;
     };
     type: "button";
  };
  camera: {
     listEntities: {
        deviceIdFieldNumber: 8;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 5;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 6;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 43;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           data: {
              fieldNumber: 2;
              valueType: "string";
              wireType: 2;
           };
           done: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 44;
     };
     type: "camera";
  };
  climate: {
     command: {
        deviceIdFieldNumber: 24;
        enumMappings: {
           fanMode: {
              auto: 2;
              diffuse: 8;
              focus: 7;
              high: 5;
              low: 3;
              medium: 4;
              middle: 6;
              off: 1;
              on: 0;
              quiet: 9;
           };
           mode: {
              auto: 6;
              cool: 2;
              dry: 5;
              fan_only: 4;
              heat: 3;
              heat_cool: 1;
              off: 0;
           };
           preset: {
              activity: 7;
              away: 2;
              boost: 3;
              comfort: 4;
              eco: 5;
              home: 1;
              none: 0;
              sleep: 6;
           };
           swingMode: {
              both: 1;
              horizontal: 3;
              off: 0;
              vertical: 2;
           };
        };
        fields: {
        };
        hasPatternFields: {
           customFanMode: {
              hasFieldNumber: 16;
              valueFieldNumber: 17;
              valueType: "string";
              wireType: 2;
           };
           customPreset: {
              hasFieldNumber: 20;
              valueFieldNumber: 21;
              valueType: "string";
              wireType: 2;
           };
           fanMode: {
              hasFieldNumber: 12;
              valueFieldNumber: 13;
              valueType: "enum";
              wireType: 0;
           };
           mode: {
              hasFieldNumber: 2;
              valueFieldNumber: 3;
              valueType: "enum";
              wireType: 0;
           };
           preset: {
              hasFieldNumber: 18;
              valueFieldNumber: 19;
              valueType: "enum";
              wireType: 0;
           };
           swingMode: {
              hasFieldNumber: 14;
              valueFieldNumber: 15;
              valueType: "enum";
              wireType: 0;
           };
           targetHumidity: {
              hasFieldNumber: 22;
              valueFieldNumber: 23;
              valueType: "float";
              wireType: 5;
           };
           targetTemperature: {
              hasFieldNumber: 4;
              valueFieldNumber: 5;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureHigh: {
              hasFieldNumber: 8;
              valueFieldNumber: 9;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureLow: {
              hasFieldNumber: 6;
              valueFieldNumber: 7;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 48;
     };
     listEntities: {
        deviceIdFieldNumber: 26;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
           supportedFanModes: {
              AUTO: 2;
              DIFFUSE: 8;
              FOCUS: 7;
              HIGH: 5;
              LOW: 3;
              MEDIUM: 4;
              MIDDLE: 6;
              OFF: 1;
              ON: 0;
              QUIET: 9;
           };
           supportedModes: {
              AUTO: 6;
              COOL: 2;
              DRY: 5;
              FAN_ONLY: 4;
              HEAT: 3;
              HEAT_COOL: 1;
              OFF: 0;
           };
           supportedPresets: {
              ACTIVITY: 7;
              AWAY: 2;
              BOOST: 3;
              COMFORT: 4;
              ECO: 5;
              HOME: 1;
              NONE: 0;
              SLEEP: 6;
           };
           supportedSwingModes: {
              BOTH: 1;
              HORIZONTAL: 3;
              OFF: 0;
              VERTICAL: 2;
           };
           temperatureUnit: {
              CELSIUS: 0;
              FAHRENHEIT: 1;
              KELVIN: 2;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 18;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 20;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 19;
              valueType: "string";
              wireType: 2;
           };
           supportsAction: {
              fieldNumber: 12;
              valueType: "bool";
              wireType: 0;
           };
           supportsCurrentHumidity: {
              fieldNumber: 22;
              valueType: "bool";
              wireType: 0;
           };
           supportsCurrentTemperature: {
              fieldNumber: 5;
              valueType: "bool";
              wireType: 0;
           };
           supportsTargetHumidity: {
              fieldNumber: 23;
              valueType: "bool";
              wireType: 0;
           };
           supportsTwoPointTargetTemperature: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           temperatureUnit: {
              fieldNumber: 28;
              valueType: "enum";
              wireType: 0;
           };
           visualCurrentTemperatureStep: {
              fieldNumber: 21;
              valueType: "float";
              wireType: 5;
           };
           visualMaxHumidity: {
              fieldNumber: 25;
              valueType: "float";
              wireType: 5;
           };
           visualMaxTemperature: {
              fieldNumber: 9;
              valueType: "float";
              wireType: 5;
           };
           visualMinHumidity: {
              fieldNumber: 24;
              valueType: "float";
              wireType: 5;
           };
           visualMinTemperature: {
              fieldNumber: 8;
              valueType: "float";
              wireType: 5;
           };
           visualTargetTemperatureStep: {
              fieldNumber: 10;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 2;
        messageType: 46;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        packedBitsFields: {
           featureFlags: {
              bits: {
                 requiresTwoPointTargetTemperature: {
                    bit: 4;
                 };
                 supportsAction: {
                    bit: 32;
                 };
                 supportsCurrentHumidity: {
                    bit: 8;
                 };
                 supportsCurrentTemperature: {
                    bit: 1;
                 };
                 supportsTargetHumidity: {
                    bit: 16;
                 };
                 supportsTwoPointTargetTemperature: {
                    bit: 2;
                 };
              };
              fieldNumber: 27;
              wireType: 0;
           };
        };
        repeatedFields: {
           supportedCustomFanModes: {
              fieldNumber: 15;
              valueType: "string";
              wireType: 2;
           };
           supportedCustomPresets: {
              fieldNumber: 17;
              valueType: "string";
              wireType: 2;
           };
           supportedFanModes: {
              fieldNumber: 13;
              valueType: "enum";
              wireType: 0;
           };
           supportedModes: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           supportedPresets: {
              fieldNumber: 16;
              valueType: "enum";
              wireType: 0;
           };
           supportedSwingModes: {
              fieldNumber: 14;
              valueType: "enum";
              wireType: 0;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 16;
        enumMappings: {
           action: {
              COOLING: 2;
              DRYING: 5;
              FAN: 6;
              HEATING: 3;
              IDLE: 4;
              OFF: 0;
           };
           fanMode: {
              AUTO: 2;
              DIFFUSE: 8;
              FOCUS: 7;
              HIGH: 5;
              LOW: 3;
              MEDIUM: 4;
              MIDDLE: 6;
              OFF: 1;
              ON: 0;
              QUIET: 9;
           };
           mode: {
              AUTO: 6;
              COOL: 2;
              DRY: 5;
              FAN_ONLY: 4;
              HEAT: 3;
              HEAT_COOL: 1;
              OFF: 0;
           };
           preset: {
              ACTIVITY: 7;
              AWAY: 2;
              BOOST: 3;
              COMFORT: 4;
              ECO: 5;
              HOME: 1;
              NONE: 0;
              SLEEP: 6;
           };
           swingMode: {
              BOTH: 1;
              HORIZONTAL: 3;
              OFF: 0;
              VERTICAL: 2;
           };
        };
        fields: {
           action: {
              fieldNumber: 8;
              valueType: "enum";
              wireType: 0;
           };
           currentHumidity: {
              fieldNumber: 14;
              valueType: "float";
              wireType: 5;
           };
           currentTemperature: {
              fieldNumber: 3;
              valueType: "float";
              wireType: 5;
           };
           customFanMode: {
              fieldNumber: 11;
              valueType: "string";
              wireType: 2;
           };
           customPreset: {
              fieldNumber: 13;
              valueType: "string";
              wireType: 2;
           };
           fanMode: {
              fieldNumber: 9;
              valueType: "enum";
              wireType: 0;
           };
           mode: {
              fieldNumber: 2;
              valueType: "enum";
              wireType: 0;
           };
           preset: {
              fieldNumber: 12;
              valueType: "enum";
              wireType: 0;
           };
           swingMode: {
              fieldNumber: 10;
              valueType: "enum";
              wireType: 0;
           };
           targetHumidity: {
              fieldNumber: 15;
              valueType: "float";
              wireType: 5;
           };
           targetTemperature: {
              fieldNumber: 4;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureHigh: {
              fieldNumber: 6;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureLow: {
              fieldNumber: 5;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 47;
     };
     type: "climate";
  };
  cover: {
     command: {
        deviceIdFieldNumber: 9;
        fields: {
           stop: {
              fieldNumber: 8;
              valueType: "bool";
              wireType: 0;
           };
        };
        hasPatternFields: {
           position: {
              hasFieldNumber: 4;
              valueFieldNumber: 5;
              valueType: "float";
              wireType: 5;
           };
           tilt: {
              hasFieldNumber: 6;
              valueFieldNumber: 7;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 30;
     };
     listEntities: {
        deviceIdFieldNumber: 13;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           assumedState: {
              fieldNumber: 5;
              valueType: "bool";
              wireType: 0;
           };
           deviceClass: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 11;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 10;
              valueType: "string";
              wireType: 2;
           };
           supportsPosition: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           supportsStop: {
              fieldNumber: 12;
              valueType: "bool";
              wireType: 0;
           };
           supportsTilt: {
              fieldNumber: 7;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 13;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 6;
        enumMappings: {
           currentOperation: {
              IDLE: 0;
              IS_CLOSING: 2;
              IS_OPENING: 1;
           };
        };
        fields: {
           currentOperation: {
              fieldNumber: 5;
              valueType: "enum";
              wireType: 0;
           };
           position: {
              fieldNumber: 3;
              valueType: "float";
              wireType: 5;
           };
           tilt: {
              fieldNumber: 4;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 22;
     };
     type: "cover";
  };
  date: {
     command: {
        deviceIdFieldNumber: 5;
        fields: {
           day: {
              fieldNumber: 4;
              valueType: "varint";
              wireType: 0;
           };
           month: {
              fieldNumber: 3;
              valueType: "varint";
              wireType: 0;
           };
           year: {
              fieldNumber: 2;
              valueType: "varint";
              wireType: 0;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 102;
     };
     listEntities: {
        deviceIdFieldNumber: 8;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 100;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 6;
        fields: {
           day: {
              fieldNumber: 5;
              valueType: "varint";
              wireType: 0;
           };
           missingState: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
           month: {
              fieldNumber: 4;
              valueType: "varint";
              wireType: 0;
           };
           year: {
              fieldNumber: 3;
              valueType: "varint";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 101;
     };
     type: "date";
  };
  datetime: {
     command: {
        deviceIdFieldNumber: 3;
        fields: {
           epochSeconds: {
              fieldNumber: 2;
              valueType: "fixed32";
              wireType: 5;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 114;
     };
     listEntities: {
        deviceIdFieldNumber: 8;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 112;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           epochSeconds: {
              fieldNumber: 3;
              valueType: "fixed32";
              wireType: 5;
           };
           missingState: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 113;
     };
     type: "datetime";
  };
  event: {
     listEntities: {
        deviceIdFieldNumber: 10;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           deviceClass: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 107;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        repeatedFields: {
           eventTypes: {
              fieldNumber: 9;
              valueType: "string";
              wireType: 2;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 3;
        fields: {
           eventType: {
              fieldNumber: 2;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 1;
        messageType: 108;
     };
     type: "event";
  };
  fan: {
     command: {
        deviceIdFieldNumber: 14;
        enumMappings: {
           direction: {
              forward: 0;
              reverse: 1;
           };
        };
        fields: {
        };
        hasPatternFields: {
           direction: {
              hasFieldNumber: 8;
              valueFieldNumber: 9;
              valueType: "enum";
              wireType: 0;
           };
           oscillating: {
              hasFieldNumber: 6;
              valueFieldNumber: 7;
              valueType: "bool";
              wireType: 0;
           };
           presetMode: {
              hasFieldNumber: 12;
              valueFieldNumber: 13;
              valueType: "string";
              wireType: 2;
           };
           speedLevel: {
              hasFieldNumber: 10;
              valueFieldNumber: 11;
              valueType: "varint";
              wireType: 0;
           };
           state: {
              hasFieldNumber: 2;
              valueFieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 31;
     };
     listEntities: {
        deviceIdFieldNumber: 13;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 11;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 10;
              valueType: "string";
              wireType: 2;
           };
           supportedSpeedCount: {
              fieldNumber: 8;
              valueType: "varint";
              wireType: 0;
           };
           supportsDirection: {
              fieldNumber: 7;
              valueType: "bool";
              wireType: 0;
           };
           supportsOscillation: {
              fieldNumber: 5;
              valueType: "bool";
              wireType: 0;
           };
           supportsSpeed: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 14;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        repeatedFields: {
           supportedPresetModes: {
              fieldNumber: 12;
              valueType: "string";
              wireType: 2;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 8;
        enumMappings: {
           direction: {
              FORWARD: 0;
              REVERSE: 1;
           };
        };
        fields: {
           direction: {
              fieldNumber: 5;
              valueType: "enum";
              wireType: 0;
           };
           oscillating: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           presetMode: {
              fieldNumber: 7;
              valueType: "string";
              wireType: 2;
           };
           speedLevel: {
              fieldNumber: 6;
              valueType: "varint";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 23;
     };
     type: "fan";
  };
  infrared: {
     command: {
        deviceIdFieldNumber: 1;
        fields: {
           carrierFrequency: {
              fieldNumber: 3;
              valueType: "varint";
              wireType: 0;
           };
           modulation: {
              fieldNumber: 6;
              valueType: "varint";
              wireType: 0;
           };
           repeatCount: {
              fieldNumber: 4;
              valueType: "varint";
              wireType: 0;
           };
           timings: {
              fieldNumber: 5;
              valueType: "sint32-packed";
              wireType: 2;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 2;
        messageType: 136;
     };
     listEntities: {
        deviceIdFieldNumber: 7;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           capabilities: {
              fieldNumber: 8;
              valueType: "varint";
              wireType: 0;
           };
           disabledByDefault: {
              fieldNumber: 5;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 6;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 4;
              valueType: "string";
              wireType: 2;
           };
           receiverFrequency: {
              fieldNumber: 9;
              valueType: "varint";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 135;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 1;
        fields: {
           timings: {
              fieldNumber: 3;
              valueType: "sint32-packed";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 137;
     };
     type: "infrared";
  };
  light: {
     command: {
        deviceIdFieldNumber: 28;
        fields: {
           blue: {
              fieldNumber: 9;
              valueType: "float";
              wireType: 5;
           };
           green: {
              fieldNumber: 8;
              valueType: "float";
              wireType: 5;
           };
           hasRgb: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           red: {
              fieldNumber: 7;
              valueType: "float";
              wireType: 5;
           };
        };
        hasPatternFields: {
           brightness: {
              hasFieldNumber: 4;
              valueFieldNumber: 5;
              valueType: "float";
              wireType: 5;
           };
           coldWhite: {
              hasFieldNumber: 24;
              valueFieldNumber: 25;
              valueType: "float";
              wireType: 5;
           };
           colorBrightness: {
              hasFieldNumber: 20;
              valueFieldNumber: 21;
              valueType: "float";
              wireType: 5;
           };
           colorMode: {
              hasFieldNumber: 22;
              valueFieldNumber: 23;
              valueType: "enum";
              wireType: 0;
           };
           colorTemperature: {
              hasFieldNumber: 12;
              valueFieldNumber: 13;
              valueType: "float";
              wireType: 5;
           };
           effect: {
              hasFieldNumber: 18;
              valueFieldNumber: 19;
              valueType: "string";
              wireType: 2;
           };
           flashLength: {
              hasFieldNumber: 16;
              valueFieldNumber: 17;
              valueType: "varint";
              wireType: 0;
           };
           state: {
              hasFieldNumber: 2;
              valueFieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           transitionLength: {
              hasFieldNumber: 14;
              valueFieldNumber: 15;
              valueType: "varint";
              wireType: 0;
           };
           warmWhite: {
              hasFieldNumber: 26;
              valueFieldNumber: 27;
              valueType: "float";
              wireType: 5;
           };
           white: {
              hasFieldNumber: 10;
              valueFieldNumber: 11;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 32;
     };
     listEntities: {
        deviceIdFieldNumber: 16;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
           supportedColorModes: {
              BRIGHTNESS: 3;
              COLD_WARM_WHITE: 19;
              COLOR_TEMPERATURE: 11;
              ON_OFF: 1;
              RGB: 35;
              RGB_COLD_WARM_WHITE: 51;
              RGB_COLOR_TEMPERATURE: 47;
              RGB_WHITE: 39;
              UNKNOWN: 0;
              WHITE: 7;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 13;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 15;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 14;
              valueType: "string";
              wireType: 2;
           };
           maxMireds: {
              fieldNumber: 10;
              valueType: "float";
              wireType: 5;
           };
           minMireds: {
              fieldNumber: 9;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 2;
        messageType: 15;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        repeatedFields: {
           effects: {
              fieldNumber: 11;
              valueType: "string";
              wireType: 2;
           };
           supportedColorModes: {
              fieldNumber: 12;
              valueType: "enum";
              wireType: 0;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 14;
        enumMappings: {
           colorMode: {
              BRIGHTNESS: 3;
              COLD_WARM_WHITE: 19;
              COLOR_TEMPERATURE: 11;
              ON_OFF: 1;
              RGB: 35;
              RGB_COLD_WARM_WHITE: 51;
              RGB_COLOR_TEMPERATURE: 47;
              RGB_WHITE: 39;
              UNKNOWN: 0;
              WHITE: 7;
           };
        };
        fields: {
           blue: {
              fieldNumber: 6;
              valueType: "float";
              wireType: 5;
           };
           brightness: {
              fieldNumber: 3;
              valueType: "float";
              wireType: 5;
           };
           coldWhite: {
              fieldNumber: 12;
              valueType: "float";
              wireType: 5;
           };
           colorBrightness: {
              fieldNumber: 10;
              valueType: "float";
              wireType: 5;
           };
           colorMode: {
              fieldNumber: 11;
              valueType: "enum";
              wireType: 0;
           };
           colorTemperature: {
              fieldNumber: 8;
              valueType: "float";
              wireType: 5;
           };
           effect: {
              fieldNumber: 9;
              valueType: "string";
              wireType: 2;
           };
           green: {
              fieldNumber: 5;
              valueType: "float";
              wireType: 5;
           };
           red: {
              fieldNumber: 4;
              valueType: "float";
              wireType: 5;
           };
           state: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
           warmWhite: {
              fieldNumber: 13;
              valueType: "float";
              wireType: 5;
           };
           white: {
              fieldNumber: 7;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 24;
     };
     type: "light";
  };
  lock: {
     command: {
        deviceIdFieldNumber: 5;
        enumMappings: {
           command: {
              lock: 1;
              open: 2;
              unlock: 0;
           };
        };
        fields: {
           command: {
              fieldNumber: 2;
              valueType: "enum";
              wireType: 0;
           };
        };
        hasPatternFields: {
           code: {
              hasFieldNumber: 3;
              valueFieldNumber: 4;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 1;
        messageType: 60;
     };
     listEntities: {
        deviceIdFieldNumber: 12;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           assumedState: {
              fieldNumber: 8;
              valueType: "bool";
              wireType: 0;
           };
           codeFormat: {
              fieldNumber: 11;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           requiresCode: {
              fieldNumber: 10;
              valueType: "bool";
              wireType: 0;
           };
           supportsOpen: {
              fieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 58;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 3;
        enumMappings: {
           state: {
              JAMMED: 3;
              LOCKED: 1;
              LOCKING: 4;
              NONE: 0;
              OPEN: 7;
              OPENING: 6;
              UNLOCKED: 2;
              UNLOCKING: 5;
           };
        };
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "enum";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 59;
     };
     type: "lock";
  };
  media_player: {
     command: {
        deviceIdFieldNumber: 10;
        fields: {
        };
        hasPatternFields: {
           announcement: {
              hasFieldNumber: 8;
              valueFieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
           command: {
              hasFieldNumber: 2;
              valueFieldNumber: 3;
              valueType: "enum";
              wireType: 0;
           };
           mediaUrl: {
              hasFieldNumber: 6;
              valueFieldNumber: 7;
              valueType: "string";
              wireType: 2;
           };
           volume: {
              hasFieldNumber: 4;
              valueFieldNumber: 5;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 65;
     };
     listEntities: {
        deviceIdFieldNumber: 10;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           featureFlags: {
              fieldNumber: 11;
              valueType: "varint";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           supportsPause: {
              fieldNumber: 8;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 63;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        repeatedMessageFields: {
           supportedFormats: {
              enumMappings: {
                 purpose: {
                    ANNOUNCEMENT: 1;
                    DEFAULT: 0;
                 };
              };
              fieldNumber: 9;
              fields: {
                 format: {
                    fieldNumber: 1;
                    valueType: "string";
                    wireType: 2;
                 };
                 numChannels: {
                    fieldNumber: 3;
                    valueType: "varint";
                    wireType: 0;
                 };
                 purpose: {
                    fieldNumber: 4;
                    valueType: "enum";
                    wireType: 0;
                 };
                 sampleBytes: {
                    fieldNumber: 5;
                    valueType: "varint";
                    wireType: 0;
                 };
                 sampleRate: {
                    fieldNumber: 2;
                    valueType: "varint";
                    wireType: 0;
                 };
              };
              wireType: 2;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 5;
        enumMappings: {
           state: {
              ANNOUNCING: 4;
              IDLE: 1;
              NONE: 0;
              OFF: 5;
              ON: 6;
              PAUSED: 3;
              PLAYING: 2;
           };
        };
        fields: {
           muted: {
              fieldNumber: 4;
              valueType: "bool";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "enum";
              wireType: 0;
           };
           volume: {
              fieldNumber: 3;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 64;
     };
     type: "media_player";
  };
  number: {
     command: {
        deviceIdFieldNumber: 3;
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "float";
              wireType: 5;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 51;
     };
     listEntities: {
        deviceIdFieldNumber: 14;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
           mode: {
              AUTO: 0;
              BOX: 1;
              SLIDER: 2;
           };
        };
        fields: {
           deviceClass: {
              fieldNumber: 13;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 10;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           maxValue: {
              fieldNumber: 7;
              valueType: "float";
              wireType: 5;
           };
           minValue: {
              fieldNumber: 6;
              valueType: "float";
              wireType: 5;
           };
           mode: {
              fieldNumber: 12;
              valueType: "enum";
              wireType: 0;
           };
           step: {
              fieldNumber: 8;
              valueType: "float";
              wireType: 5;
           };
           unitOfMeasurement: {
              fieldNumber: 11;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 49;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           missingState: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 50;
     };
     type: "number";
  };
  radio_frequency: {
     command: {
        deviceIdFieldNumber: 1;
        fields: {
           carrierFrequency: {
              fieldNumber: 3;
              valueType: "varint";
              wireType: 0;
           };
           modulation: {
              fieldNumber: 6;
              valueType: "varint";
              wireType: 0;
           };
           repeatCount: {
              fieldNumber: 4;
              valueType: "varint";
              wireType: 0;
           };
           timings: {
              fieldNumber: 5;
              valueType: "sint32-packed";
              wireType: 2;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 2;
        messageType: 136;
     };
     listEntities: {
        deviceIdFieldNumber: 7;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           capabilities: {
              fieldNumber: 8;
              valueType: "varint";
              wireType: 0;
           };
           disabledByDefault: {
              fieldNumber: 5;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 6;
              valueType: "enum";
              wireType: 0;
           };
           frequencyMax: {
              fieldNumber: 10;
              valueType: "varint";
              wireType: 0;
           };
           frequencyMin: {
              fieldNumber: 9;
              valueType: "varint";
              wireType: 0;
           };
           icon: {
              fieldNumber: 4;
              valueType: "string";
              wireType: 2;
           };
           supportedModulations: {
              fieldNumber: 11;
              valueType: "varint";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 148;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 1;
        fields: {
           timings: {
              fieldNumber: 3;
              valueType: "sint32-packed";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 137;
     };
     type: "radio_frequency";
  };
  select: {
     command: {
        deviceIdFieldNumber: 3;
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "string";
              wireType: 2;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 54;
     };
     listEntities: {
        deviceIdFieldNumber: 9;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 7;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 8;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 52;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        repeatedFields: {
           options: {
              fieldNumber: 6;
              valueType: "string";
              wireType: 2;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           missingState: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 1;
        messageType: 53;
     };
     type: "select";
  };
  sensor: {
     listEntities: {
        deviceIdFieldNumber: 14;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
           stateClass: {
              MEASUREMENT: 1;
              MEASUREMENT_ANGLE: 4;
              NONE: 0;
              TOTAL: 3;
              TOTAL_INCREASING: 2;
           };
        };
        fields: {
           accuracyDecimals: {
              fieldNumber: 7;
              valueType: "varint";
              wireType: 0;
           };
           deviceClass: {
              fieldNumber: 9;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 12;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 13;
              valueType: "enum";
              wireType: 0;
           };
           forceUpdate: {
              fieldNumber: 8;
              valueType: "bool";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           stateClass: {
              fieldNumber: 10;
              valueType: "enum";
              wireType: 0;
           };
           unitOfMeasurement: {
              fieldNumber: 6;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 16;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           missingState: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 25;
     };
     type: "sensor";
  };
  siren: {
     command: {
        deviceIdFieldNumber: 10;
        fields: {
        };
        hasPatternFields: {
           duration: {
              hasFieldNumber: 6;
              valueFieldNumber: 7;
              valueType: "varint";
              wireType: 0;
           };
           state: {
              hasFieldNumber: 2;
              valueFieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           tone: {
              hasFieldNumber: 4;
              valueFieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           volume: {
              hasFieldNumber: 8;
              valueFieldNumber: 9;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 57;
     };
     listEntities: {
        deviceIdFieldNumber: 11;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 10;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           supportsDuration: {
              fieldNumber: 8;
              valueType: "bool";
              wireType: 0;
           };
           supportsVolume: {
              fieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 55;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        repeatedFields: {
           tones: {
              fieldNumber: 7;
              valueType: "string";
              wireType: 2;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 3;
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 56;
     };
     type: "siren";
  };
  switch: {
     command: {
        deviceIdFieldNumber: 3;
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 33;
     };
     listEntities: {
        deviceIdFieldNumber: 10;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           assumedState: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           deviceClass: {
              fieldNumber: 9;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 7;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 8;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 17;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 3;
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 26;
     };
     type: "switch";
  };
  text: {
     command: {
        deviceIdFieldNumber: 3;
        fields: {
           state: {
              fieldNumber: 2;
              valueType: "string";
              wireType: 2;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 99;
     };
     listEntities: {
        deviceIdFieldNumber: 12;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
           mode: {
              PASSWORD: 1;
              TEXT: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           maxLength: {
              fieldNumber: 9;
              valueType: "varint";
              wireType: 0;
           };
           minLength: {
              fieldNumber: 8;
              valueType: "varint";
              wireType: 0;
           };
           mode: {
              fieldNumber: 11;
              valueType: "enum";
              wireType: 0;
           };
           pattern: {
              fieldNumber: 10;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 97;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           missingState: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 1;
        messageType: 98;
     };
     type: "text";
  };
  text_sensor: {
     listEntities: {
        deviceIdFieldNumber: 9;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           deviceClass: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 18;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        fields: {
           missingState: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           state: {
              fieldNumber: 2;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 1;
        messageType: 27;
     };
     type: "text_sensor";
  };
  time: {
     command: {
        deviceIdFieldNumber: 5;
        fields: {
           hour: {
              fieldNumber: 2;
              valueType: "varint";
              wireType: 0;
           };
           minute: {
              fieldNumber: 3;
              valueType: "varint";
              wireType: 0;
           };
           second: {
              fieldNumber: 4;
              valueType: "varint";
              wireType: 0;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 105;
     };
     listEntities: {
        deviceIdFieldNumber: 8;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 103;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 6;
        fields: {
           hour: {
              fieldNumber: 3;
              valueType: "varint";
              wireType: 0;
           };
           minute: {
              fieldNumber: 4;
              valueType: "varint";
              wireType: 0;
           };
           missingState: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
           second: {
              fieldNumber: 5;
              valueType: "varint";
              wireType: 0;
           };
        };
        keyFieldNumber: 1;
        messageType: 104;
     };
     type: "time";
  };
  update: {
     command: {
        deviceIdFieldNumber: 3;
        enumMappings: {
           command: {
              check: 2;
              none: 0;
              update: 1;
           };
        };
        fields: {
           command: {
              fieldNumber: 2;
              valueType: "enum";
              wireType: 0;
           };
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 118;
     };
     listEntities: {
        deviceIdFieldNumber: 9;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           deviceClass: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 2;
        messageType: 116;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 11;
        fields: {
           currentVersion: {
              fieldNumber: 6;
              valueType: "string";
              wireType: 2;
           };
           hasProgress: {
              fieldNumber: 4;
              valueType: "bool";
              wireType: 0;
           };
           inProgress: {
              fieldNumber: 3;
              valueType: "bool";
              wireType: 0;
           };
           latestVersion: {
              fieldNumber: 7;
              valueType: "string";
              wireType: 2;
           };
           missingState: {
              fieldNumber: 2;
              valueType: "bool";
              wireType: 0;
           };
           progress: {
              fieldNumber: 5;
              valueType: "float";
              wireType: 5;
           };
           releaseSummary: {
              fieldNumber: 9;
              valueType: "string";
              wireType: 2;
           };
           releaseUrl: {
              fieldNumber: 10;
              valueType: "string";
              wireType: 2;
           };
           title: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
        };
        keyFieldNumber: 1;
        messageType: 117;
     };
     type: "update";
  };
  valve: {
     command: {
        deviceIdFieldNumber: 5;
        fields: {
           stop: {
              fieldNumber: 4;
              valueType: "bool";
              wireType: 0;
           };
        };
        hasPatternFields: {
           position: {
              hasFieldNumber: 2;
              valueFieldNumber: 3;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 111;
     };
     listEntities: {
        deviceIdFieldNumber: 12;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
        };
        fields: {
           assumedState: {
              fieldNumber: 9;
              valueType: "bool";
              wireType: 0;
           };
           deviceClass: {
              fieldNumber: 8;
              valueType: "string";
              wireType: 2;
           };
           disabledByDefault: {
              fieldNumber: 6;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 7;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 5;
              valueType: "string";
              wireType: 2;
           };
           supportsPosition: {
              fieldNumber: 10;
              valueType: "bool";
              wireType: 0;
           };
           supportsStop: {
              fieldNumber: 11;
              valueType: "bool";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 109;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
     };
     state: {
        deviceIdFieldNumber: 4;
        enumMappings: {
           currentOperation: {
              IDLE: 0;
              IS_CLOSING: 2;
              IS_OPENING: 1;
           };
        };
        fields: {
           currentOperation: {
              fieldNumber: 3;
              valueType: "enum";
              wireType: 0;
           };
           position: {
              fieldNumber: 2;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 110;
     };
     type: "valve";
  };
  water_heater: {
     command: {
        bitmaskFieldNumber: 2;
        bitmaskFields: {
           mode: {
              bit: 1;
              fieldNumber: 3;
              valueType: "enum";
              wireType: 0;
           };
           targetTemperature: {
              bit: 2;
              fieldNumber: 4;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureHigh: {
              bit: 16;
              fieldNumber: 8;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureLow: {
              bit: 8;
              fieldNumber: 7;
              valueType: "float";
              wireType: 5;
           };
        };
        deviceIdFieldNumber: 5;
        enumMappings: {
           mode: {
              eco: 1;
              electric: 2;
              gas: 6;
              heat_pump: 5;
              high_demand: 4;
              off: 0;
              performance: 3;
           };
        };
        fields: {
        };
        hasPatternFields: {
        };
        keyFieldNumber: 1;
        messageType: 134;
        packedBitsFields: {
           state: {
              bits: {
                 awayState: {
                    bit: 1;
                    hasFieldBit: 64;
                 };
                 onState: {
                    bit: 2;
                    hasFieldBit: 32;
                 };
              };
              fieldNumber: 6;
              wireType: 0;
           };
        };
     };
     listEntities: {
        deviceIdFieldNumber: 7;
        enumMappings: {
           entityCategory: {
              CONFIG: 1;
              DIAGNOSTIC: 2;
              NONE: 0;
           };
           supportedModes: {
              ECO: 1;
              ELECTRIC: 2;
              GAS: 6;
              HEAT_PUMP: 5;
              HIGH_DEMAND: 4;
              OFF: 0;
              PERFORMANCE: 3;
           };
           temperatureUnit: {
              CELSIUS: 0;
              FAHRENHEIT: 1;
              KELVIN: 2;
           };
        };
        fields: {
           disabledByDefault: {
              fieldNumber: 5;
              valueType: "bool";
              wireType: 0;
           };
           entityCategory: {
              fieldNumber: 6;
              valueType: "enum";
              wireType: 0;
           };
           icon: {
              fieldNumber: 4;
              valueType: "string";
              wireType: 2;
           };
           maxTemperature: {
              fieldNumber: 9;
              valueType: "float";
              wireType: 5;
           };
           minTemperature: {
              fieldNumber: 8;
              valueType: "float";
              wireType: 5;
           };
           supportedFeatures: {
              fieldNumber: 12;
              valueType: "varint";
              wireType: 0;
           };
           targetTemperatureStep: {
              fieldNumber: 10;
              valueType: "float";
              wireType: 5;
           };
           temperatureUnit: {
              fieldNumber: 13;
              valueType: "enum";
              wireType: 0;
           };
        };
        keyFieldNumber: 2;
        messageType: 132;
        nameFieldNumber: 3;
        objectIdFieldNumber: 1;
        repeatedFields: {
           supportedModes: {
              fieldNumber: 11;
              valueType: "enum";
              wireType: 0;
           };
        };
     };
     state: {
        deviceIdFieldNumber: 5;
        enumMappings: {
           mode: {
              ECO: 1;
              ELECTRIC: 2;
              GAS: 6;
              HEAT_PUMP: 5;
              HIGH_DEMAND: 4;
              OFF: 0;
              PERFORMANCE: 3;
           };
        };
        fields: {
           currentTemperature: {
              fieldNumber: 2;
              valueType: "float";
              wireType: 5;
           };
           mode: {
              fieldNumber: 4;
              valueType: "enum";
              wireType: 0;
           };
           targetTemperature: {
              fieldNumber: 3;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureHigh: {
              fieldNumber: 8;
              valueType: "float";
              wireType: 5;
           };
           targetTemperatureLow: {
              fieldNumber: 7;
              valueType: "float";
              wireType: 5;
           };
        };
        keyFieldNumber: 1;
        messageType: 133;
        packedBitsFields: {
           state: {
              bits: {
                 awayState: {
                    bit: 1;
                 };
                 onState: {
                    bit: 2;
                 };
              };
              fieldNumber: 6;
              wireType: 0;
           };
        };
     };
     type: "water_heater";
  };
};
```

Schema definitions for every supported ESPHome entity type. Each schema provides the complete field mapping for encoding commands and decoding state responses.

The `as const satisfies` pattern serves two purposes simultaneously: `satisfies Record<string, EntitySchema>` validates at compile time that every schema conforms to
the EntitySchema shape, while `as const` preserves the literal types of every key, message ID, and enum mapping. This enables consumers to derive narrower types from
the schema (for example, `keyof typeof ENTITY_SCHEMAS` is the canonical EntityType union) without a parallel hand-maintained list that could drift.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-alarm_control_panel"></a> `alarm_control_panel` | \{ `command`: \{ `deviceIdFieldNumber`: `4`; `enumMappings`: \{ `command`: \{ `arm_away`: `1`; `arm_custom_bypass`: `5`; `arm_home`: `2`; `arm_night`: `3`; `arm_vacation`: `4`; `disarm`: `0`; `trigger`: `6`; \}; \}; `fields`: \{ `code`: \{ `fieldNumber`: `3`; `valueType`: `"string"`; `wireType`: `2`; \}; `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `96`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `11`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `requiresCodeToArm`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportedFeatures`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `94`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `state`: \{ `ARMED_AWAY`: `2`; `ARMED_CUSTOM_BYPASS`: `5`; `ARMED_HOME`: `1`; `ARMED_NIGHT`: `3`; `ARMED_VACATION`: `4`; `ARMING`: `7`; `DISARMED`: `0`; `DISARMING`: `8`; `PENDING`: `6`; `TRIGGERED`: `9`; \}; \}; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `95`; \}; `type`: `"alarm_control_panel"`; \} | - |
| `alarm_control_panel.command` | \{ `deviceIdFieldNumber`: `4`; `enumMappings`: \{ `command`: \{ `arm_away`: `1`; `arm_custom_bypass`: `5`; `arm_home`: `2`; `arm_night`: `3`; `arm_vacation`: `4`; `disarm`: `0`; `trigger`: `6`; \}; \}; `fields`: \{ `code`: \{ `fieldNumber`: `3`; `valueType`: `"string"`; `wireType`: `2`; \}; `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `96`; \} | - |
| `alarm_control_panel.command.deviceIdFieldNumber` | `4` | `4` |
| `alarm_control_panel.command.enumMappings` | \{ `command`: \{ `arm_away`: `1`; `arm_custom_bypass`: `5`; `arm_home`: `2`; `arm_night`: `3`; `arm_vacation`: `4`; `disarm`: `0`; `trigger`: `6`; \}; \} | - |
| `alarm_control_panel.command.enumMappings.command` | \{ `arm_away`: `1`; `arm_custom_bypass`: `5`; `arm_home`: `2`; `arm_night`: `3`; `arm_vacation`: `4`; `disarm`: `0`; `trigger`: `6`; \} | - |
| `alarm_control_panel.command.enumMappings.command.arm_away` | `1` | `1` |
| `alarm_control_panel.command.enumMappings.command.arm_custom_bypass` | `5` | `5` |
| `alarm_control_panel.command.enumMappings.command.arm_home` | `2` | `2` |
| `alarm_control_panel.command.enumMappings.command.arm_night` | `3` | `3` |
| `alarm_control_panel.command.enumMappings.command.arm_vacation` | `4` | `4` |
| `alarm_control_panel.command.enumMappings.command.disarm` | `0` | `0` |
| `alarm_control_panel.command.enumMappings.command.trigger` | `6` | `6` |
| `alarm_control_panel.command.fields` | \{ `code`: \{ `fieldNumber`: `3`; `valueType`: `"string"`; `wireType`: `2`; \}; `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `alarm_control_panel.command.fields.code` | \{ `fieldNumber`: `3`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `alarm_control_panel.command.fields.code.fieldNumber` | `3` | `3` |
| `alarm_control_panel.command.fields.code.valueType` | `"string"` | `"string"` |
| `alarm_control_panel.command.fields.code.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `alarm_control_panel.command.fields.command` | \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `alarm_control_panel.command.fields.command.fieldNumber` | `2` | `2` |
| `alarm_control_panel.command.fields.command.valueType` | `"enum"` | `"enum"` |
| `alarm_control_panel.command.fields.command.wireType` | `0` | `WireType.VARINT` |
| `alarm_control_panel.command.hasPatternFields` | \{ \} | `{}` |
| `alarm_control_panel.command.keyFieldNumber` | `1` | `1` |
| `alarm_control_panel.command.messageType` | `96` | `MessageType.ALARM_CONTROL_PANEL_COMMAND_REQUEST` |
| `alarm_control_panel.listEntities` | \{ `deviceIdFieldNumber`: `11`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `requiresCodeToArm`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportedFeatures`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `94`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `alarm_control_panel.listEntities.deviceIdFieldNumber` | `11` | `11` |
| `alarm_control_panel.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `alarm_control_panel.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `alarm_control_panel.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `alarm_control_panel.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `alarm_control_panel.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `alarm_control_panel.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `requiresCodeToArm`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportedFeatures`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `alarm_control_panel.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `alarm_control_panel.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `alarm_control_panel.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `alarm_control_panel.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `alarm_control_panel.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `alarm_control_panel.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `alarm_control_panel.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `alarm_control_panel.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `alarm_control_panel.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `alarm_control_panel.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `alarm_control_panel.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `alarm_control_panel.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `alarm_control_panel.listEntities.fields.requiresCode` | \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `alarm_control_panel.listEntities.fields.requiresCode.fieldNumber` | `9` | `9` |
| `alarm_control_panel.listEntities.fields.requiresCode.valueType` | `"bool"` | `"bool"` |
| `alarm_control_panel.listEntities.fields.requiresCode.wireType` | `0` | `WireType.VARINT` |
| `alarm_control_panel.listEntities.fields.requiresCodeToArm` | \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `alarm_control_panel.listEntities.fields.requiresCodeToArm.fieldNumber` | `10` | `10` |
| `alarm_control_panel.listEntities.fields.requiresCodeToArm.valueType` | `"bool"` | `"bool"` |
| `alarm_control_panel.listEntities.fields.requiresCodeToArm.wireType` | `0` | `WireType.VARINT` |
| `alarm_control_panel.listEntities.fields.supportedFeatures` | \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `alarm_control_panel.listEntities.fields.supportedFeatures.fieldNumber` | `8` | `8` |
| `alarm_control_panel.listEntities.fields.supportedFeatures.valueType` | `"varint"` | `"varint"` |
| `alarm_control_panel.listEntities.fields.supportedFeatures.wireType` | `0` | `WireType.VARINT` |
| `alarm_control_panel.listEntities.keyFieldNumber` | `2` | `2` |
| `alarm_control_panel.listEntities.messageType` | `94` | `MessageType.LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE` |
| `alarm_control_panel.listEntities.nameFieldNumber` | `3` | `3` |
| `alarm_control_panel.listEntities.objectIdFieldNumber` | `1` | `1` |
| `alarm_control_panel.state` | \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `state`: \{ `ARMED_AWAY`: `2`; `ARMED_CUSTOM_BYPASS`: `5`; `ARMED_HOME`: `1`; `ARMED_NIGHT`: `3`; `ARMED_VACATION`: `4`; `ARMING`: `7`; `DISARMED`: `0`; `DISARMING`: `8`; `PENDING`: `6`; `TRIGGERED`: `9`; \}; \}; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `95`; \} | - |
| `alarm_control_panel.state.deviceIdFieldNumber` | `3` | `3` |
| `alarm_control_panel.state.enumMappings` | \{ `state`: \{ `ARMED_AWAY`: `2`; `ARMED_CUSTOM_BYPASS`: `5`; `ARMED_HOME`: `1`; `ARMED_NIGHT`: `3`; `ARMED_VACATION`: `4`; `ARMING`: `7`; `DISARMED`: `0`; `DISARMING`: `8`; `PENDING`: `6`; `TRIGGERED`: `9`; \}; \} | - |
| `alarm_control_panel.state.enumMappings.state` | \{ `ARMED_AWAY`: `2`; `ARMED_CUSTOM_BYPASS`: `5`; `ARMED_HOME`: `1`; `ARMED_NIGHT`: `3`; `ARMED_VACATION`: `4`; `ARMING`: `7`; `DISARMED`: `0`; `DISARMING`: `8`; `PENDING`: `6`; `TRIGGERED`: `9`; \} | `AlarmControlPanelState` |
| `alarm_control_panel.state.enumMappings.state.ARMED_AWAY` | `2` | `2` |
| `alarm_control_panel.state.enumMappings.state.ARMED_CUSTOM_BYPASS` | `5` | `5` |
| `alarm_control_panel.state.enumMappings.state.ARMED_HOME` | `1` | `1` |
| `alarm_control_panel.state.enumMappings.state.ARMED_NIGHT` | `3` | `3` |
| `alarm_control_panel.state.enumMappings.state.ARMED_VACATION` | `4` | `4` |
| `alarm_control_panel.state.enumMappings.state.ARMING` | `7` | `7` |
| `alarm_control_panel.state.enumMappings.state.DISARMED` | `0` | `0` |
| `alarm_control_panel.state.enumMappings.state.DISARMING` | `8` | `8` |
| `alarm_control_panel.state.enumMappings.state.PENDING` | `6` | `6` |
| `alarm_control_panel.state.enumMappings.state.TRIGGERED` | `9` | `9` |
| `alarm_control_panel.state.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `alarm_control_panel.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `alarm_control_panel.state.fields.state.fieldNumber` | `2` | `2` |
| `alarm_control_panel.state.fields.state.valueType` | `"enum"` | `"enum"` |
| `alarm_control_panel.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `alarm_control_panel.state.keyFieldNumber` | `1` | `1` |
| `alarm_control_panel.state.messageType` | `95` | `MessageType.ALARM_CONTROL_PANEL_STATE_RESPONSE` |
| `alarm_control_panel.type` | `"alarm_control_panel"` | `"alarm_control_panel"` |
| <a id="property-binary_sensor"></a> `binary_sensor` | \{ `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `isStatusBinarySensor`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `12`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `21`; \}; `type`: `"binary_sensor"`; \} | - |
| `binary_sensor.listEntities` | \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `isStatusBinarySensor`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `12`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `binary_sensor.listEntities.deviceIdFieldNumber` | `10` | `10` |
| `binary_sensor.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `binary_sensor.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `binary_sensor.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `binary_sensor.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `binary_sensor.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `binary_sensor.listEntities.fields` | \{ `deviceClass`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `isStatusBinarySensor`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `binary_sensor.listEntities.fields.deviceClass` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `binary_sensor.listEntities.fields.deviceClass.fieldNumber` | `5` | `5` |
| `binary_sensor.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `binary_sensor.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `binary_sensor.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `binary_sensor.listEntities.fields.disabledByDefault.fieldNumber` | `7` | `7` |
| `binary_sensor.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `binary_sensor.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `binary_sensor.listEntities.fields.entityCategory` | \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `binary_sensor.listEntities.fields.entityCategory.fieldNumber` | `9` | `9` |
| `binary_sensor.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `binary_sensor.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `binary_sensor.listEntities.fields.icon` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `binary_sensor.listEntities.fields.icon.fieldNumber` | `8` | `8` |
| `binary_sensor.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `binary_sensor.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `binary_sensor.listEntities.fields.isStatusBinarySensor` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `binary_sensor.listEntities.fields.isStatusBinarySensor.fieldNumber` | `6` | `6` |
| `binary_sensor.listEntities.fields.isStatusBinarySensor.valueType` | `"bool"` | `"bool"` |
| `binary_sensor.listEntities.fields.isStatusBinarySensor.wireType` | `0` | `WireType.VARINT` |
| `binary_sensor.listEntities.keyFieldNumber` | `2` | `2` |
| `binary_sensor.listEntities.messageType` | `12` | `MessageType.LIST_ENTITIES_BINARY_SENSOR_RESPONSE` |
| `binary_sensor.listEntities.nameFieldNumber` | `3` | `3` |
| `binary_sensor.listEntities.objectIdFieldNumber` | `1` | `1` |
| `binary_sensor.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `21`; \} | - |
| `binary_sensor.state.deviceIdFieldNumber` | `4` | `4` |
| `binary_sensor.state.fields` | \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `binary_sensor.state.fields.missingState` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `binary_sensor.state.fields.missingState.fieldNumber` | `3` | `3` |
| `binary_sensor.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `binary_sensor.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `binary_sensor.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `binary_sensor.state.fields.state.fieldNumber` | `2` | `2` |
| `binary_sensor.state.fields.state.valueType` | `"bool"` | `"bool"` |
| `binary_sensor.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `binary_sensor.state.keyFieldNumber` | `1` | `1` |
| `binary_sensor.state.messageType` | `21` | `MessageType.BINARY_SENSOR_STATE_RESPONSE` |
| `binary_sensor.type` | `"binary_sensor"` | `"binary_sensor"` |
| <a id="property-button"></a> `button` | \{ `command`: \{ `deviceIdFieldNumber`: `2`; `fields`: \{ \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `62`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `61`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `0`; `fields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `0`; \}; `type`: `"button"`; \} | - |
| `button.command` | \{ `deviceIdFieldNumber`: `2`; `fields`: \{ \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `62`; \} | - |
| `button.command.deviceIdFieldNumber` | `2` | `2` |
| `button.command.fields` | \{ \} | `{}` |
| `button.command.hasPatternFields` | \{ \} | `{}` |
| `button.command.keyFieldNumber` | `1` | `1` |
| `button.command.messageType` | `62` | `MessageType.BUTTON_COMMAND_REQUEST` |
| `button.listEntities` | \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `61`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `button.listEntities.deviceIdFieldNumber` | `9` | `9` |
| `button.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `button.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `button.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `button.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `button.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `button.listEntities.fields` | \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `button.listEntities.fields.deviceClass` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `button.listEntities.fields.deviceClass.fieldNumber` | `8` | `8` |
| `button.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `button.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `button.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `button.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `button.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `button.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `button.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `button.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `button.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `button.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `button.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `button.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `button.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `button.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `button.listEntities.keyFieldNumber` | `2` | `2` |
| `button.listEntities.messageType` | `61` | `MessageType.LIST_ENTITIES_BUTTON_RESPONSE` |
| `button.listEntities.nameFieldNumber` | `3` | `3` |
| `button.listEntities.objectIdFieldNumber` | `1` | `1` |
| `button.state` | \{ `deviceIdFieldNumber`: `0`; `fields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `0`; \} | - |
| `button.state.deviceIdFieldNumber` | `0` | `0` |
| `button.state.fields` | \{ \} | `{}` |
| `button.state.keyFieldNumber` | `1` | `1` |
| `button.state.messageType` | `0` | `0` |
| `button.type` | `"button"` | `"button"` |
| <a id="property-camera"></a> `camera` | \{ `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `43`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `data`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; `done`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `44`; \}; `type`: `"camera"`; \} | - |
| `camera.listEntities` | \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `43`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `camera.listEntities.deviceIdFieldNumber` | `8` | `8` |
| `camera.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `camera.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `camera.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `camera.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `camera.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `camera.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `camera.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `camera.listEntities.fields.disabledByDefault.fieldNumber` | `5` | `5` |
| `camera.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `camera.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `camera.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `camera.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `camera.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `camera.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `camera.listEntities.fields.icon` | \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `camera.listEntities.fields.icon.fieldNumber` | `6` | `6` |
| `camera.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `camera.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `camera.listEntities.keyFieldNumber` | `2` | `2` |
| `camera.listEntities.messageType` | `43` | `MessageType.LIST_ENTITIES_CAMERA_RESPONSE` |
| `camera.listEntities.nameFieldNumber` | `3` | `3` |
| `camera.listEntities.objectIdFieldNumber` | `1` | `1` |
| `camera.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `data`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; `done`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `44`; \} | - |
| `camera.state.deviceIdFieldNumber` | `4` | `4` |
| `camera.state.fields` | \{ `data`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; `done`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `camera.state.fields.data` | \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `camera.state.fields.data.fieldNumber` | `2` | `2` |
| `camera.state.fields.data.valueType` | `"string"` | `"string"` |
| `camera.state.fields.data.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `camera.state.fields.done` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `camera.state.fields.done.fieldNumber` | `3` | `3` |
| `camera.state.fields.done.valueType` | `"bool"` | `"bool"` |
| `camera.state.fields.done.wireType` | `0` | `WireType.VARINT` |
| `camera.state.keyFieldNumber` | `1` | `1` |
| `camera.state.messageType` | `44` | `MessageType.CAMERA_IMAGE_RESPONSE` |
| `camera.type` | `"camera"` | `"camera"` |
| <a id="property-climate"></a> `climate` | \{ `command`: \{ `deviceIdFieldNumber`: `24`; `enumMappings`: \{ `fanMode`: \{ `auto`: `2`; `diffuse`: `8`; `focus`: `7`; `high`: `5`; `low`: `3`; `medium`: `4`; `middle`: `6`; `off`: `1`; `on`: `0`; `quiet`: `9`; \}; `mode`: \{ `auto`: `6`; `cool`: `2`; `dry`: `5`; `fan_only`: `4`; `heat`: `3`; `heat_cool`: `1`; `off`: `0`; \}; `preset`: \{ `activity`: `7`; `away`: `2`; `boost`: `3`; `comfort`: `4`; `eco`: `5`; `home`: `1`; `none`: `0`; `sleep`: `6`; \}; `swingMode`: \{ `both`: `1`; `horizontal`: `3`; `off`: `0`; `vertical`: `2`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ `customFanMode`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `48`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `26`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedFanModes`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `supportedModes`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `supportedPresets`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `supportedSwingModes`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `18`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `20`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsAction`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentHumidity`: \{ `fieldNumber`: `22`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentTemperature`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTargetHumidity`: \{ `fieldNumber`: `23`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTwoPointTargetTemperature`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `temperatureUnit`: \{ `fieldNumber`: `28`; `valueType`: `"enum"`; `wireType`: `0`; \}; `visualCurrentTemperatureStep`: \{ `fieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxHumidity`: \{ `fieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinHumidity`: \{ `fieldNumber`: `24`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualTargetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `46`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `packedBitsFields`: \{ `featureFlags`: \{ `bits`: \{ `requiresTwoPointTargetTemperature`: \{ `bit`: `4`; \}; `supportsAction`: \{ `bit`: `32`; \}; `supportsCurrentHumidity`: \{ `bit`: `8`; \}; `supportsCurrentTemperature`: \{ `bit`: `1`; \}; `supportsTargetHumidity`: \{ `bit`: `16`; \}; `supportsTwoPointTargetTemperature`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `27`; `wireType`: `0`; \}; \}; `repeatedFields`: \{ `supportedCustomFanModes`: \{ `fieldNumber`: `15`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedCustomPresets`: \{ `fieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedFanModes`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedModes`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedPresets`: \{ `fieldNumber`: `16`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedSwingModes`: \{ `fieldNumber`: `14`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `16`; `enumMappings`: \{ `action`: \{ `COOLING`: `2`; `DRYING`: `5`; `FAN`: `6`; `HEATING`: `3`; `IDLE`: `4`; `OFF`: `0`; \}; `fanMode`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `mode`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `preset`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `swingMode`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; \}; `fields`: \{ `action`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `currentHumidity`: \{ `fieldNumber`: `14`; `valueType`: `"float"`; `wireType`: `5`; \}; `currentTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `customFanMode`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `fieldNumber`: `15`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `47`; \}; `type`: `"climate"`; \} | - |
| `climate.command` | \{ `deviceIdFieldNumber`: `24`; `enumMappings`: \{ `fanMode`: \{ `auto`: `2`; `diffuse`: `8`; `focus`: `7`; `high`: `5`; `low`: `3`; `medium`: `4`; `middle`: `6`; `off`: `1`; `on`: `0`; `quiet`: `9`; \}; `mode`: \{ `auto`: `6`; `cool`: `2`; `dry`: `5`; `fan_only`: `4`; `heat`: `3`; `heat_cool`: `1`; `off`: `0`; \}; `preset`: \{ `activity`: `7`; `away`: `2`; `boost`: `3`; `comfort`: `4`; `eco`: `5`; `home`: `1`; `none`: `0`; `sleep`: `6`; \}; `swingMode`: \{ `both`: `1`; `horizontal`: `3`; `off`: `0`; `vertical`: `2`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ `customFanMode`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `48`; \} | - |
| `climate.command.deviceIdFieldNumber` | `24` | `24` |
| `climate.command.enumMappings` | \{ `fanMode`: \{ `auto`: `2`; `diffuse`: `8`; `focus`: `7`; `high`: `5`; `low`: `3`; `medium`: `4`; `middle`: `6`; `off`: `1`; `on`: `0`; `quiet`: `9`; \}; `mode`: \{ `auto`: `6`; `cool`: `2`; `dry`: `5`; `fan_only`: `4`; `heat`: `3`; `heat_cool`: `1`; `off`: `0`; \}; `preset`: \{ `activity`: `7`; `away`: `2`; `boost`: `3`; `comfort`: `4`; `eco`: `5`; `home`: `1`; `none`: `0`; `sleep`: `6`; \}; `swingMode`: \{ `both`: `1`; `horizontal`: `3`; `off`: `0`; `vertical`: `2`; \}; \} | - |
| `climate.command.enumMappings.fanMode` | \{ `auto`: `2`; `diffuse`: `8`; `focus`: `7`; `high`: `5`; `low`: `3`; `medium`: `4`; `middle`: `6`; `off`: `1`; `on`: `0`; `quiet`: `9`; \} | - |
| `climate.command.enumMappings.fanMode.auto` | `2` | `2` |
| `climate.command.enumMappings.fanMode.diffuse` | `8` | `8` |
| `climate.command.enumMappings.fanMode.focus` | `7` | `7` |
| `climate.command.enumMappings.fanMode.high` | `5` | `5` |
| `climate.command.enumMappings.fanMode.low` | `3` | `3` |
| `climate.command.enumMappings.fanMode.medium` | `4` | `4` |
| `climate.command.enumMappings.fanMode.middle` | `6` | `6` |
| `climate.command.enumMappings.fanMode.off` | `1` | `1` |
| `climate.command.enumMappings.fanMode.on` | `0` | `0` |
| `climate.command.enumMappings.fanMode.quiet` | `9` | `9` |
| `climate.command.enumMappings.mode` | \{ `auto`: `6`; `cool`: `2`; `dry`: `5`; `fan_only`: `4`; `heat`: `3`; `heat_cool`: `1`; `off`: `0`; \} | - |
| `climate.command.enumMappings.mode.auto` | `6` | `6` |
| `climate.command.enumMappings.mode.cool` | `2` | `2` |
| `climate.command.enumMappings.mode.dry` | `5` | `5` |
| `climate.command.enumMappings.mode.fan_only` | `4` | `4` |
| `climate.command.enumMappings.mode.heat` | `3` | `3` |
| `climate.command.enumMappings.mode.heat_cool` | `1` | `1` |
| `climate.command.enumMappings.mode.off` | `0` | `0` |
| `climate.command.enumMappings.preset` | \{ `activity`: `7`; `away`: `2`; `boost`: `3`; `comfort`: `4`; `eco`: `5`; `home`: `1`; `none`: `0`; `sleep`: `6`; \} | - |
| `climate.command.enumMappings.preset.activity` | `7` | `7` |
| `climate.command.enumMappings.preset.away` | `2` | `2` |
| `climate.command.enumMappings.preset.boost` | `3` | `3` |
| `climate.command.enumMappings.preset.comfort` | `4` | `4` |
| `climate.command.enumMappings.preset.eco` | `5` | `5` |
| `climate.command.enumMappings.preset.home` | `1` | `1` |
| `climate.command.enumMappings.preset.none` | `0` | `0` |
| `climate.command.enumMappings.preset.sleep` | `6` | `6` |
| `climate.command.enumMappings.swingMode` | \{ `both`: `1`; `horizontal`: `3`; `off`: `0`; `vertical`: `2`; \} | - |
| `climate.command.enumMappings.swingMode.both` | `1` | `1` |
| `climate.command.enumMappings.swingMode.horizontal` | `3` | `3` |
| `climate.command.enumMappings.swingMode.off` | `0` | `0` |
| `climate.command.enumMappings.swingMode.vertical` | `2` | `2` |
| `climate.command.fields` | \{ \} | `{}` |
| `climate.command.hasPatternFields` | \{ `customFanMode`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `climate.command.hasPatternFields.customFanMode` | \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `climate.command.hasPatternFields.customFanMode.hasFieldNumber` | `16` | `16` |
| `climate.command.hasPatternFields.customFanMode.valueFieldNumber` | `17` | `17` |
| `climate.command.hasPatternFields.customFanMode.valueType` | `"string"` | `"string"` |
| `climate.command.hasPatternFields.customFanMode.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `climate.command.hasPatternFields.customPreset` | \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `climate.command.hasPatternFields.customPreset.hasFieldNumber` | `20` | `20` |
| `climate.command.hasPatternFields.customPreset.valueFieldNumber` | `21` | `21` |
| `climate.command.hasPatternFields.customPreset.valueType` | `"string"` | `"string"` |
| `climate.command.hasPatternFields.customPreset.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `climate.command.hasPatternFields.fanMode` | \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.command.hasPatternFields.fanMode.hasFieldNumber` | `12` | `12` |
| `climate.command.hasPatternFields.fanMode.valueFieldNumber` | `13` | `13` |
| `climate.command.hasPatternFields.fanMode.valueType` | `"enum"` | `"enum"` |
| `climate.command.hasPatternFields.fanMode.wireType` | `0` | `WireType.VARINT` |
| `climate.command.hasPatternFields.mode` | \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.command.hasPatternFields.mode.hasFieldNumber` | `2` | `2` |
| `climate.command.hasPatternFields.mode.valueFieldNumber` | `3` | `3` |
| `climate.command.hasPatternFields.mode.valueType` | `"enum"` | `"enum"` |
| `climate.command.hasPatternFields.mode.wireType` | `0` | `WireType.VARINT` |
| `climate.command.hasPatternFields.preset` | \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.command.hasPatternFields.preset.hasFieldNumber` | `18` | `18` |
| `climate.command.hasPatternFields.preset.valueFieldNumber` | `19` | `19` |
| `climate.command.hasPatternFields.preset.valueType` | `"enum"` | `"enum"` |
| `climate.command.hasPatternFields.preset.wireType` | `0` | `WireType.VARINT` |
| `climate.command.hasPatternFields.swingMode` | \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.command.hasPatternFields.swingMode.hasFieldNumber` | `14` | `14` |
| `climate.command.hasPatternFields.swingMode.valueFieldNumber` | `15` | `15` |
| `climate.command.hasPatternFields.swingMode.valueType` | `"enum"` | `"enum"` |
| `climate.command.hasPatternFields.swingMode.wireType` | `0` | `WireType.VARINT` |
| `climate.command.hasPatternFields.targetHumidity` | \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.command.hasPatternFields.targetHumidity.hasFieldNumber` | `22` | `22` |
| `climate.command.hasPatternFields.targetHumidity.valueFieldNumber` | `23` | `23` |
| `climate.command.hasPatternFields.targetHumidity.valueType` | `"float"` | `"float"` |
| `climate.command.hasPatternFields.targetHumidity.wireType` | `5` | `WireType.FIXED32` |
| `climate.command.hasPatternFields.targetTemperature` | \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.command.hasPatternFields.targetTemperature.hasFieldNumber` | `4` | `4` |
| `climate.command.hasPatternFields.targetTemperature.valueFieldNumber` | `5` | `5` |
| `climate.command.hasPatternFields.targetTemperature.valueType` | `"float"` | `"float"` |
| `climate.command.hasPatternFields.targetTemperature.wireType` | `5` | `WireType.FIXED32` |
| `climate.command.hasPatternFields.targetTemperatureHigh` | \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.command.hasPatternFields.targetTemperatureHigh.hasFieldNumber` | `8` | `8` |
| `climate.command.hasPatternFields.targetTemperatureHigh.valueFieldNumber` | `9` | `9` |
| `climate.command.hasPatternFields.targetTemperatureHigh.valueType` | `"float"` | `"float"` |
| `climate.command.hasPatternFields.targetTemperatureHigh.wireType` | `5` | `WireType.FIXED32` |
| `climate.command.hasPatternFields.targetTemperatureLow` | \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.command.hasPatternFields.targetTemperatureLow.hasFieldNumber` | `6` | `6` |
| `climate.command.hasPatternFields.targetTemperatureLow.valueFieldNumber` | `7` | `7` |
| `climate.command.hasPatternFields.targetTemperatureLow.valueType` | `"float"` | `"float"` |
| `climate.command.hasPatternFields.targetTemperatureLow.wireType` | `5` | `WireType.FIXED32` |
| `climate.command.keyFieldNumber` | `1` | `1` |
| `climate.command.messageType` | `48` | `MessageType.CLIMATE_COMMAND_REQUEST` |
| `climate.listEntities` | \{ `deviceIdFieldNumber`: `26`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedFanModes`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `supportedModes`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `supportedPresets`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `supportedSwingModes`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `18`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `20`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsAction`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentHumidity`: \{ `fieldNumber`: `22`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentTemperature`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTargetHumidity`: \{ `fieldNumber`: `23`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTwoPointTargetTemperature`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `temperatureUnit`: \{ `fieldNumber`: `28`; `valueType`: `"enum"`; `wireType`: `0`; \}; `visualCurrentTemperatureStep`: \{ `fieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxHumidity`: \{ `fieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinHumidity`: \{ `fieldNumber`: `24`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualTargetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `46`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `packedBitsFields`: \{ `featureFlags`: \{ `bits`: \{ `requiresTwoPointTargetTemperature`: \{ `bit`: `4`; \}; `supportsAction`: \{ `bit`: `32`; \}; `supportsCurrentHumidity`: \{ `bit`: `8`; \}; `supportsCurrentTemperature`: \{ `bit`: `1`; \}; `supportsTargetHumidity`: \{ `bit`: `16`; \}; `supportsTwoPointTargetTemperature`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `27`; `wireType`: `0`; \}; \}; `repeatedFields`: \{ `supportedCustomFanModes`: \{ `fieldNumber`: `15`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedCustomPresets`: \{ `fieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedFanModes`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedModes`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedPresets`: \{ `fieldNumber`: `16`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedSwingModes`: \{ `fieldNumber`: `14`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \} | - |
| `climate.listEntities.deviceIdFieldNumber` | `26` | `26` |
| `climate.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedFanModes`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `supportedModes`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `supportedPresets`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `supportedSwingModes`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \} | - |
| `climate.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `climate.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `climate.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `climate.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `climate.listEntities.enumMappings.supportedFanModes` | \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \} | `ClimateFanMode` |
| `climate.listEntities.enumMappings.supportedFanModes.AUTO` | `2` | `2` |
| `climate.listEntities.enumMappings.supportedFanModes.DIFFUSE` | `8` | `8` |
| `climate.listEntities.enumMappings.supportedFanModes.FOCUS` | `7` | `7` |
| `climate.listEntities.enumMappings.supportedFanModes.HIGH` | `5` | `5` |
| `climate.listEntities.enumMappings.supportedFanModes.LOW` | `3` | `3` |
| `climate.listEntities.enumMappings.supportedFanModes.MEDIUM` | `4` | `4` |
| `climate.listEntities.enumMappings.supportedFanModes.MIDDLE` | `6` | `6` |
| `climate.listEntities.enumMappings.supportedFanModes.OFF` | `1` | `1` |
| `climate.listEntities.enumMappings.supportedFanModes.ON` | `0` | `0` |
| `climate.listEntities.enumMappings.supportedFanModes.QUIET` | `9` | `9` |
| `climate.listEntities.enumMappings.supportedModes` | \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \} | `ClimateMode` |
| `climate.listEntities.enumMappings.supportedModes.AUTO` | `6` | `6` |
| `climate.listEntities.enumMappings.supportedModes.COOL` | `2` | `2` |
| `climate.listEntities.enumMappings.supportedModes.DRY` | `5` | `5` |
| `climate.listEntities.enumMappings.supportedModes.FAN_ONLY` | `4` | `4` |
| `climate.listEntities.enumMappings.supportedModes.HEAT` | `3` | `3` |
| `climate.listEntities.enumMappings.supportedModes.HEAT_COOL` | `1` | `1` |
| `climate.listEntities.enumMappings.supportedModes.OFF` | `0` | `0` |
| `climate.listEntities.enumMappings.supportedPresets` | \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \} | `ClimatePreset` |
| `climate.listEntities.enumMappings.supportedPresets.ACTIVITY` | `7` | `7` |
| `climate.listEntities.enumMappings.supportedPresets.AWAY` | `2` | `2` |
| `climate.listEntities.enumMappings.supportedPresets.BOOST` | `3` | `3` |
| `climate.listEntities.enumMappings.supportedPresets.COMFORT` | `4` | `4` |
| `climate.listEntities.enumMappings.supportedPresets.ECO` | `5` | `5` |
| `climate.listEntities.enumMappings.supportedPresets.HOME` | `1` | `1` |
| `climate.listEntities.enumMappings.supportedPresets.NONE` | `0` | `0` |
| `climate.listEntities.enumMappings.supportedPresets.SLEEP` | `6` | `6` |
| `climate.listEntities.enumMappings.supportedSwingModes` | \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \} | `ClimateSwingMode` |
| `climate.listEntities.enumMappings.supportedSwingModes.BOTH` | `1` | `1` |
| `climate.listEntities.enumMappings.supportedSwingModes.HORIZONTAL` | `3` | `3` |
| `climate.listEntities.enumMappings.supportedSwingModes.OFF` | `0` | `0` |
| `climate.listEntities.enumMappings.supportedSwingModes.VERTICAL` | `2` | `2` |
| `climate.listEntities.enumMappings.temperatureUnit` | \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \} | `TemperatureUnit` |
| `climate.listEntities.enumMappings.temperatureUnit.CELSIUS` | `0` | `0` |
| `climate.listEntities.enumMappings.temperatureUnit.FAHRENHEIT` | `1` | `1` |
| `climate.listEntities.enumMappings.temperatureUnit.KELVIN` | `2` | `2` |
| `climate.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `18`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `20`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsAction`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentHumidity`: \{ `fieldNumber`: `22`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsCurrentTemperature`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTargetHumidity`: \{ `fieldNumber`: `23`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTwoPointTargetTemperature`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `temperatureUnit`: \{ `fieldNumber`: `28`; `valueType`: `"enum"`; `wireType`: `0`; \}; `visualCurrentTemperatureStep`: \{ `fieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxHumidity`: \{ `fieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMaxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinHumidity`: \{ `fieldNumber`: `24`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualMinTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `visualTargetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `climate.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `18`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.disabledByDefault.fieldNumber` | `18` | `18` |
| `climate.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `climate.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.entityCategory` | \{ `fieldNumber`: `20`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.entityCategory.fieldNumber` | `20` | `20` |
| `climate.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `climate.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.icon` | \{ `fieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `climate.listEntities.fields.icon.fieldNumber` | `19` | `19` |
| `climate.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `climate.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `climate.listEntities.fields.supportsAction` | \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.supportsAction.fieldNumber` | `12` | `12` |
| `climate.listEntities.fields.supportsAction.valueType` | `"bool"` | `"bool"` |
| `climate.listEntities.fields.supportsAction.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.supportsCurrentHumidity` | \{ `fieldNumber`: `22`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.supportsCurrentHumidity.fieldNumber` | `22` | `22` |
| `climate.listEntities.fields.supportsCurrentHumidity.valueType` | `"bool"` | `"bool"` |
| `climate.listEntities.fields.supportsCurrentHumidity.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.supportsCurrentTemperature` | \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.supportsCurrentTemperature.fieldNumber` | `5` | `5` |
| `climate.listEntities.fields.supportsCurrentTemperature.valueType` | `"bool"` | `"bool"` |
| `climate.listEntities.fields.supportsCurrentTemperature.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.supportsTargetHumidity` | \{ `fieldNumber`: `23`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.supportsTargetHumidity.fieldNumber` | `23` | `23` |
| `climate.listEntities.fields.supportsTargetHumidity.valueType` | `"bool"` | `"bool"` |
| `climate.listEntities.fields.supportsTargetHumidity.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.supportsTwoPointTargetTemperature` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.supportsTwoPointTargetTemperature.fieldNumber` | `6` | `6` |
| `climate.listEntities.fields.supportsTwoPointTargetTemperature.valueType` | `"bool"` | `"bool"` |
| `climate.listEntities.fields.supportsTwoPointTargetTemperature.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.temperatureUnit` | \{ `fieldNumber`: `28`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.listEntities.fields.temperatureUnit.fieldNumber` | `28` | `28` |
| `climate.listEntities.fields.temperatureUnit.valueType` | `"enum"` | `"enum"` |
| `climate.listEntities.fields.temperatureUnit.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.fields.visualCurrentTemperatureStep` | \{ `fieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.listEntities.fields.visualCurrentTemperatureStep.fieldNumber` | `21` | `21` |
| `climate.listEntities.fields.visualCurrentTemperatureStep.valueType` | `"float"` | `"float"` |
| `climate.listEntities.fields.visualCurrentTemperatureStep.wireType` | `5` | `WireType.FIXED32` |
| `climate.listEntities.fields.visualMaxHumidity` | \{ `fieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.listEntities.fields.visualMaxHumidity.fieldNumber` | `25` | `25` |
| `climate.listEntities.fields.visualMaxHumidity.valueType` | `"float"` | `"float"` |
| `climate.listEntities.fields.visualMaxHumidity.wireType` | `5` | `WireType.FIXED32` |
| `climate.listEntities.fields.visualMaxTemperature` | \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.listEntities.fields.visualMaxTemperature.fieldNumber` | `9` | `9` |
| `climate.listEntities.fields.visualMaxTemperature.valueType` | `"float"` | `"float"` |
| `climate.listEntities.fields.visualMaxTemperature.wireType` | `5` | `WireType.FIXED32` |
| `climate.listEntities.fields.visualMinHumidity` | \{ `fieldNumber`: `24`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.listEntities.fields.visualMinHumidity.fieldNumber` | `24` | `24` |
| `climate.listEntities.fields.visualMinHumidity.valueType` | `"float"` | `"float"` |
| `climate.listEntities.fields.visualMinHumidity.wireType` | `5` | `WireType.FIXED32` |
| `climate.listEntities.fields.visualMinTemperature` | \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.listEntities.fields.visualMinTemperature.fieldNumber` | `8` | `8` |
| `climate.listEntities.fields.visualMinTemperature.valueType` | `"float"` | `"float"` |
| `climate.listEntities.fields.visualMinTemperature.wireType` | `5` | `WireType.FIXED32` |
| `climate.listEntities.fields.visualTargetTemperatureStep` | \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.listEntities.fields.visualTargetTemperatureStep.fieldNumber` | `10` | `10` |
| `climate.listEntities.fields.visualTargetTemperatureStep.valueType` | `"float"` | `"float"` |
| `climate.listEntities.fields.visualTargetTemperatureStep.wireType` | `5` | `WireType.FIXED32` |
| `climate.listEntities.keyFieldNumber` | `2` | `2` |
| `climate.listEntities.messageType` | `46` | `MessageType.LIST_ENTITIES_CLIMATE_RESPONSE` |
| `climate.listEntities.nameFieldNumber` | `3` | `3` |
| `climate.listEntities.objectIdFieldNumber` | `1` | `1` |
| `climate.listEntities.packedBitsFields` | \{ `featureFlags`: \{ `bits`: \{ `requiresTwoPointTargetTemperature`: \{ `bit`: `4`; \}; `supportsAction`: \{ `bit`: `32`; \}; `supportsCurrentHumidity`: \{ `bit`: `8`; \}; `supportsCurrentTemperature`: \{ `bit`: `1`; \}; `supportsTargetHumidity`: \{ `bit`: `16`; \}; `supportsTwoPointTargetTemperature`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `27`; `wireType`: `0`; \}; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags` | \{ `bits`: \{ `requiresTwoPointTargetTemperature`: \{ `bit`: `4`; \}; `supportsAction`: \{ `bit`: `32`; \}; `supportsCurrentHumidity`: \{ `bit`: `8`; \}; `supportsCurrentTemperature`: \{ `bit`: `1`; \}; `supportsTargetHumidity`: \{ `bit`: `16`; \}; `supportsTwoPointTargetTemperature`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `27`; `wireType`: `0`; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags.bits` | \{ `requiresTwoPointTargetTemperature`: \{ `bit`: `4`; \}; `supportsAction`: \{ `bit`: `32`; \}; `supportsCurrentHumidity`: \{ `bit`: `8`; \}; `supportsCurrentTemperature`: \{ `bit`: `1`; \}; `supportsTargetHumidity`: \{ `bit`: `16`; \}; `supportsTwoPointTargetTemperature`: \{ `bit`: `2`; \}; \} | `CLIMATE_FEATURE_BITS` |
| `climate.listEntities.packedBitsFields.featureFlags.bits.requiresTwoPointTargetTemperature` | \{ `bit`: `4`; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags.bits.requiresTwoPointTargetTemperature.bit` | `4` | `ClimateFeature.REQUIRES_TWO_POINT_TARGET_TEMPERATURE` |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsAction` | \{ `bit`: `32`; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsAction.bit` | `32` | `ClimateFeature.SUPPORTS_ACTION` |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsCurrentHumidity` | \{ `bit`: `8`; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsCurrentHumidity.bit` | `8` | `ClimateFeature.SUPPORTS_CURRENT_HUMIDITY` |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsCurrentTemperature` | \{ `bit`: `1`; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsCurrentTemperature.bit` | `1` | `ClimateFeature.SUPPORTS_CURRENT_TEMPERATURE` |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsTargetHumidity` | \{ `bit`: `16`; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsTargetHumidity.bit` | `16` | `ClimateFeature.SUPPORTS_TARGET_HUMIDITY` |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsTwoPointTargetTemperature` | \{ `bit`: `2`; \} | - |
| `climate.listEntities.packedBitsFields.featureFlags.bits.supportsTwoPointTargetTemperature.bit` | `2` | `ClimateFeature.SUPPORTS_TWO_POINT_TARGET_TEMPERATURE` |
| `climate.listEntities.packedBitsFields.featureFlags.fieldNumber` | `27` | `27` |
| `climate.listEntities.packedBitsFields.featureFlags.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.repeatedFields` | \{ `supportedCustomFanModes`: \{ `fieldNumber`: `15`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedCustomPresets`: \{ `fieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedFanModes`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedModes`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedPresets`: \{ `fieldNumber`: `16`; `valueType`: `"enum"`; `wireType`: `0`; \}; `supportedSwingModes`: \{ `fieldNumber`: `14`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `climate.listEntities.repeatedFields.supportedCustomFanModes` | \{ `fieldNumber`: `15`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `climate.listEntities.repeatedFields.supportedCustomFanModes.fieldNumber` | `15` | `15` |
| `climate.listEntities.repeatedFields.supportedCustomFanModes.valueType` | `"string"` | `"string"` |
| `climate.listEntities.repeatedFields.supportedCustomFanModes.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `climate.listEntities.repeatedFields.supportedCustomPresets` | \{ `fieldNumber`: `17`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `climate.listEntities.repeatedFields.supportedCustomPresets.fieldNumber` | `17` | `17` |
| `climate.listEntities.repeatedFields.supportedCustomPresets.valueType` | `"string"` | `"string"` |
| `climate.listEntities.repeatedFields.supportedCustomPresets.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `climate.listEntities.repeatedFields.supportedFanModes` | \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.listEntities.repeatedFields.supportedFanModes.fieldNumber` | `13` | `13` |
| `climate.listEntities.repeatedFields.supportedFanModes.valueType` | `"enum"` | `"enum"` |
| `climate.listEntities.repeatedFields.supportedFanModes.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.repeatedFields.supportedModes` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.listEntities.repeatedFields.supportedModes.fieldNumber` | `7` | `7` |
| `climate.listEntities.repeatedFields.supportedModes.valueType` | `"enum"` | `"enum"` |
| `climate.listEntities.repeatedFields.supportedModes.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.repeatedFields.supportedPresets` | \{ `fieldNumber`: `16`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.listEntities.repeatedFields.supportedPresets.fieldNumber` | `16` | `16` |
| `climate.listEntities.repeatedFields.supportedPresets.valueType` | `"enum"` | `"enum"` |
| `climate.listEntities.repeatedFields.supportedPresets.wireType` | `0` | `WireType.VARINT` |
| `climate.listEntities.repeatedFields.supportedSwingModes` | \{ `fieldNumber`: `14`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.listEntities.repeatedFields.supportedSwingModes.fieldNumber` | `14` | `14` |
| `climate.listEntities.repeatedFields.supportedSwingModes.valueType` | `"enum"` | `"enum"` |
| `climate.listEntities.repeatedFields.supportedSwingModes.wireType` | `0` | `WireType.VARINT` |
| `climate.state` | \{ `deviceIdFieldNumber`: `16`; `enumMappings`: \{ `action`: \{ `COOLING`: `2`; `DRYING`: `5`; `FAN`: `6`; `HEATING`: `3`; `IDLE`: `4`; `OFF`: `0`; \}; `fanMode`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `mode`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `preset`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `swingMode`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; \}; `fields`: \{ `action`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `currentHumidity`: \{ `fieldNumber`: `14`; `valueType`: `"float"`; `wireType`: `5`; \}; `currentTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `customFanMode`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `fieldNumber`: `15`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `47`; \} | - |
| `climate.state.deviceIdFieldNumber` | `16` | `16` |
| `climate.state.enumMappings` | \{ `action`: \{ `COOLING`: `2`; `DRYING`: `5`; `FAN`: `6`; `HEATING`: `3`; `IDLE`: `4`; `OFF`: `0`; \}; `fanMode`: \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \}; `mode`: \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \}; `preset`: \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \}; `swingMode`: \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \}; \} | - |
| `climate.state.enumMappings.action` | \{ `COOLING`: `2`; `DRYING`: `5`; `FAN`: `6`; `HEATING`: `3`; `IDLE`: `4`; `OFF`: `0`; \} | `ClimateAction` |
| `climate.state.enumMappings.action.COOLING` | `2` | `2` |
| `climate.state.enumMappings.action.DRYING` | `5` | `5` |
| `climate.state.enumMappings.action.FAN` | `6` | `6` |
| `climate.state.enumMappings.action.HEATING` | `3` | `3` |
| `climate.state.enumMappings.action.IDLE` | `4` | `4` |
| `climate.state.enumMappings.action.OFF` | `0` | `0` |
| `climate.state.enumMappings.fanMode` | \{ `AUTO`: `2`; `DIFFUSE`: `8`; `FOCUS`: `7`; `HIGH`: `5`; `LOW`: `3`; `MEDIUM`: `4`; `MIDDLE`: `6`; `OFF`: `1`; `ON`: `0`; `QUIET`: `9`; \} | `ClimateFanMode` |
| `climate.state.enumMappings.fanMode.AUTO` | `2` | `2` |
| `climate.state.enumMappings.fanMode.DIFFUSE` | `8` | `8` |
| `climate.state.enumMappings.fanMode.FOCUS` | `7` | `7` |
| `climate.state.enumMappings.fanMode.HIGH` | `5` | `5` |
| `climate.state.enumMappings.fanMode.LOW` | `3` | `3` |
| `climate.state.enumMappings.fanMode.MEDIUM` | `4` | `4` |
| `climate.state.enumMappings.fanMode.MIDDLE` | `6` | `6` |
| `climate.state.enumMappings.fanMode.OFF` | `1` | `1` |
| `climate.state.enumMappings.fanMode.ON` | `0` | `0` |
| `climate.state.enumMappings.fanMode.QUIET` | `9` | `9` |
| `climate.state.enumMappings.mode` | \{ `AUTO`: `6`; `COOL`: `2`; `DRY`: `5`; `FAN_ONLY`: `4`; `HEAT`: `3`; `HEAT_COOL`: `1`; `OFF`: `0`; \} | `ClimateMode` |
| `climate.state.enumMappings.mode.AUTO` | `6` | `6` |
| `climate.state.enumMappings.mode.COOL` | `2` | `2` |
| `climate.state.enumMappings.mode.DRY` | `5` | `5` |
| `climate.state.enumMappings.mode.FAN_ONLY` | `4` | `4` |
| `climate.state.enumMappings.mode.HEAT` | `3` | `3` |
| `climate.state.enumMappings.mode.HEAT_COOL` | `1` | `1` |
| `climate.state.enumMappings.mode.OFF` | `0` | `0` |
| `climate.state.enumMappings.preset` | \{ `ACTIVITY`: `7`; `AWAY`: `2`; `BOOST`: `3`; `COMFORT`: `4`; `ECO`: `5`; `HOME`: `1`; `NONE`: `0`; `SLEEP`: `6`; \} | `ClimatePreset` |
| `climate.state.enumMappings.preset.ACTIVITY` | `7` | `7` |
| `climate.state.enumMappings.preset.AWAY` | `2` | `2` |
| `climate.state.enumMappings.preset.BOOST` | `3` | `3` |
| `climate.state.enumMappings.preset.COMFORT` | `4` | `4` |
| `climate.state.enumMappings.preset.ECO` | `5` | `5` |
| `climate.state.enumMappings.preset.HOME` | `1` | `1` |
| `climate.state.enumMappings.preset.NONE` | `0` | `0` |
| `climate.state.enumMappings.preset.SLEEP` | `6` | `6` |
| `climate.state.enumMappings.swingMode` | \{ `BOTH`: `1`; `HORIZONTAL`: `3`; `OFF`: `0`; `VERTICAL`: `2`; \} | `ClimateSwingMode` |
| `climate.state.enumMappings.swingMode.BOTH` | `1` | `1` |
| `climate.state.enumMappings.swingMode.HORIZONTAL` | `3` | `3` |
| `climate.state.enumMappings.swingMode.OFF` | `0` | `0` |
| `climate.state.enumMappings.swingMode.VERTICAL` | `2` | `2` |
| `climate.state.fields` | \{ `action`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `currentHumidity`: \{ `fieldNumber`: `14`; `valueType`: `"float"`; `wireType`: `5`; \}; `currentTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `customFanMode`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `customPreset`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `fanMode`: \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `preset`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `swingMode`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetHumidity`: \{ `fieldNumber`: `15`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperature`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `climate.state.fields.action` | \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.state.fields.action.fieldNumber` | `8` | `8` |
| `climate.state.fields.action.valueType` | `"enum"` | `"enum"` |
| `climate.state.fields.action.wireType` | `0` | `WireType.VARINT` |
| `climate.state.fields.currentHumidity` | \{ `fieldNumber`: `14`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.state.fields.currentHumidity.fieldNumber` | `14` | `14` |
| `climate.state.fields.currentHumidity.valueType` | `"float"` | `"float"` |
| `climate.state.fields.currentHumidity.wireType` | `5` | `WireType.FIXED32` |
| `climate.state.fields.currentTemperature` | \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.state.fields.currentTemperature.fieldNumber` | `3` | `3` |
| `climate.state.fields.currentTemperature.valueType` | `"float"` | `"float"` |
| `climate.state.fields.currentTemperature.wireType` | `5` | `WireType.FIXED32` |
| `climate.state.fields.customFanMode` | \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `climate.state.fields.customFanMode.fieldNumber` | `11` | `11` |
| `climate.state.fields.customFanMode.valueType` | `"string"` | `"string"` |
| `climate.state.fields.customFanMode.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `climate.state.fields.customPreset` | \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `climate.state.fields.customPreset.fieldNumber` | `13` | `13` |
| `climate.state.fields.customPreset.valueType` | `"string"` | `"string"` |
| `climate.state.fields.customPreset.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `climate.state.fields.fanMode` | \{ `fieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.state.fields.fanMode.fieldNumber` | `9` | `9` |
| `climate.state.fields.fanMode.valueType` | `"enum"` | `"enum"` |
| `climate.state.fields.fanMode.wireType` | `0` | `WireType.VARINT` |
| `climate.state.fields.mode` | \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.state.fields.mode.fieldNumber` | `2` | `2` |
| `climate.state.fields.mode.valueType` | `"enum"` | `"enum"` |
| `climate.state.fields.mode.wireType` | `0` | `WireType.VARINT` |
| `climate.state.fields.preset` | \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.state.fields.preset.fieldNumber` | `12` | `12` |
| `climate.state.fields.preset.valueType` | `"enum"` | `"enum"` |
| `climate.state.fields.preset.wireType` | `0` | `WireType.VARINT` |
| `climate.state.fields.swingMode` | \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `climate.state.fields.swingMode.fieldNumber` | `10` | `10` |
| `climate.state.fields.swingMode.valueType` | `"enum"` | `"enum"` |
| `climate.state.fields.swingMode.wireType` | `0` | `WireType.VARINT` |
| `climate.state.fields.targetHumidity` | \{ `fieldNumber`: `15`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.state.fields.targetHumidity.fieldNumber` | `15` | `15` |
| `climate.state.fields.targetHumidity.valueType` | `"float"` | `"float"` |
| `climate.state.fields.targetHumidity.wireType` | `5` | `WireType.FIXED32` |
| `climate.state.fields.targetTemperature` | \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.state.fields.targetTemperature.fieldNumber` | `4` | `4` |
| `climate.state.fields.targetTemperature.valueType` | `"float"` | `"float"` |
| `climate.state.fields.targetTemperature.wireType` | `5` | `WireType.FIXED32` |
| `climate.state.fields.targetTemperatureHigh` | \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.state.fields.targetTemperatureHigh.fieldNumber` | `6` | `6` |
| `climate.state.fields.targetTemperatureHigh.valueType` | `"float"` | `"float"` |
| `climate.state.fields.targetTemperatureHigh.wireType` | `5` | `WireType.FIXED32` |
| `climate.state.fields.targetTemperatureLow` | \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `climate.state.fields.targetTemperatureLow.fieldNumber` | `5` | `5` |
| `climate.state.fields.targetTemperatureLow.valueType` | `"float"` | `"float"` |
| `climate.state.fields.targetTemperatureLow.wireType` | `5` | `WireType.FIXED32` |
| `climate.state.keyFieldNumber` | `1` | `1` |
| `climate.state.messageType` | `47` | `MessageType.CLIMATE_STATE_RESPONSE` |
| `climate.type` | `"climate"` | `"climate"` |
| <a id="property-cover"></a> `cover` | \{ `command`: \{ `deviceIdFieldNumber`: `9`; `fields`: \{ `stop`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `position`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `30`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `13`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTilt`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `13`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `6`; `enumMappings`: \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \}; `fields`: \{ `currentOperation`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `22`; \}; `type`: `"cover"`; \} | - |
| `cover.command` | \{ `deviceIdFieldNumber`: `9`; `fields`: \{ `stop`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `position`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `30`; \} | - |
| `cover.command.deviceIdFieldNumber` | `9` | `9` |
| `cover.command.fields` | \{ `stop`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `cover.command.fields.stop` | \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `cover.command.fields.stop.fieldNumber` | `8` | `8` |
| `cover.command.fields.stop.valueType` | `"bool"` | `"bool"` |
| `cover.command.fields.stop.wireType` | `0` | `WireType.VARINT` |
| `cover.command.hasPatternFields` | \{ `position`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `cover.command.hasPatternFields.position` | \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `cover.command.hasPatternFields.position.hasFieldNumber` | `4` | `4` |
| `cover.command.hasPatternFields.position.valueFieldNumber` | `5` | `5` |
| `cover.command.hasPatternFields.position.valueType` | `"float"` | `"float"` |
| `cover.command.hasPatternFields.position.wireType` | `5` | `WireType.FIXED32` |
| `cover.command.hasPatternFields.tilt` | \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `cover.command.hasPatternFields.tilt.hasFieldNumber` | `6` | `6` |
| `cover.command.hasPatternFields.tilt.valueFieldNumber` | `7` | `7` |
| `cover.command.hasPatternFields.tilt.valueType` | `"float"` | `"float"` |
| `cover.command.hasPatternFields.tilt.wireType` | `5` | `WireType.FIXED32` |
| `cover.command.keyFieldNumber` | `1` | `1` |
| `cover.command.messageType` | `30` | `MessageType.COVER_COMMAND_REQUEST` |
| `cover.listEntities` | \{ `deviceIdFieldNumber`: `13`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTilt`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `13`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `cover.listEntities.deviceIdFieldNumber` | `13` | `13` |
| `cover.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `cover.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `cover.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `cover.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `cover.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `cover.listEntities.fields` | \{ `assumedState`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsTilt`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `cover.listEntities.fields.assumedState` | \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `cover.listEntities.fields.assumedState.fieldNumber` | `5` | `5` |
| `cover.listEntities.fields.assumedState.valueType` | `"bool"` | `"bool"` |
| `cover.listEntities.fields.assumedState.wireType` | `0` | `WireType.VARINT` |
| `cover.listEntities.fields.deviceClass` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `cover.listEntities.fields.deviceClass.fieldNumber` | `8` | `8` |
| `cover.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `cover.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `cover.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `cover.listEntities.fields.disabledByDefault.fieldNumber` | `9` | `9` |
| `cover.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `cover.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `cover.listEntities.fields.entityCategory` | \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `cover.listEntities.fields.entityCategory.fieldNumber` | `11` | `11` |
| `cover.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `cover.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `cover.listEntities.fields.icon` | \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `cover.listEntities.fields.icon.fieldNumber` | `10` | `10` |
| `cover.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `cover.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `cover.listEntities.fields.supportsPosition` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `cover.listEntities.fields.supportsPosition.fieldNumber` | `6` | `6` |
| `cover.listEntities.fields.supportsPosition.valueType` | `"bool"` | `"bool"` |
| `cover.listEntities.fields.supportsPosition.wireType` | `0` | `WireType.VARINT` |
| `cover.listEntities.fields.supportsStop` | \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `cover.listEntities.fields.supportsStop.fieldNumber` | `12` | `12` |
| `cover.listEntities.fields.supportsStop.valueType` | `"bool"` | `"bool"` |
| `cover.listEntities.fields.supportsStop.wireType` | `0` | `WireType.VARINT` |
| `cover.listEntities.fields.supportsTilt` | \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `cover.listEntities.fields.supportsTilt.fieldNumber` | `7` | `7` |
| `cover.listEntities.fields.supportsTilt.valueType` | `"bool"` | `"bool"` |
| `cover.listEntities.fields.supportsTilt.wireType` | `0` | `WireType.VARINT` |
| `cover.listEntities.keyFieldNumber` | `2` | `2` |
| `cover.listEntities.messageType` | `13` | `MessageType.LIST_ENTITIES_COVER_RESPONSE` |
| `cover.listEntities.nameFieldNumber` | `3` | `3` |
| `cover.listEntities.objectIdFieldNumber` | `1` | `1` |
| `cover.state` | \{ `deviceIdFieldNumber`: `6`; `enumMappings`: \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \}; `fields`: \{ `currentOperation`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `22`; \} | - |
| `cover.state.deviceIdFieldNumber` | `6` | `6` |
| `cover.state.enumMappings` | \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \} | - |
| `cover.state.enumMappings.currentOperation` | \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \} | `CoverOperation` |
| `cover.state.enumMappings.currentOperation.IDLE` | `0` | `0` |
| `cover.state.enumMappings.currentOperation.IS_CLOSING` | `2` | `2` |
| `cover.state.enumMappings.currentOperation.IS_OPENING` | `1` | `1` |
| `cover.state.fields` | \{ `currentOperation`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `tilt`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `cover.state.fields.currentOperation` | \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `cover.state.fields.currentOperation.fieldNumber` | `5` | `5` |
| `cover.state.fields.currentOperation.valueType` | `"enum"` | `"enum"` |
| `cover.state.fields.currentOperation.wireType` | `0` | `WireType.VARINT` |
| `cover.state.fields.position` | \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `cover.state.fields.position.fieldNumber` | `3` | `3` |
| `cover.state.fields.position.valueType` | `"float"` | `"float"` |
| `cover.state.fields.position.wireType` | `5` | `WireType.FIXED32` |
| `cover.state.fields.tilt` | \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `cover.state.fields.tilt.fieldNumber` | `4` | `4` |
| `cover.state.fields.tilt.valueType` | `"float"` | `"float"` |
| `cover.state.fields.tilt.wireType` | `5` | `WireType.FIXED32` |
| `cover.state.keyFieldNumber` | `1` | `1` |
| `cover.state.messageType` | `22` | `MessageType.COVER_STATE_RESPONSE` |
| `cover.type` | `"cover"` | `"cover"` |
| <a id="property-date"></a> `date` | \{ `command`: \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `day`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `102`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `100`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `6`; `fields`: \{ `day`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `101`; \}; `type`: `"date"`; \} | - |
| `date.command` | \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `day`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `102`; \} | - |
| `date.command.deviceIdFieldNumber` | `5` | `5` |
| `date.command.fields` | \{ `day`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `date.command.fields.day` | \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `date.command.fields.day.fieldNumber` | `4` | `4` |
| `date.command.fields.day.valueType` | `"varint"` | `"varint"` |
| `date.command.fields.day.wireType` | `0` | `WireType.VARINT` |
| `date.command.fields.month` | \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `date.command.fields.month.fieldNumber` | `3` | `3` |
| `date.command.fields.month.valueType` | `"varint"` | `"varint"` |
| `date.command.fields.month.wireType` | `0` | `WireType.VARINT` |
| `date.command.fields.year` | \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `date.command.fields.year.fieldNumber` | `2` | `2` |
| `date.command.fields.year.valueType` | `"varint"` | `"varint"` |
| `date.command.fields.year.wireType` | `0` | `WireType.VARINT` |
| `date.command.hasPatternFields` | \{ \} | `{}` |
| `date.command.keyFieldNumber` | `1` | `1` |
| `date.command.messageType` | `102` | `MessageType.DATE_COMMAND_REQUEST` |
| `date.listEntities` | \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `100`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `date.listEntities.deviceIdFieldNumber` | `8` | `8` |
| `date.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `date.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `date.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `date.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `date.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `date.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `date.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `date.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `date.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `date.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `date.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `date.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `date.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `date.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `date.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `date.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `date.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `date.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `date.listEntities.keyFieldNumber` | `2` | `2` |
| `date.listEntities.messageType` | `100` | `MessageType.LIST_ENTITIES_DATE_RESPONSE` |
| `date.listEntities.nameFieldNumber` | `3` | `3` |
| `date.listEntities.objectIdFieldNumber` | `1` | `1` |
| `date.state` | \{ `deviceIdFieldNumber`: `6`; `fields`: \{ `day`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `101`; \} | - |
| `date.state.deviceIdFieldNumber` | `6` | `6` |
| `date.state.fields` | \{ `day`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `month`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `year`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `date.state.fields.day` | \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `date.state.fields.day.fieldNumber` | `5` | `5` |
| `date.state.fields.day.valueType` | `"varint"` | `"varint"` |
| `date.state.fields.day.wireType` | `0` | `WireType.VARINT` |
| `date.state.fields.missingState` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `date.state.fields.missingState.fieldNumber` | `2` | `2` |
| `date.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `date.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `date.state.fields.month` | \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `date.state.fields.month.fieldNumber` | `4` | `4` |
| `date.state.fields.month.valueType` | `"varint"` | `"varint"` |
| `date.state.fields.month.wireType` | `0` | `WireType.VARINT` |
| `date.state.fields.year` | \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `date.state.fields.year.fieldNumber` | `3` | `3` |
| `date.state.fields.year.valueType` | `"varint"` | `"varint"` |
| `date.state.fields.year.wireType` | `0` | `WireType.VARINT` |
| `date.state.keyFieldNumber` | `1` | `1` |
| `date.state.messageType` | `101` | `MessageType.DATE_STATE_RESPONSE` |
| `date.type` | `"date"` | `"date"` |
| <a id="property-datetime"></a> `datetime` | \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `epochSeconds`: \{ `fieldNumber`: `2`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `114`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `112`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `epochSeconds`: \{ `fieldNumber`: `3`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `113`; \}; `type`: `"datetime"`; \} | - |
| `datetime.command` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `epochSeconds`: \{ `fieldNumber`: `2`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `114`; \} | - |
| `datetime.command.deviceIdFieldNumber` | `3` | `3` |
| `datetime.command.fields` | \{ `epochSeconds`: \{ `fieldNumber`: `2`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; \} | - |
| `datetime.command.fields.epochSeconds` | \{ `fieldNumber`: `2`; `valueType`: `"fixed32"`; `wireType`: `5`; \} | - |
| `datetime.command.fields.epochSeconds.fieldNumber` | `2` | `2` |
| `datetime.command.fields.epochSeconds.valueType` | `"fixed32"` | `"fixed32"` |
| `datetime.command.fields.epochSeconds.wireType` | `5` | `WireType.FIXED32` |
| `datetime.command.hasPatternFields` | \{ \} | `{}` |
| `datetime.command.keyFieldNumber` | `1` | `1` |
| `datetime.command.messageType` | `114` | `MessageType.DATETIME_COMMAND_REQUEST` |
| `datetime.listEntities` | \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `112`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `datetime.listEntities.deviceIdFieldNumber` | `8` | `8` |
| `datetime.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `datetime.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `datetime.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `datetime.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `datetime.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `datetime.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `datetime.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `datetime.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `datetime.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `datetime.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `datetime.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `datetime.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `datetime.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `datetime.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `datetime.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `datetime.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `datetime.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `datetime.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `datetime.listEntities.keyFieldNumber` | `2` | `2` |
| `datetime.listEntities.messageType` | `112` | `MessageType.LIST_ENTITIES_DATETIME_RESPONSE` |
| `datetime.listEntities.nameFieldNumber` | `3` | `3` |
| `datetime.listEntities.objectIdFieldNumber` | `1` | `1` |
| `datetime.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `epochSeconds`: \{ `fieldNumber`: `3`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `113`; \} | - |
| `datetime.state.deviceIdFieldNumber` | `4` | `4` |
| `datetime.state.fields` | \{ `epochSeconds`: \{ `fieldNumber`: `3`; `valueType`: `"fixed32"`; `wireType`: `5`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `datetime.state.fields.epochSeconds` | \{ `fieldNumber`: `3`; `valueType`: `"fixed32"`; `wireType`: `5`; \} | - |
| `datetime.state.fields.epochSeconds.fieldNumber` | `3` | `3` |
| `datetime.state.fields.epochSeconds.valueType` | `"fixed32"` | `"fixed32"` |
| `datetime.state.fields.epochSeconds.wireType` | `5` | `WireType.FIXED32` |
| `datetime.state.fields.missingState` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `datetime.state.fields.missingState.fieldNumber` | `2` | `2` |
| `datetime.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `datetime.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `datetime.state.keyFieldNumber` | `1` | `1` |
| `datetime.state.messageType` | `113` | `MessageType.DATETIME_STATE_RESPONSE` |
| `datetime.type` | `"datetime"` | `"datetime"` |
| <a id="property-event"></a> `event` | \{ `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `107`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `eventTypes`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `eventType`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `108`; \}; `type`: `"event"`; \} | - |
| `event.listEntities` | \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `107`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `eventTypes`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \} | - |
| `event.listEntities.deviceIdFieldNumber` | `10` | `10` |
| `event.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `event.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `event.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `event.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `event.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `event.listEntities.fields` | \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `event.listEntities.fields.deviceClass` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `event.listEntities.fields.deviceClass.fieldNumber` | `8` | `8` |
| `event.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `event.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `event.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `event.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `event.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `event.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `event.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `event.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `event.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `event.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `event.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `event.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `event.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `event.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `event.listEntities.keyFieldNumber` | `2` | `2` |
| `event.listEntities.messageType` | `107` | `MessageType.LIST_ENTITIES_EVENT_RESPONSE` |
| `event.listEntities.nameFieldNumber` | `3` | `3` |
| `event.listEntities.objectIdFieldNumber` | `1` | `1` |
| `event.listEntities.repeatedFields` | \{ `eventTypes`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `event.listEntities.repeatedFields.eventTypes` | \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `event.listEntities.repeatedFields.eventTypes.fieldNumber` | `9` | `9` |
| `event.listEntities.repeatedFields.eventTypes.valueType` | `"string"` | `"string"` |
| `event.listEntities.repeatedFields.eventTypes.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `event.state` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `eventType`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `108`; \} | - |
| `event.state.deviceIdFieldNumber` | `3` | `3` |
| `event.state.fields` | \{ `eventType`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `event.state.fields.eventType` | \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `event.state.fields.eventType.fieldNumber` | `2` | `2` |
| `event.state.fields.eventType.valueType` | `"string"` | `"string"` |
| `event.state.fields.eventType.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `event.state.keyFieldNumber` | `1` | `1` |
| `event.state.messageType` | `108` | `MessageType.EVENT_RESPONSE` |
| `event.type` | `"event"` | `"event"` |
| <a id="property-fan"></a> `fan` | \{ `command`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `direction`: \{ `forward`: `0`; `reverse`: `1`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ `direction`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `31`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `13`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedSpeedCount`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `supportsDirection`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOscillation`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsSpeed`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `14`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `supportedPresetModes`: \{ `fieldNumber`: `12`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `direction`: \{ `FORWARD`: `0`; `REVERSE`: `1`; \}; \}; `fields`: \{ `direction`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `23`; \}; `type`: `"fan"`; \} | - |
| `fan.command` | \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `direction`: \{ `forward`: `0`; `reverse`: `1`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ `direction`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `31`; \} | - |
| `fan.command.deviceIdFieldNumber` | `14` | `14` |
| `fan.command.enumMappings` | \{ `direction`: \{ `forward`: `0`; `reverse`: `1`; \}; \} | - |
| `fan.command.enumMappings.direction` | \{ `forward`: `0`; `reverse`: `1`; \} | - |
| `fan.command.enumMappings.direction.forward` | `0` | `0` |
| `fan.command.enumMappings.direction.reverse` | `1` | `1` |
| `fan.command.fields` | \{ \} | `{}` |
| `fan.command.hasPatternFields` | \{ `direction`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `fan.command.hasPatternFields.direction` | \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `fan.command.hasPatternFields.direction.hasFieldNumber` | `8` | `8` |
| `fan.command.hasPatternFields.direction.valueFieldNumber` | `9` | `9` |
| `fan.command.hasPatternFields.direction.valueType` | `"enum"` | `"enum"` |
| `fan.command.hasPatternFields.direction.wireType` | `0` | `WireType.VARINT` |
| `fan.command.hasPatternFields.oscillating` | \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.command.hasPatternFields.oscillating.hasFieldNumber` | `6` | `6` |
| `fan.command.hasPatternFields.oscillating.valueFieldNumber` | `7` | `7` |
| `fan.command.hasPatternFields.oscillating.valueType` | `"bool"` | `"bool"` |
| `fan.command.hasPatternFields.oscillating.wireType` | `0` | `WireType.VARINT` |
| `fan.command.hasPatternFields.presetMode` | \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `fan.command.hasPatternFields.presetMode.hasFieldNumber` | `12` | `12` |
| `fan.command.hasPatternFields.presetMode.valueFieldNumber` | `13` | `13` |
| `fan.command.hasPatternFields.presetMode.valueType` | `"string"` | `"string"` |
| `fan.command.hasPatternFields.presetMode.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `fan.command.hasPatternFields.speedLevel` | \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `fan.command.hasPatternFields.speedLevel.hasFieldNumber` | `10` | `10` |
| `fan.command.hasPatternFields.speedLevel.valueFieldNumber` | `11` | `11` |
| `fan.command.hasPatternFields.speedLevel.valueType` | `"varint"` | `"varint"` |
| `fan.command.hasPatternFields.speedLevel.wireType` | `0` | `WireType.VARINT` |
| `fan.command.hasPatternFields.state` | \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.command.hasPatternFields.state.hasFieldNumber` | `2` | `2` |
| `fan.command.hasPatternFields.state.valueFieldNumber` | `3` | `3` |
| `fan.command.hasPatternFields.state.valueType` | `"bool"` | `"bool"` |
| `fan.command.hasPatternFields.state.wireType` | `0` | `WireType.VARINT` |
| `fan.command.keyFieldNumber` | `1` | `1` |
| `fan.command.messageType` | `31` | `MessageType.FAN_COMMAND_REQUEST` |
| `fan.listEntities` | \{ `deviceIdFieldNumber`: `13`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedSpeedCount`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `supportsDirection`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOscillation`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsSpeed`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `14`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `supportedPresetModes`: \{ `fieldNumber`: `12`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \} | - |
| `fan.listEntities.deviceIdFieldNumber` | `13` | `13` |
| `fan.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `fan.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `fan.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `fan.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `fan.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `fan.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedSpeedCount`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `supportsDirection`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOscillation`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsSpeed`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `fan.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.listEntities.fields.disabledByDefault.fieldNumber` | `9` | `9` |
| `fan.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `fan.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `fan.listEntities.fields.entityCategory` | \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `fan.listEntities.fields.entityCategory.fieldNumber` | `11` | `11` |
| `fan.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `fan.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `fan.listEntities.fields.icon` | \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `fan.listEntities.fields.icon.fieldNumber` | `10` | `10` |
| `fan.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `fan.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `fan.listEntities.fields.supportedSpeedCount` | \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `fan.listEntities.fields.supportedSpeedCount.fieldNumber` | `8` | `8` |
| `fan.listEntities.fields.supportedSpeedCount.valueType` | `"varint"` | `"varint"` |
| `fan.listEntities.fields.supportedSpeedCount.wireType` | `0` | `WireType.VARINT` |
| `fan.listEntities.fields.supportsDirection` | \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.listEntities.fields.supportsDirection.fieldNumber` | `7` | `7` |
| `fan.listEntities.fields.supportsDirection.valueType` | `"bool"` | `"bool"` |
| `fan.listEntities.fields.supportsDirection.wireType` | `0` | `WireType.VARINT` |
| `fan.listEntities.fields.supportsOscillation` | \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.listEntities.fields.supportsOscillation.fieldNumber` | `5` | `5` |
| `fan.listEntities.fields.supportsOscillation.valueType` | `"bool"` | `"bool"` |
| `fan.listEntities.fields.supportsOscillation.wireType` | `0` | `WireType.VARINT` |
| `fan.listEntities.fields.supportsSpeed` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.listEntities.fields.supportsSpeed.fieldNumber` | `6` | `6` |
| `fan.listEntities.fields.supportsSpeed.valueType` | `"bool"` | `"bool"` |
| `fan.listEntities.fields.supportsSpeed.wireType` | `0` | `WireType.VARINT` |
| `fan.listEntities.keyFieldNumber` | `2` | `2` |
| `fan.listEntities.messageType` | `14` | `MessageType.LIST_ENTITIES_FAN_RESPONSE` |
| `fan.listEntities.nameFieldNumber` | `3` | `3` |
| `fan.listEntities.objectIdFieldNumber` | `1` | `1` |
| `fan.listEntities.repeatedFields` | \{ `supportedPresetModes`: \{ `fieldNumber`: `12`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `fan.listEntities.repeatedFields.supportedPresetModes` | \{ `fieldNumber`: `12`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `fan.listEntities.repeatedFields.supportedPresetModes.fieldNumber` | `12` | `12` |
| `fan.listEntities.repeatedFields.supportedPresetModes.valueType` | `"string"` | `"string"` |
| `fan.listEntities.repeatedFields.supportedPresetModes.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `fan.state` | \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `direction`: \{ `FORWARD`: `0`; `REVERSE`: `1`; \}; \}; `fields`: \{ `direction`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `23`; \} | - |
| `fan.state.deviceIdFieldNumber` | `8` | `8` |
| `fan.state.enumMappings` | \{ `direction`: \{ `FORWARD`: `0`; `REVERSE`: `1`; \}; \} | - |
| `fan.state.enumMappings.direction` | \{ `FORWARD`: `0`; `REVERSE`: `1`; \} | `FanDirection` |
| `fan.state.enumMappings.direction.FORWARD` | `0` | `0` |
| `fan.state.enumMappings.direction.REVERSE` | `1` | `1` |
| `fan.state.fields` | \{ `direction`: \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \}; `oscillating`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `presetMode`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `speedLevel`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `fan.state.fields.direction` | \{ `fieldNumber`: `5`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `fan.state.fields.direction.fieldNumber` | `5` | `5` |
| `fan.state.fields.direction.valueType` | `"enum"` | `"enum"` |
| `fan.state.fields.direction.wireType` | `0` | `WireType.VARINT` |
| `fan.state.fields.oscillating` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.state.fields.oscillating.fieldNumber` | `3` | `3` |
| `fan.state.fields.oscillating.valueType` | `"bool"` | `"bool"` |
| `fan.state.fields.oscillating.wireType` | `0` | `WireType.VARINT` |
| `fan.state.fields.presetMode` | \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `fan.state.fields.presetMode.fieldNumber` | `7` | `7` |
| `fan.state.fields.presetMode.valueType` | `"string"` | `"string"` |
| `fan.state.fields.presetMode.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `fan.state.fields.speedLevel` | \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `fan.state.fields.speedLevel.fieldNumber` | `6` | `6` |
| `fan.state.fields.speedLevel.valueType` | `"varint"` | `"varint"` |
| `fan.state.fields.speedLevel.wireType` | `0` | `WireType.VARINT` |
| `fan.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `fan.state.fields.state.fieldNumber` | `2` | `2` |
| `fan.state.fields.state.valueType` | `"bool"` | `"bool"` |
| `fan.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `fan.state.keyFieldNumber` | `1` | `1` |
| `fan.state.messageType` | `23` | `MessageType.FAN_STATE_RESPONSE` |
| `fan.type` | `"fan"` | `"fan"` |
| <a id="property-infrared"></a> `infrared` | \{ `command`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `2`; `messageType`: `136`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `receiverFrequency`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `135`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `137`; \}; `type`: `"infrared"`; \} | - |
| `infrared.command` | \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `2`; `messageType`: `136`; \} | - |
| `infrared.command.deviceIdFieldNumber` | `1` | `1` |
| `infrared.command.fields` | \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \} | - |
| `infrared.command.fields.carrierFrequency` | \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `infrared.command.fields.carrierFrequency.fieldNumber` | `3` | `3` |
| `infrared.command.fields.carrierFrequency.valueType` | `"varint"` | `"varint"` |
| `infrared.command.fields.carrierFrequency.wireType` | `0` | `WireType.VARINT` |
| `infrared.command.fields.modulation` | \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `infrared.command.fields.modulation.fieldNumber` | `6` | `6` |
| `infrared.command.fields.modulation.valueType` | `"varint"` | `"varint"` |
| `infrared.command.fields.modulation.wireType` | `0` | `WireType.VARINT` |
| `infrared.command.fields.repeatCount` | \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `infrared.command.fields.repeatCount.fieldNumber` | `4` | `4` |
| `infrared.command.fields.repeatCount.valueType` | `"varint"` | `"varint"` |
| `infrared.command.fields.repeatCount.wireType` | `0` | `WireType.VARINT` |
| `infrared.command.fields.timings` | \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \} | - |
| `infrared.command.fields.timings.fieldNumber` | `5` | `5` |
| `infrared.command.fields.timings.valueType` | `"sint32-packed"` | `"sint32-packed"` |
| `infrared.command.fields.timings.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `infrared.command.hasPatternFields` | \{ \} | `{}` |
| `infrared.command.keyFieldNumber` | `2` | `2` |
| `infrared.command.messageType` | `136` | `MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST` |
| `infrared.listEntities` | \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `receiverFrequency`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `135`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `infrared.listEntities.deviceIdFieldNumber` | `7` | `7` |
| `infrared.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `infrared.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `infrared.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `infrared.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `infrared.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `infrared.listEntities.fields` | \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `receiverFrequency`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `infrared.listEntities.fields.capabilities` | \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `infrared.listEntities.fields.capabilities.fieldNumber` | `8` | `8` |
| `infrared.listEntities.fields.capabilities.valueType` | `"varint"` | `"varint"` |
| `infrared.listEntities.fields.capabilities.wireType` | `0` | `WireType.VARINT` |
| `infrared.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `infrared.listEntities.fields.disabledByDefault.fieldNumber` | `5` | `5` |
| `infrared.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `infrared.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `infrared.listEntities.fields.entityCategory` | \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `infrared.listEntities.fields.entityCategory.fieldNumber` | `6` | `6` |
| `infrared.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `infrared.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `infrared.listEntities.fields.icon` | \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `infrared.listEntities.fields.icon.fieldNumber` | `4` | `4` |
| `infrared.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `infrared.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `infrared.listEntities.fields.receiverFrequency` | \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `infrared.listEntities.fields.receiverFrequency.fieldNumber` | `9` | `9` |
| `infrared.listEntities.fields.receiverFrequency.valueType` | `"varint"` | `"varint"` |
| `infrared.listEntities.fields.receiverFrequency.wireType` | `0` | `WireType.VARINT` |
| `infrared.listEntities.keyFieldNumber` | `2` | `2` |
| `infrared.listEntities.messageType` | `135` | `MessageType.LIST_ENTITIES_INFRARED_RESPONSE` |
| `infrared.listEntities.nameFieldNumber` | `3` | `3` |
| `infrared.listEntities.objectIdFieldNumber` | `1` | `1` |
| `infrared.state` | \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `137`; \} | - |
| `infrared.state.deviceIdFieldNumber` | `1` | `1` |
| `infrared.state.fields` | \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \} | - |
| `infrared.state.fields.timings` | \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \} | - |
| `infrared.state.fields.timings.fieldNumber` | `3` | `3` |
| `infrared.state.fields.timings.valueType` | `"sint32-packed"` | `"sint32-packed"` |
| `infrared.state.fields.timings.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `infrared.state.keyFieldNumber` | `2` | `2` |
| `infrared.state.messageType` | `137` | `MessageType.INFRARED_RF_RECEIVE_EVENT` |
| `infrared.type` | `"infrared"` | `"infrared"` |
| <a id="property-light"></a> `light` | \{ `command`: \{ `deviceIdFieldNumber`: `28`; `fields`: \{ `blue`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `green`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `hasRgb`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `red`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ `brightness`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `hasFieldNumber`: `24`; `valueFieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `flashLength`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `transitionLength`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"varint"`; `wireType`: `0`; \}; `warmWhite`: \{ `hasFieldNumber`: `26`; `valueFieldNumber`: `27`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `32`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `16`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedColorModes`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `13`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `14`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxMireds`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `minMireds`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `15`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `effects`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedColorModes`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `colorMode`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \}; `fields`: \{ `blue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `brightness`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `fieldNumber`: `12`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `green`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `red`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `warmWhite`: \{ `fieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `24`; \}; `type`: `"light"`; \} | - |
| `light.command` | \{ `deviceIdFieldNumber`: `28`; `fields`: \{ `blue`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `green`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `hasRgb`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `red`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ `brightness`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `hasFieldNumber`: `24`; `valueFieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `flashLength`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `transitionLength`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"varint"`; `wireType`: `0`; \}; `warmWhite`: \{ `hasFieldNumber`: `26`; `valueFieldNumber`: `27`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `32`; \} | - |
| `light.command.deviceIdFieldNumber` | `28` | `28` |
| `light.command.fields` | \{ `blue`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `green`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `hasRgb`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `red`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `light.command.fields.blue` | \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.fields.blue.fieldNumber` | `9` | `9` |
| `light.command.fields.blue.valueType` | `"float"` | `"float"` |
| `light.command.fields.blue.wireType` | `5` | `WireType.FIXED32` |
| `light.command.fields.green` | \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.fields.green.fieldNumber` | `8` | `8` |
| `light.command.fields.green.valueType` | `"float"` | `"float"` |
| `light.command.fields.green.wireType` | `5` | `WireType.FIXED32` |
| `light.command.fields.hasRgb` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `light.command.fields.hasRgb.fieldNumber` | `6` | `6` |
| `light.command.fields.hasRgb.valueType` | `"bool"` | `"bool"` |
| `light.command.fields.hasRgb.wireType` | `0` | `WireType.VARINT` |
| `light.command.fields.red` | \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.fields.red.fieldNumber` | `7` | `7` |
| `light.command.fields.red.valueType` | `"float"` | `"float"` |
| `light.command.fields.red.wireType` | `5` | `WireType.FIXED32` |
| `light.command.hasPatternFields` | \{ `brightness`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `hasFieldNumber`: `24`; `valueFieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \}; `flashLength`: \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `transitionLength`: \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"varint"`; `wireType`: `0`; \}; `warmWhite`: \{ `hasFieldNumber`: `26`; `valueFieldNumber`: `27`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `light.command.hasPatternFields.brightness` | \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.hasPatternFields.brightness.hasFieldNumber` | `4` | `4` |
| `light.command.hasPatternFields.brightness.valueFieldNumber` | `5` | `5` |
| `light.command.hasPatternFields.brightness.valueType` | `"float"` | `"float"` |
| `light.command.hasPatternFields.brightness.wireType` | `5` | `WireType.FIXED32` |
| `light.command.hasPatternFields.coldWhite` | \{ `hasFieldNumber`: `24`; `valueFieldNumber`: `25`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.hasPatternFields.coldWhite.hasFieldNumber` | `24` | `24` |
| `light.command.hasPatternFields.coldWhite.valueFieldNumber` | `25` | `25` |
| `light.command.hasPatternFields.coldWhite.valueType` | `"float"` | `"float"` |
| `light.command.hasPatternFields.coldWhite.wireType` | `5` | `WireType.FIXED32` |
| `light.command.hasPatternFields.colorBrightness` | \{ `hasFieldNumber`: `20`; `valueFieldNumber`: `21`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.hasPatternFields.colorBrightness.hasFieldNumber` | `20` | `20` |
| `light.command.hasPatternFields.colorBrightness.valueFieldNumber` | `21` | `21` |
| `light.command.hasPatternFields.colorBrightness.valueType` | `"float"` | `"float"` |
| `light.command.hasPatternFields.colorBrightness.wireType` | `5` | `WireType.FIXED32` |
| `light.command.hasPatternFields.colorMode` | \{ `hasFieldNumber`: `22`; `valueFieldNumber`: `23`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `light.command.hasPatternFields.colorMode.hasFieldNumber` | `22` | `22` |
| `light.command.hasPatternFields.colorMode.valueFieldNumber` | `23` | `23` |
| `light.command.hasPatternFields.colorMode.valueType` | `"enum"` | `"enum"` |
| `light.command.hasPatternFields.colorMode.wireType` | `0` | `WireType.VARINT` |
| `light.command.hasPatternFields.colorTemperature` | \{ `hasFieldNumber`: `12`; `valueFieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.hasPatternFields.colorTemperature.hasFieldNumber` | `12` | `12` |
| `light.command.hasPatternFields.colorTemperature.valueFieldNumber` | `13` | `13` |
| `light.command.hasPatternFields.colorTemperature.valueType` | `"float"` | `"float"` |
| `light.command.hasPatternFields.colorTemperature.wireType` | `5` | `WireType.FIXED32` |
| `light.command.hasPatternFields.effect` | \{ `hasFieldNumber`: `18`; `valueFieldNumber`: `19`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `light.command.hasPatternFields.effect.hasFieldNumber` | `18` | `18` |
| `light.command.hasPatternFields.effect.valueFieldNumber` | `19` | `19` |
| `light.command.hasPatternFields.effect.valueType` | `"string"` | `"string"` |
| `light.command.hasPatternFields.effect.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `light.command.hasPatternFields.flashLength` | \{ `hasFieldNumber`: `16`; `valueFieldNumber`: `17`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `light.command.hasPatternFields.flashLength.hasFieldNumber` | `16` | `16` |
| `light.command.hasPatternFields.flashLength.valueFieldNumber` | `17` | `17` |
| `light.command.hasPatternFields.flashLength.valueType` | `"varint"` | `"varint"` |
| `light.command.hasPatternFields.flashLength.wireType` | `0` | `WireType.VARINT` |
| `light.command.hasPatternFields.state` | \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `light.command.hasPatternFields.state.hasFieldNumber` | `2` | `2` |
| `light.command.hasPatternFields.state.valueFieldNumber` | `3` | `3` |
| `light.command.hasPatternFields.state.valueType` | `"bool"` | `"bool"` |
| `light.command.hasPatternFields.state.wireType` | `0` | `WireType.VARINT` |
| `light.command.hasPatternFields.transitionLength` | \{ `hasFieldNumber`: `14`; `valueFieldNumber`: `15`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `light.command.hasPatternFields.transitionLength.hasFieldNumber` | `14` | `14` |
| `light.command.hasPatternFields.transitionLength.valueFieldNumber` | `15` | `15` |
| `light.command.hasPatternFields.transitionLength.valueType` | `"varint"` | `"varint"` |
| `light.command.hasPatternFields.transitionLength.wireType` | `0` | `WireType.VARINT` |
| `light.command.hasPatternFields.warmWhite` | \{ `hasFieldNumber`: `26`; `valueFieldNumber`: `27`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.hasPatternFields.warmWhite.hasFieldNumber` | `26` | `26` |
| `light.command.hasPatternFields.warmWhite.valueFieldNumber` | `27` | `27` |
| `light.command.hasPatternFields.warmWhite.valueType` | `"float"` | `"float"` |
| `light.command.hasPatternFields.warmWhite.wireType` | `5` | `WireType.FIXED32` |
| `light.command.hasPatternFields.white` | \{ `hasFieldNumber`: `10`; `valueFieldNumber`: `11`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.command.hasPatternFields.white.hasFieldNumber` | `10` | `10` |
| `light.command.hasPatternFields.white.valueFieldNumber` | `11` | `11` |
| `light.command.hasPatternFields.white.valueType` | `"float"` | `"float"` |
| `light.command.hasPatternFields.white.wireType` | `5` | `WireType.FIXED32` |
| `light.command.keyFieldNumber` | `1` | `1` |
| `light.command.messageType` | `32` | `MessageType.LIGHT_COMMAND_REQUEST` |
| `light.listEntities` | \{ `deviceIdFieldNumber`: `16`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedColorModes`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `13`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `14`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxMireds`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `minMireds`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `15`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `effects`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedColorModes`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \} | - |
| `light.listEntities.deviceIdFieldNumber` | `16` | `16` |
| `light.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedColorModes`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \} | - |
| `light.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `light.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `light.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `light.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `light.listEntities.enumMappings.supportedColorModes` | \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \} | `ColorMode` |
| `light.listEntities.enumMappings.supportedColorModes.BRIGHTNESS` | `3` | `3` |
| `light.listEntities.enumMappings.supportedColorModes.COLD_WARM_WHITE` | `19` | `19` |
| `light.listEntities.enumMappings.supportedColorModes.COLOR_TEMPERATURE` | `11` | `11` |
| `light.listEntities.enumMappings.supportedColorModes.ON_OFF` | `1` | `1` |
| `light.listEntities.enumMappings.supportedColorModes.RGB` | `35` | `35` |
| `light.listEntities.enumMappings.supportedColorModes.RGB_COLD_WARM_WHITE` | `51` | `51` |
| `light.listEntities.enumMappings.supportedColorModes.RGB_COLOR_TEMPERATURE` | `47` | `47` |
| `light.listEntities.enumMappings.supportedColorModes.RGB_WHITE` | `39` | `39` |
| `light.listEntities.enumMappings.supportedColorModes.UNKNOWN` | `0` | `0` |
| `light.listEntities.enumMappings.supportedColorModes.WHITE` | `7` | `7` |
| `light.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `13`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `14`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxMireds`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `minMireds`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `light.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `13`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `light.listEntities.fields.disabledByDefault.fieldNumber` | `13` | `13` |
| `light.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `light.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `light.listEntities.fields.entityCategory` | \{ `fieldNumber`: `15`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `light.listEntities.fields.entityCategory.fieldNumber` | `15` | `15` |
| `light.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `light.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `light.listEntities.fields.icon` | \{ `fieldNumber`: `14`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `light.listEntities.fields.icon.fieldNumber` | `14` | `14` |
| `light.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `light.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `light.listEntities.fields.maxMireds` | \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.listEntities.fields.maxMireds.fieldNumber` | `10` | `10` |
| `light.listEntities.fields.maxMireds.valueType` | `"float"` | `"float"` |
| `light.listEntities.fields.maxMireds.wireType` | `5` | `WireType.FIXED32` |
| `light.listEntities.fields.minMireds` | \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.listEntities.fields.minMireds.fieldNumber` | `9` | `9` |
| `light.listEntities.fields.minMireds.valueType` | `"float"` | `"float"` |
| `light.listEntities.fields.minMireds.wireType` | `5` | `WireType.FIXED32` |
| `light.listEntities.keyFieldNumber` | `2` | `2` |
| `light.listEntities.messageType` | `15` | `MessageType.LIST_ENTITIES_LIGHT_RESPONSE` |
| `light.listEntities.nameFieldNumber` | `3` | `3` |
| `light.listEntities.objectIdFieldNumber` | `1` | `1` |
| `light.listEntities.repeatedFields` | \{ `effects`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedColorModes`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `light.listEntities.repeatedFields.effects` | \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `light.listEntities.repeatedFields.effects.fieldNumber` | `11` | `11` |
| `light.listEntities.repeatedFields.effects.valueType` | `"string"` | `"string"` |
| `light.listEntities.repeatedFields.effects.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `light.listEntities.repeatedFields.supportedColorModes` | \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `light.listEntities.repeatedFields.supportedColorModes.fieldNumber` | `12` | `12` |
| `light.listEntities.repeatedFields.supportedColorModes.valueType` | `"enum"` | `"enum"` |
| `light.listEntities.repeatedFields.supportedColorModes.wireType` | `0` | `WireType.VARINT` |
| `light.state` | \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `colorMode`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \}; `fields`: \{ `blue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `brightness`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `fieldNumber`: `12`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `green`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `red`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `warmWhite`: \{ `fieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `24`; \} | - |
| `light.state.deviceIdFieldNumber` | `14` | `14` |
| `light.state.enumMappings` | \{ `colorMode`: \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \}; \} | - |
| `light.state.enumMappings.colorMode` | \{ `BRIGHTNESS`: `3`; `COLD_WARM_WHITE`: `19`; `COLOR_TEMPERATURE`: `11`; `ON_OFF`: `1`; `RGB`: `35`; `RGB_COLD_WARM_WHITE`: `51`; `RGB_COLOR_TEMPERATURE`: `47`; `RGB_WHITE`: `39`; `UNKNOWN`: `0`; `WHITE`: `7`; \} | `ColorMode` |
| `light.state.enumMappings.colorMode.BRIGHTNESS` | `3` | `3` |
| `light.state.enumMappings.colorMode.COLD_WARM_WHITE` | `19` | `19` |
| `light.state.enumMappings.colorMode.COLOR_TEMPERATURE` | `11` | `11` |
| `light.state.enumMappings.colorMode.ON_OFF` | `1` | `1` |
| `light.state.enumMappings.colorMode.RGB` | `35` | `35` |
| `light.state.enumMappings.colorMode.RGB_COLD_WARM_WHITE` | `51` | `51` |
| `light.state.enumMappings.colorMode.RGB_COLOR_TEMPERATURE` | `47` | `47` |
| `light.state.enumMappings.colorMode.RGB_WHITE` | `39` | `39` |
| `light.state.enumMappings.colorMode.UNKNOWN` | `0` | `0` |
| `light.state.enumMappings.colorMode.WHITE` | `7` | `7` |
| `light.state.fields` | \{ `blue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `brightness`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `coldWhite`: \{ `fieldNumber`: `12`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorBrightness`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `colorMode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `colorTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `effect`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `green`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `red`: \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `warmWhite`: \{ `fieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \}; `white`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `light.state.fields.blue` | \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.blue.fieldNumber` | `6` | `6` |
| `light.state.fields.blue.valueType` | `"float"` | `"float"` |
| `light.state.fields.blue.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.brightness` | \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.brightness.fieldNumber` | `3` | `3` |
| `light.state.fields.brightness.valueType` | `"float"` | `"float"` |
| `light.state.fields.brightness.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.coldWhite` | \{ `fieldNumber`: `12`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.coldWhite.fieldNumber` | `12` | `12` |
| `light.state.fields.coldWhite.valueType` | `"float"` | `"float"` |
| `light.state.fields.coldWhite.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.colorBrightness` | \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.colorBrightness.fieldNumber` | `10` | `10` |
| `light.state.fields.colorBrightness.valueType` | `"float"` | `"float"` |
| `light.state.fields.colorBrightness.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.colorMode` | \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `light.state.fields.colorMode.fieldNumber` | `11` | `11` |
| `light.state.fields.colorMode.valueType` | `"enum"` | `"enum"` |
| `light.state.fields.colorMode.wireType` | `0` | `WireType.VARINT` |
| `light.state.fields.colorTemperature` | \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.colorTemperature.fieldNumber` | `8` | `8` |
| `light.state.fields.colorTemperature.valueType` | `"float"` | `"float"` |
| `light.state.fields.colorTemperature.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.effect` | \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `light.state.fields.effect.fieldNumber` | `9` | `9` |
| `light.state.fields.effect.valueType` | `"string"` | `"string"` |
| `light.state.fields.effect.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `light.state.fields.green` | \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.green.fieldNumber` | `5` | `5` |
| `light.state.fields.green.valueType` | `"float"` | `"float"` |
| `light.state.fields.green.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.red` | \{ `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.red.fieldNumber` | `4` | `4` |
| `light.state.fields.red.valueType` | `"float"` | `"float"` |
| `light.state.fields.red.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `light.state.fields.state.fieldNumber` | `2` | `2` |
| `light.state.fields.state.valueType` | `"bool"` | `"bool"` |
| `light.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `light.state.fields.warmWhite` | \{ `fieldNumber`: `13`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.warmWhite.fieldNumber` | `13` | `13` |
| `light.state.fields.warmWhite.valueType` | `"float"` | `"float"` |
| `light.state.fields.warmWhite.wireType` | `5` | `WireType.FIXED32` |
| `light.state.fields.white` | \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `light.state.fields.white.fieldNumber` | `7` | `7` |
| `light.state.fields.white.valueType` | `"float"` | `"float"` |
| `light.state.fields.white.wireType` | `5` | `WireType.FIXED32` |
| `light.state.keyFieldNumber` | `1` | `1` |
| `light.state.messageType` | `24` | `MessageType.LIGHT_STATE_RESPONSE` |
| `light.type` | `"light"` | `"light"` |
| <a id="property-lock"></a> `lock` | \{ `command`: \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `command`: \{ `lock`: `1`; `open`: `2`; `unlock`: `0`; \}; \}; `fields`: \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `code`: \{ `hasFieldNumber`: `3`; `valueFieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `60`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `codeFormat`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOpen`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `58`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `state`: \{ `JAMMED`: `3`; `LOCKED`: `1`; `LOCKING`: `4`; `NONE`: `0`; `OPEN`: `7`; `OPENING`: `6`; `UNLOCKED`: `2`; `UNLOCKING`: `5`; \}; \}; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `59`; \}; `type`: `"lock"`; \} | - |
| `lock.command` | \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `command`: \{ `lock`: `1`; `open`: `2`; `unlock`: `0`; \}; \}; `fields`: \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `code`: \{ `hasFieldNumber`: `3`; `valueFieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `60`; \} | - |
| `lock.command.deviceIdFieldNumber` | `5` | `5` |
| `lock.command.enumMappings` | \{ `command`: \{ `lock`: `1`; `open`: `2`; `unlock`: `0`; \}; \} | - |
| `lock.command.enumMappings.command` | \{ `lock`: `1`; `open`: `2`; `unlock`: `0`; \} | - |
| `lock.command.enumMappings.command.lock` | `1` | `1` |
| `lock.command.enumMappings.command.open` | `2` | `2` |
| `lock.command.enumMappings.command.unlock` | `0` | `0` |
| `lock.command.fields` | \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `lock.command.fields.command` | \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `lock.command.fields.command.fieldNumber` | `2` | `2` |
| `lock.command.fields.command.valueType` | `"enum"` | `"enum"` |
| `lock.command.fields.command.wireType` | `0` | `WireType.VARINT` |
| `lock.command.hasPatternFields` | \{ `code`: \{ `hasFieldNumber`: `3`; `valueFieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `lock.command.hasPatternFields.code` | \{ `hasFieldNumber`: `3`; `valueFieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `lock.command.hasPatternFields.code.hasFieldNumber` | `3` | `3` |
| `lock.command.hasPatternFields.code.valueFieldNumber` | `4` | `4` |
| `lock.command.hasPatternFields.code.valueType` | `"string"` | `"string"` |
| `lock.command.hasPatternFields.code.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `lock.command.keyFieldNumber` | `1` | `1` |
| `lock.command.messageType` | `60` | `MessageType.LOCK_COMMAND_REQUEST` |
| `lock.listEntities` | \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `codeFormat`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOpen`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `58`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `lock.listEntities.deviceIdFieldNumber` | `12` | `12` |
| `lock.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `lock.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `lock.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `lock.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `lock.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `lock.listEntities.fields` | \{ `assumedState`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `codeFormat`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `requiresCode`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsOpen`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `lock.listEntities.fields.assumedState` | \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `lock.listEntities.fields.assumedState.fieldNumber` | `8` | `8` |
| `lock.listEntities.fields.assumedState.valueType` | `"bool"` | `"bool"` |
| `lock.listEntities.fields.assumedState.wireType` | `0` | `WireType.VARINT` |
| `lock.listEntities.fields.codeFormat` | \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `lock.listEntities.fields.codeFormat.fieldNumber` | `11` | `11` |
| `lock.listEntities.fields.codeFormat.valueType` | `"string"` | `"string"` |
| `lock.listEntities.fields.codeFormat.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `lock.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `lock.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `lock.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `lock.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `lock.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `lock.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `lock.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `lock.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `lock.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `lock.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `lock.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `lock.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `lock.listEntities.fields.requiresCode` | \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `lock.listEntities.fields.requiresCode.fieldNumber` | `10` | `10` |
| `lock.listEntities.fields.requiresCode.valueType` | `"bool"` | `"bool"` |
| `lock.listEntities.fields.requiresCode.wireType` | `0` | `WireType.VARINT` |
| `lock.listEntities.fields.supportsOpen` | \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `lock.listEntities.fields.supportsOpen.fieldNumber` | `9` | `9` |
| `lock.listEntities.fields.supportsOpen.valueType` | `"bool"` | `"bool"` |
| `lock.listEntities.fields.supportsOpen.wireType` | `0` | `WireType.VARINT` |
| `lock.listEntities.keyFieldNumber` | `2` | `2` |
| `lock.listEntities.messageType` | `58` | `MessageType.LIST_ENTITIES_LOCK_RESPONSE` |
| `lock.listEntities.nameFieldNumber` | `3` | `3` |
| `lock.listEntities.objectIdFieldNumber` | `1` | `1` |
| `lock.state` | \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `state`: \{ `JAMMED`: `3`; `LOCKED`: `1`; `LOCKING`: `4`; `NONE`: `0`; `OPEN`: `7`; `OPENING`: `6`; `UNLOCKED`: `2`; `UNLOCKING`: `5`; \}; \}; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `59`; \} | - |
| `lock.state.deviceIdFieldNumber` | `3` | `3` |
| `lock.state.enumMappings` | \{ `state`: \{ `JAMMED`: `3`; `LOCKED`: `1`; `LOCKING`: `4`; `NONE`: `0`; `OPEN`: `7`; `OPENING`: `6`; `UNLOCKED`: `2`; `UNLOCKING`: `5`; \}; \} | - |
| `lock.state.enumMappings.state` | \{ `JAMMED`: `3`; `LOCKED`: `1`; `LOCKING`: `4`; `NONE`: `0`; `OPEN`: `7`; `OPENING`: `6`; `UNLOCKED`: `2`; `UNLOCKING`: `5`; \} | `LockState` |
| `lock.state.enumMappings.state.JAMMED` | `3` | `3` |
| `lock.state.enumMappings.state.LOCKED` | `1` | `1` |
| `lock.state.enumMappings.state.LOCKING` | `4` | `4` |
| `lock.state.enumMappings.state.NONE` | `0` | `0` |
| `lock.state.enumMappings.state.OPEN` | `7` | `7` |
| `lock.state.enumMappings.state.OPENING` | `6` | `6` |
| `lock.state.enumMappings.state.UNLOCKED` | `2` | `2` |
| `lock.state.enumMappings.state.UNLOCKING` | `5` | `5` |
| `lock.state.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `lock.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `lock.state.fields.state.fieldNumber` | `2` | `2` |
| `lock.state.fields.state.valueType` | `"enum"` | `"enum"` |
| `lock.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `lock.state.keyFieldNumber` | `1` | `1` |
| `lock.state.messageType` | `59` | `MessageType.LOCK_STATE_RESPONSE` |
| `lock.type` | `"lock"` | `"lock"` |
| <a id="property-media_player"></a> `media_player` | \{ `command`: \{ `deviceIdFieldNumber`: `10`; `fields`: \{ \}; `hasPatternFields`: \{ `announcement`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `command`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mediaUrl`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `65`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `featureFlags`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPause`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `63`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedMessageFields`: \{ `supportedFormats`: \{ `enumMappings`: \{ `purpose`: \{ `ANNOUNCEMENT`: `1`; `DEFAULT`: `0`; \}; \}; `fieldNumber`: `9`; `fields`: \{ `format`: \{ `fieldNumber`: `1`; `valueType`: `"string"`; `wireType`: `2`; \}; `numChannels`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `purpose`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `sampleBytes`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `sampleRate`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `state`: \{ `ANNOUNCING`: `4`; `IDLE`: `1`; `NONE`: `0`; `OFF`: `5`; `ON`: `6`; `PAUSED`: `3`; `PLAYING`: `2`; \}; \}; `fields`: \{ `muted`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `volume`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `64`; \}; `type`: `"media_player"`; \} | - |
| `media_player.command` | \{ `deviceIdFieldNumber`: `10`; `fields`: \{ \}; `hasPatternFields`: \{ `announcement`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `command`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mediaUrl`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `65`; \} | - |
| `media_player.command.deviceIdFieldNumber` | `10` | `10` |
| `media_player.command.fields` | \{ \} | `{}` |
| `media_player.command.hasPatternFields` | \{ `announcement`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `command`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `mediaUrl`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `media_player.command.hasPatternFields.announcement` | \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `media_player.command.hasPatternFields.announcement.hasFieldNumber` | `8` | `8` |
| `media_player.command.hasPatternFields.announcement.valueFieldNumber` | `9` | `9` |
| `media_player.command.hasPatternFields.announcement.valueType` | `"bool"` | `"bool"` |
| `media_player.command.hasPatternFields.announcement.wireType` | `0` | `WireType.VARINT` |
| `media_player.command.hasPatternFields.command` | \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `media_player.command.hasPatternFields.command.hasFieldNumber` | `2` | `2` |
| `media_player.command.hasPatternFields.command.valueFieldNumber` | `3` | `3` |
| `media_player.command.hasPatternFields.command.valueType` | `"enum"` | `"enum"` |
| `media_player.command.hasPatternFields.command.wireType` | `0` | `WireType.VARINT` |
| `media_player.command.hasPatternFields.mediaUrl` | \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `media_player.command.hasPatternFields.mediaUrl.hasFieldNumber` | `6` | `6` |
| `media_player.command.hasPatternFields.mediaUrl.valueFieldNumber` | `7` | `7` |
| `media_player.command.hasPatternFields.mediaUrl.valueType` | `"string"` | `"string"` |
| `media_player.command.hasPatternFields.mediaUrl.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `media_player.command.hasPatternFields.volume` | \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `media_player.command.hasPatternFields.volume.hasFieldNumber` | `4` | `4` |
| `media_player.command.hasPatternFields.volume.valueFieldNumber` | `5` | `5` |
| `media_player.command.hasPatternFields.volume.valueType` | `"float"` | `"float"` |
| `media_player.command.hasPatternFields.volume.wireType` | `5` | `WireType.FIXED32` |
| `media_player.command.keyFieldNumber` | `1` | `1` |
| `media_player.command.messageType` | `65` | `MessageType.MEDIA_PLAYER_COMMAND_REQUEST` |
| `media_player.listEntities` | \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `featureFlags`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPause`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `63`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedMessageFields`: \{ `supportedFormats`: \{ `enumMappings`: \{ `purpose`: \{ `ANNOUNCEMENT`: `1`; `DEFAULT`: `0`; \}; \}; `fieldNumber`: `9`; `fields`: \{ `format`: \{ `fieldNumber`: `1`; `valueType`: `"string"`; `wireType`: `2`; \}; `numChannels`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `purpose`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `sampleBytes`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `sampleRate`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `wireType`: `2`; \}; \}; \} | - |
| `media_player.listEntities.deviceIdFieldNumber` | `10` | `10` |
| `media_player.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `media_player.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `media_player.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `media_player.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `media_player.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `media_player.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `featureFlags`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPause`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `media_player.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `media_player.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `media_player.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `media_player.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `media_player.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.fields.featureFlags` | \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.fields.featureFlags.fieldNumber` | `11` | `11` |
| `media_player.listEntities.fields.featureFlags.valueType` | `"varint"` | `"varint"` |
| `media_player.listEntities.fields.featureFlags.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `media_player.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `media_player.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `media_player.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `media_player.listEntities.fields.supportsPause` | \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.fields.supportsPause.fieldNumber` | `8` | `8` |
| `media_player.listEntities.fields.supportsPause.valueType` | `"bool"` | `"bool"` |
| `media_player.listEntities.fields.supportsPause.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.keyFieldNumber` | `2` | `2` |
| `media_player.listEntities.messageType` | `63` | `MessageType.LIST_ENTITIES_MEDIA_PLAYER_RESPONSE` |
| `media_player.listEntities.nameFieldNumber` | `3` | `3` |
| `media_player.listEntities.objectIdFieldNumber` | `1` | `1` |
| `media_player.listEntities.repeatedMessageFields` | \{ `supportedFormats`: \{ `enumMappings`: \{ `purpose`: \{ `ANNOUNCEMENT`: `1`; `DEFAULT`: `0`; \}; \}; `fieldNumber`: `9`; `fields`: \{ `format`: \{ `fieldNumber`: `1`; `valueType`: `"string"`; `wireType`: `2`; \}; `numChannels`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `purpose`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `sampleBytes`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `sampleRate`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `wireType`: `2`; \}; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats` | \{ `enumMappings`: \{ `purpose`: \{ `ANNOUNCEMENT`: `1`; `DEFAULT`: `0`; \}; \}; `fieldNumber`: `9`; `fields`: \{ `format`: \{ `fieldNumber`: `1`; `valueType`: `"string"`; `wireType`: `2`; \}; `numChannels`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `purpose`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `sampleBytes`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `sampleRate`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `wireType`: `2`; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.enumMappings` | \{ `purpose`: \{ `ANNOUNCEMENT`: `1`; `DEFAULT`: `0`; \}; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.enumMappings.purpose` | \{ `ANNOUNCEMENT`: `1`; `DEFAULT`: `0`; \} | `MediaPlayerFormatPurpose` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.enumMappings.purpose.ANNOUNCEMENT` | `1` | `1` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.enumMappings.purpose.DEFAULT` | `0` | `0` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fieldNumber` | `9` | `9` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields` | \{ `format`: \{ `fieldNumber`: `1`; `valueType`: `"string"`; `wireType`: `2`; \}; `numChannels`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `purpose`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `sampleBytes`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; `sampleRate`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.format` | \{ `fieldNumber`: `1`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.format.fieldNumber` | `1` | `1` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.format.valueType` | `"string"` | `"string"` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.format.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.numChannels` | \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.numChannels.fieldNumber` | `3` | `3` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.numChannels.valueType` | `"varint"` | `"varint"` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.numChannels.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.purpose` | \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.purpose.fieldNumber` | `4` | `4` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.purpose.valueType` | `"enum"` | `"enum"` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.purpose.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleBytes` | \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleBytes.fieldNumber` | `5` | `5` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleBytes.valueType` | `"varint"` | `"varint"` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleBytes.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleRate` | \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleRate.fieldNumber` | `2` | `2` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleRate.valueType` | `"varint"` | `"varint"` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.fields.sampleRate.wireType` | `0` | `WireType.VARINT` |
| `media_player.listEntities.repeatedMessageFields.supportedFormats.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `media_player.state` | \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `state`: \{ `ANNOUNCING`: `4`; `IDLE`: `1`; `NONE`: `0`; `OFF`: `5`; `ON`: `6`; `PAUSED`: `3`; `PLAYING`: `2`; \}; \}; `fields`: \{ `muted`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `volume`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `64`; \} | - |
| `media_player.state.deviceIdFieldNumber` | `5` | `5` |
| `media_player.state.enumMappings` | \{ `state`: \{ `ANNOUNCING`: `4`; `IDLE`: `1`; `NONE`: `0`; `OFF`: `5`; `ON`: `6`; `PAUSED`: `3`; `PLAYING`: `2`; \}; \} | - |
| `media_player.state.enumMappings.state` | \{ `ANNOUNCING`: `4`; `IDLE`: `1`; `NONE`: `0`; `OFF`: `5`; `ON`: `6`; `PAUSED`: `3`; `PLAYING`: `2`; \} | `MediaPlayerState` |
| `media_player.state.enumMappings.state.ANNOUNCING` | `4` | `4` |
| `media_player.state.enumMappings.state.IDLE` | `1` | `1` |
| `media_player.state.enumMappings.state.NONE` | `0` | `0` |
| `media_player.state.enumMappings.state.OFF` | `5` | `5` |
| `media_player.state.enumMappings.state.ON` | `6` | `6` |
| `media_player.state.enumMappings.state.PAUSED` | `3` | `3` |
| `media_player.state.enumMappings.state.PLAYING` | `2` | `2` |
| `media_player.state.fields` | \{ `muted`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; `volume`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `media_player.state.fields.muted` | \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `media_player.state.fields.muted.fieldNumber` | `4` | `4` |
| `media_player.state.fields.muted.valueType` | `"bool"` | `"bool"` |
| `media_player.state.fields.muted.wireType` | `0` | `WireType.VARINT` |
| `media_player.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `media_player.state.fields.state.fieldNumber` | `2` | `2` |
| `media_player.state.fields.state.valueType` | `"enum"` | `"enum"` |
| `media_player.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `media_player.state.fields.volume` | \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `media_player.state.fields.volume.fieldNumber` | `3` | `3` |
| `media_player.state.fields.volume.valueType` | `"float"` | `"float"` |
| `media_player.state.fields.volume.wireType` | `5` | `WireType.FIXED32` |
| `media_player.state.keyFieldNumber` | `1` | `1` |
| `media_player.state.messageType` | `64` | `MessageType.MEDIA_PLAYER_STATE_RESPONSE` |
| `media_player.type` | `"media_player"` | `"media_player"` |
| <a id="property-number"></a> `number` | \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `51`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `AUTO`: `0`; `BOX`: `1`; `SLIDER`: `2`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxValue`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; `minValue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `step`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `49`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `50`; \}; `type`: `"number"`; \} | - |
| `number.command` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `51`; \} | - |
| `number.command.deviceIdFieldNumber` | `3` | `3` |
| `number.command.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `number.command.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `number.command.fields.state.fieldNumber` | `2` | `2` |
| `number.command.fields.state.valueType` | `"float"` | `"float"` |
| `number.command.fields.state.wireType` | `5` | `WireType.FIXED32` |
| `number.command.hasPatternFields` | \{ \} | `{}` |
| `number.command.keyFieldNumber` | `1` | `1` |
| `number.command.messageType` | `51` | `MessageType.NUMBER_COMMAND_REQUEST` |
| `number.listEntities` | \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `AUTO`: `0`; `BOX`: `1`; `SLIDER`: `2`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxValue`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; `minValue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `step`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `49`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `number.listEntities.deviceIdFieldNumber` | `14` | `14` |
| `number.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `AUTO`: `0`; `BOX`: `1`; `SLIDER`: `2`; \}; \} | - |
| `number.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `number.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `number.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `number.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `number.listEntities.enumMappings.mode` | \{ `AUTO`: `0`; `BOX`: `1`; `SLIDER`: `2`; \} | `NumberMode` |
| `number.listEntities.enumMappings.mode.AUTO` | `0` | `0` |
| `number.listEntities.enumMappings.mode.BOX` | `1` | `1` |
| `number.listEntities.enumMappings.mode.SLIDER` | `2` | `2` |
| `number.listEntities.fields` | \{ `deviceClass`: \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxValue`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; `minValue`: \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \}; `step`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `number.listEntities.fields.deviceClass` | \{ `fieldNumber`: `13`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `number.listEntities.fields.deviceClass.fieldNumber` | `13` | `13` |
| `number.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `number.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `number.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `number.listEntities.fields.disabledByDefault.fieldNumber` | `9` | `9` |
| `number.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `number.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `number.listEntities.fields.entityCategory` | \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `number.listEntities.fields.entityCategory.fieldNumber` | `10` | `10` |
| `number.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `number.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `number.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `number.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `number.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `number.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `number.listEntities.fields.maxValue` | \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `number.listEntities.fields.maxValue.fieldNumber` | `7` | `7` |
| `number.listEntities.fields.maxValue.valueType` | `"float"` | `"float"` |
| `number.listEntities.fields.maxValue.wireType` | `5` | `WireType.FIXED32` |
| `number.listEntities.fields.minValue` | \{ `fieldNumber`: `6`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `number.listEntities.fields.minValue.fieldNumber` | `6` | `6` |
| `number.listEntities.fields.minValue.valueType` | `"float"` | `"float"` |
| `number.listEntities.fields.minValue.wireType` | `5` | `WireType.FIXED32` |
| `number.listEntities.fields.mode` | \{ `fieldNumber`: `12`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `number.listEntities.fields.mode.fieldNumber` | `12` | `12` |
| `number.listEntities.fields.mode.valueType` | `"enum"` | `"enum"` |
| `number.listEntities.fields.mode.wireType` | `0` | `WireType.VARINT` |
| `number.listEntities.fields.step` | \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `number.listEntities.fields.step.fieldNumber` | `8` | `8` |
| `number.listEntities.fields.step.valueType` | `"float"` | `"float"` |
| `number.listEntities.fields.step.wireType` | `5` | `WireType.FIXED32` |
| `number.listEntities.fields.unitOfMeasurement` | \{ `fieldNumber`: `11`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `number.listEntities.fields.unitOfMeasurement.fieldNumber` | `11` | `11` |
| `number.listEntities.fields.unitOfMeasurement.valueType` | `"string"` | `"string"` |
| `number.listEntities.fields.unitOfMeasurement.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `number.listEntities.keyFieldNumber` | `2` | `2` |
| `number.listEntities.messageType` | `49` | `MessageType.LIST_ENTITIES_NUMBER_RESPONSE` |
| `number.listEntities.nameFieldNumber` | `3` | `3` |
| `number.listEntities.objectIdFieldNumber` | `1` | `1` |
| `number.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `50`; \} | - |
| `number.state.deviceIdFieldNumber` | `4` | `4` |
| `number.state.fields` | \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `number.state.fields.missingState` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `number.state.fields.missingState.fieldNumber` | `3` | `3` |
| `number.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `number.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `number.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `number.state.fields.state.fieldNumber` | `2` | `2` |
| `number.state.fields.state.valueType` | `"float"` | `"float"` |
| `number.state.fields.state.wireType` | `5` | `WireType.FIXED32` |
| `number.state.keyFieldNumber` | `1` | `1` |
| `number.state.messageType` | `50` | `MessageType.NUMBER_STATE_RESPONSE` |
| `number.type` | `"number"` | `"number"` |
| <a id="property-radio_frequency"></a> `radio_frequency` | \{ `command`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `2`; `messageType`: `136`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `frequencyMax`: \{ `fieldNumber`: `10`; `valueType`: `"varint"`; `wireType`: `0`; \}; `frequencyMin`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedModulations`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `148`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `137`; \}; `type`: `"radio_frequency"`; \} | - |
| `radio_frequency.command` | \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `2`; `messageType`: `136`; \} | - |
| `radio_frequency.command.deviceIdFieldNumber` | `1` | `1` |
| `radio_frequency.command.fields` | \{ `carrierFrequency`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `modulation`: \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \}; `repeatCount`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `timings`: \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \} | - |
| `radio_frequency.command.fields.carrierFrequency` | \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `radio_frequency.command.fields.carrierFrequency.fieldNumber` | `3` | `3` |
| `radio_frequency.command.fields.carrierFrequency.valueType` | `"varint"` | `"varint"` |
| `radio_frequency.command.fields.carrierFrequency.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.command.fields.modulation` | \{ `fieldNumber`: `6`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `radio_frequency.command.fields.modulation.fieldNumber` | `6` | `6` |
| `radio_frequency.command.fields.modulation.valueType` | `"varint"` | `"varint"` |
| `radio_frequency.command.fields.modulation.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.command.fields.repeatCount` | \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `radio_frequency.command.fields.repeatCount.fieldNumber` | `4` | `4` |
| `radio_frequency.command.fields.repeatCount.valueType` | `"varint"` | `"varint"` |
| `radio_frequency.command.fields.repeatCount.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.command.fields.timings` | \{ `fieldNumber`: `5`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \} | - |
| `radio_frequency.command.fields.timings.fieldNumber` | `5` | `5` |
| `radio_frequency.command.fields.timings.valueType` | `"sint32-packed"` | `"sint32-packed"` |
| `radio_frequency.command.fields.timings.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `radio_frequency.command.hasPatternFields` | \{ \} | `{}` |
| `radio_frequency.command.keyFieldNumber` | `2` | `2` |
| `radio_frequency.command.messageType` | `136` | `MessageType.INFRARED_RF_TRANSMIT_RAW_TIMINGS_REQUEST` |
| `radio_frequency.listEntities` | \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `frequencyMax`: \{ `fieldNumber`: `10`; `valueType`: `"varint"`; `wireType`: `0`; \}; `frequencyMin`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedModulations`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `148`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `radio_frequency.listEntities.deviceIdFieldNumber` | `7` | `7` |
| `radio_frequency.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `radio_frequency.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `radio_frequency.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `radio_frequency.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `radio_frequency.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `radio_frequency.listEntities.fields` | \{ `capabilities`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `frequencyMax`: \{ `fieldNumber`: `10`; `valueType`: `"varint"`; `wireType`: `0`; \}; `frequencyMin`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportedModulations`: \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `radio_frequency.listEntities.fields.capabilities` | \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `radio_frequency.listEntities.fields.capabilities.fieldNumber` | `8` | `8` |
| `radio_frequency.listEntities.fields.capabilities.valueType` | `"varint"` | `"varint"` |
| `radio_frequency.listEntities.fields.capabilities.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `radio_frequency.listEntities.fields.disabledByDefault.fieldNumber` | `5` | `5` |
| `radio_frequency.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `radio_frequency.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.listEntities.fields.entityCategory` | \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `radio_frequency.listEntities.fields.entityCategory.fieldNumber` | `6` | `6` |
| `radio_frequency.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `radio_frequency.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.listEntities.fields.frequencyMax` | \{ `fieldNumber`: `10`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `radio_frequency.listEntities.fields.frequencyMax.fieldNumber` | `10` | `10` |
| `radio_frequency.listEntities.fields.frequencyMax.valueType` | `"varint"` | `"varint"` |
| `radio_frequency.listEntities.fields.frequencyMax.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.listEntities.fields.frequencyMin` | \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `radio_frequency.listEntities.fields.frequencyMin.fieldNumber` | `9` | `9` |
| `radio_frequency.listEntities.fields.frequencyMin.valueType` | `"varint"` | `"varint"` |
| `radio_frequency.listEntities.fields.frequencyMin.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.listEntities.fields.icon` | \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `radio_frequency.listEntities.fields.icon.fieldNumber` | `4` | `4` |
| `radio_frequency.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `radio_frequency.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `radio_frequency.listEntities.fields.supportedModulations` | \{ `fieldNumber`: `11`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `radio_frequency.listEntities.fields.supportedModulations.fieldNumber` | `11` | `11` |
| `radio_frequency.listEntities.fields.supportedModulations.valueType` | `"varint"` | `"varint"` |
| `radio_frequency.listEntities.fields.supportedModulations.wireType` | `0` | `WireType.VARINT` |
| `radio_frequency.listEntities.keyFieldNumber` | `2` | `2` |
| `radio_frequency.listEntities.messageType` | `148` | `MessageType.LIST_ENTITIES_RADIO_FREQUENCY_RESPONSE` |
| `radio_frequency.listEntities.nameFieldNumber` | `3` | `3` |
| `radio_frequency.listEntities.objectIdFieldNumber` | `1` | `1` |
| `radio_frequency.state` | \{ `deviceIdFieldNumber`: `1`; `fields`: \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `137`; \} | - |
| `radio_frequency.state.deviceIdFieldNumber` | `1` | `1` |
| `radio_frequency.state.fields` | \{ `timings`: \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \}; \} | - |
| `radio_frequency.state.fields.timings` | \{ `fieldNumber`: `3`; `valueType`: `"sint32-packed"`; `wireType`: `2`; \} | - |
| `radio_frequency.state.fields.timings.fieldNumber` | `3` | `3` |
| `radio_frequency.state.fields.timings.valueType` | `"sint32-packed"` | `"sint32-packed"` |
| `radio_frequency.state.fields.timings.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `radio_frequency.state.keyFieldNumber` | `2` | `2` |
| `radio_frequency.state.messageType` | `137` | `MessageType.INFRARED_RF_RECEIVE_EVENT` |
| `radio_frequency.type` | `"radio_frequency"` | `"radio_frequency"` |
| <a id="property-select"></a> `select` | \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `54`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `52`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `options`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `53`; \}; `type`: `"select"`; \} | - |
| `select.command` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `54`; \} | - |
| `select.command.deviceIdFieldNumber` | `3` | `3` |
| `select.command.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `select.command.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `select.command.fields.state.fieldNumber` | `2` | `2` |
| `select.command.fields.state.valueType` | `"string"` | `"string"` |
| `select.command.fields.state.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `select.command.hasPatternFields` | \{ \} | `{}` |
| `select.command.keyFieldNumber` | `1` | `1` |
| `select.command.messageType` | `54` | `MessageType.SELECT_COMMAND_REQUEST` |
| `select.listEntities` | \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `52`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `options`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \} | - |
| `select.listEntities.deviceIdFieldNumber` | `9` | `9` |
| `select.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `select.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `select.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `select.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `select.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `select.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `select.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `select.listEntities.fields.disabledByDefault.fieldNumber` | `7` | `7` |
| `select.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `select.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `select.listEntities.fields.entityCategory` | \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `select.listEntities.fields.entityCategory.fieldNumber` | `8` | `8` |
| `select.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `select.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `select.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `select.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `select.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `select.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `select.listEntities.keyFieldNumber` | `2` | `2` |
| `select.listEntities.messageType` | `52` | `MessageType.LIST_ENTITIES_SELECT_RESPONSE` |
| `select.listEntities.nameFieldNumber` | `3` | `3` |
| `select.listEntities.objectIdFieldNumber` | `1` | `1` |
| `select.listEntities.repeatedFields` | \{ `options`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `select.listEntities.repeatedFields.options` | \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `select.listEntities.repeatedFields.options.fieldNumber` | `6` | `6` |
| `select.listEntities.repeatedFields.options.valueType` | `"string"` | `"string"` |
| `select.listEntities.repeatedFields.options.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `select.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `53`; \} | - |
| `select.state.deviceIdFieldNumber` | `4` | `4` |
| `select.state.fields` | \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `select.state.fields.missingState` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `select.state.fields.missingState.fieldNumber` | `3` | `3` |
| `select.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `select.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `select.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `select.state.fields.state.fieldNumber` | `2` | `2` |
| `select.state.fields.state.valueType` | `"string"` | `"string"` |
| `select.state.fields.state.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `select.state.keyFieldNumber` | `1` | `1` |
| `select.state.messageType` | `53` | `MessageType.SELECT_STATE_RESPONSE` |
| `select.type` | `"select"` | `"select"` |
| <a id="property-sensor"></a> `sensor` | \{ `listEntities`: \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `stateClass`: \{ `MEASUREMENT`: `1`; `MEASUREMENT_ANGLE`: `4`; `NONE`: `0`; `TOTAL`: `3`; `TOTAL_INCREASING`: `2`; \}; \}; `fields`: \{ `accuracyDecimals`: \{ `fieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `forceUpdate`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `stateClass`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `16`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `25`; \}; `type`: `"sensor"`; \} | - |
| `sensor.listEntities` | \{ `deviceIdFieldNumber`: `14`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `stateClass`: \{ `MEASUREMENT`: `1`; `MEASUREMENT_ANGLE`: `4`; `NONE`: `0`; `TOTAL`: `3`; `TOTAL_INCREASING`: `2`; \}; \}; `fields`: \{ `accuracyDecimals`: \{ `fieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `forceUpdate`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `stateClass`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `16`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `sensor.listEntities.deviceIdFieldNumber` | `14` | `14` |
| `sensor.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `stateClass`: \{ `MEASUREMENT`: `1`; `MEASUREMENT_ANGLE`: `4`; `NONE`: `0`; `TOTAL`: `3`; `TOTAL_INCREASING`: `2`; \}; \} | - |
| `sensor.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `sensor.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `sensor.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `sensor.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `sensor.listEntities.enumMappings.stateClass` | \{ `MEASUREMENT`: `1`; `MEASUREMENT_ANGLE`: `4`; `NONE`: `0`; `TOTAL`: `3`; `TOTAL_INCREASING`: `2`; \} | `SensorStateClass` |
| `sensor.listEntities.enumMappings.stateClass.MEASUREMENT` | `1` | `1` |
| `sensor.listEntities.enumMappings.stateClass.MEASUREMENT_ANGLE` | `4` | `4` |
| `sensor.listEntities.enumMappings.stateClass.NONE` | `0` | `0` |
| `sensor.listEntities.enumMappings.stateClass.TOTAL` | `3` | `3` |
| `sensor.listEntities.enumMappings.stateClass.TOTAL_INCREASING` | `2` | `2` |
| `sensor.listEntities.fields` | \{ `accuracyDecimals`: \{ `fieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; `forceUpdate`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `stateClass`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `unitOfMeasurement`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `sensor.listEntities.fields.accuracyDecimals` | \{ `fieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `sensor.listEntities.fields.accuracyDecimals.fieldNumber` | `7` | `7` |
| `sensor.listEntities.fields.accuracyDecimals.valueType` | `"varint"` | `"varint"` |
| `sensor.listEntities.fields.accuracyDecimals.wireType` | `0` | `WireType.VARINT` |
| `sensor.listEntities.fields.deviceClass` | \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `sensor.listEntities.fields.deviceClass.fieldNumber` | `9` | `9` |
| `sensor.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `sensor.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `sensor.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `12`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `sensor.listEntities.fields.disabledByDefault.fieldNumber` | `12` | `12` |
| `sensor.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `sensor.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `sensor.listEntities.fields.entityCategory` | \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `sensor.listEntities.fields.entityCategory.fieldNumber` | `13` | `13` |
| `sensor.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `sensor.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `sensor.listEntities.fields.forceUpdate` | \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `sensor.listEntities.fields.forceUpdate.fieldNumber` | `8` | `8` |
| `sensor.listEntities.fields.forceUpdate.valueType` | `"bool"` | `"bool"` |
| `sensor.listEntities.fields.forceUpdate.wireType` | `0` | `WireType.VARINT` |
| `sensor.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `sensor.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `sensor.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `sensor.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `sensor.listEntities.fields.stateClass` | \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `sensor.listEntities.fields.stateClass.fieldNumber` | `10` | `10` |
| `sensor.listEntities.fields.stateClass.valueType` | `"enum"` | `"enum"` |
| `sensor.listEntities.fields.stateClass.wireType` | `0` | `WireType.VARINT` |
| `sensor.listEntities.fields.unitOfMeasurement` | \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `sensor.listEntities.fields.unitOfMeasurement.fieldNumber` | `6` | `6` |
| `sensor.listEntities.fields.unitOfMeasurement.valueType` | `"string"` | `"string"` |
| `sensor.listEntities.fields.unitOfMeasurement.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `sensor.listEntities.keyFieldNumber` | `2` | `2` |
| `sensor.listEntities.messageType` | `16` | `MessageType.LIST_ENTITIES_SENSOR_RESPONSE` |
| `sensor.listEntities.nameFieldNumber` | `3` | `3` |
| `sensor.listEntities.objectIdFieldNumber` | `1` | `1` |
| `sensor.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `25`; \} | - |
| `sensor.state.deviceIdFieldNumber` | `4` | `4` |
| `sensor.state.fields` | \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `sensor.state.fields.missingState` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `sensor.state.fields.missingState.fieldNumber` | `3` | `3` |
| `sensor.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `sensor.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `sensor.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `sensor.state.fields.state.fieldNumber` | `2` | `2` |
| `sensor.state.fields.state.valueType` | `"float"` | `"float"` |
| `sensor.state.fields.state.wireType` | `5` | `WireType.FIXED32` |
| `sensor.state.keyFieldNumber` | `1` | `1` |
| `sensor.state.messageType` | `25` | `MessageType.SENSOR_STATE_RESPONSE` |
| `sensor.type` | `"sensor"` | `"sensor"` |
| <a id="property-siren"></a> `siren` | \{ `command`: \{ `deviceIdFieldNumber`: `10`; `fields`: \{ \}; `hasPatternFields`: \{ `duration`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `tone`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `57`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `11`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsDuration`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsVolume`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `55`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `tones`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `56`; \}; `type`: `"siren"`; \} | - |
| `siren.command` | \{ `deviceIdFieldNumber`: `10`; `fields`: \{ \}; `hasPatternFields`: \{ `duration`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `tone`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `57`; \} | - |
| `siren.command.deviceIdFieldNumber` | `10` | `10` |
| `siren.command.fields` | \{ \} | `{}` |
| `siren.command.hasPatternFields` | \{ `duration`: \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \}; `state`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `tone`: \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `volume`: \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `siren.command.hasPatternFields.duration` | \{ `hasFieldNumber`: `6`; `valueFieldNumber`: `7`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `siren.command.hasPatternFields.duration.hasFieldNumber` | `6` | `6` |
| `siren.command.hasPatternFields.duration.valueFieldNumber` | `7` | `7` |
| `siren.command.hasPatternFields.duration.valueType` | `"varint"` | `"varint"` |
| `siren.command.hasPatternFields.duration.wireType` | `0` | `WireType.VARINT` |
| `siren.command.hasPatternFields.state` | \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `siren.command.hasPatternFields.state.hasFieldNumber` | `2` | `2` |
| `siren.command.hasPatternFields.state.valueFieldNumber` | `3` | `3` |
| `siren.command.hasPatternFields.state.valueType` | `"bool"` | `"bool"` |
| `siren.command.hasPatternFields.state.wireType` | `0` | `WireType.VARINT` |
| `siren.command.hasPatternFields.tone` | \{ `hasFieldNumber`: `4`; `valueFieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `siren.command.hasPatternFields.tone.hasFieldNumber` | `4` | `4` |
| `siren.command.hasPatternFields.tone.valueFieldNumber` | `5` | `5` |
| `siren.command.hasPatternFields.tone.valueType` | `"string"` | `"string"` |
| `siren.command.hasPatternFields.tone.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `siren.command.hasPatternFields.volume` | \{ `hasFieldNumber`: `8`; `valueFieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `siren.command.hasPatternFields.volume.hasFieldNumber` | `8` | `8` |
| `siren.command.hasPatternFields.volume.valueFieldNumber` | `9` | `9` |
| `siren.command.hasPatternFields.volume.valueType` | `"float"` | `"float"` |
| `siren.command.hasPatternFields.volume.wireType` | `5` | `WireType.FIXED32` |
| `siren.command.keyFieldNumber` | `1` | `1` |
| `siren.command.messageType` | `57` | `MessageType.SIREN_COMMAND_REQUEST` |
| `siren.listEntities` | \{ `deviceIdFieldNumber`: `11`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsDuration`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsVolume`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `55`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `tones`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; \} | - |
| `siren.listEntities.deviceIdFieldNumber` | `11` | `11` |
| `siren.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `siren.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `siren.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `siren.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `siren.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `siren.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsDuration`: \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsVolume`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `siren.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `siren.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `siren.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `siren.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `siren.listEntities.fields.entityCategory` | \{ `fieldNumber`: `10`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `siren.listEntities.fields.entityCategory.fieldNumber` | `10` | `10` |
| `siren.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `siren.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `siren.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `siren.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `siren.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `siren.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `siren.listEntities.fields.supportsDuration` | \{ `fieldNumber`: `8`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `siren.listEntities.fields.supportsDuration.fieldNumber` | `8` | `8` |
| `siren.listEntities.fields.supportsDuration.valueType` | `"bool"` | `"bool"` |
| `siren.listEntities.fields.supportsDuration.wireType` | `0` | `WireType.VARINT` |
| `siren.listEntities.fields.supportsVolume` | \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `siren.listEntities.fields.supportsVolume.fieldNumber` | `9` | `9` |
| `siren.listEntities.fields.supportsVolume.valueType` | `"bool"` | `"bool"` |
| `siren.listEntities.fields.supportsVolume.wireType` | `0` | `WireType.VARINT` |
| `siren.listEntities.keyFieldNumber` | `2` | `2` |
| `siren.listEntities.messageType` | `55` | `MessageType.LIST_ENTITIES_SIREN_RESPONSE` |
| `siren.listEntities.nameFieldNumber` | `3` | `3` |
| `siren.listEntities.objectIdFieldNumber` | `1` | `1` |
| `siren.listEntities.repeatedFields` | \{ `tones`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `siren.listEntities.repeatedFields.tones` | \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `siren.listEntities.repeatedFields.tones.fieldNumber` | `7` | `7` |
| `siren.listEntities.repeatedFields.tones.valueType` | `"string"` | `"string"` |
| `siren.listEntities.repeatedFields.tones.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `siren.state` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `56`; \} | - |
| `siren.state.deviceIdFieldNumber` | `3` | `3` |
| `siren.state.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `siren.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `siren.state.fields.state.fieldNumber` | `2` | `2` |
| `siren.state.fields.state.valueType` | `"bool"` | `"bool"` |
| `siren.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `siren.state.keyFieldNumber` | `1` | `1` |
| `siren.state.messageType` | `56` | `MessageType.SIREN_STATE_RESPONSE` |
| `siren.type` | `"siren"` | `"siren"` |
| <a id="property-switch"></a> `switch` | \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `33`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `17`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `26`; \}; `type`: `"switch"`; \} | - |
| `switch.command` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `33`; \} | - |
| `switch.command.deviceIdFieldNumber` | `3` | `3` |
| `switch.command.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `switch.command.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `switch.command.fields.state.fieldNumber` | `2` | `2` |
| `switch.command.fields.state.valueType` | `"bool"` | `"bool"` |
| `switch.command.fields.state.wireType` | `0` | `WireType.VARINT` |
| `switch.command.hasPatternFields` | \{ \} | `{}` |
| `switch.command.keyFieldNumber` | `1` | `1` |
| `switch.command.messageType` | `33` | `MessageType.SWITCH_COMMAND_REQUEST` |
| `switch.listEntities` | \{ `deviceIdFieldNumber`: `10`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `17`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `switch.listEntities.deviceIdFieldNumber` | `10` | `10` |
| `switch.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `switch.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `switch.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `switch.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `switch.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `switch.listEntities.fields` | \{ `assumedState`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `switch.listEntities.fields.assumedState` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `switch.listEntities.fields.assumedState.fieldNumber` | `6` | `6` |
| `switch.listEntities.fields.assumedState.valueType` | `"bool"` | `"bool"` |
| `switch.listEntities.fields.assumedState.wireType` | `0` | `WireType.VARINT` |
| `switch.listEntities.fields.deviceClass` | \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `switch.listEntities.fields.deviceClass.fieldNumber` | `9` | `9` |
| `switch.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `switch.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `switch.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `7`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `switch.listEntities.fields.disabledByDefault.fieldNumber` | `7` | `7` |
| `switch.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `switch.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `switch.listEntities.fields.entityCategory` | \{ `fieldNumber`: `8`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `switch.listEntities.fields.entityCategory.fieldNumber` | `8` | `8` |
| `switch.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `switch.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `switch.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `switch.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `switch.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `switch.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `switch.listEntities.keyFieldNumber` | `2` | `2` |
| `switch.listEntities.messageType` | `17` | `MessageType.LIST_ENTITIES_SWITCH_RESPONSE` |
| `switch.listEntities.nameFieldNumber` | `3` | `3` |
| `switch.listEntities.objectIdFieldNumber` | `1` | `1` |
| `switch.state` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `26`; \} | - |
| `switch.state.deviceIdFieldNumber` | `3` | `3` |
| `switch.state.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `switch.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `switch.state.fields.state.fieldNumber` | `2` | `2` |
| `switch.state.fields.state.valueType` | `"bool"` | `"bool"` |
| `switch.state.fields.state.wireType` | `0` | `WireType.VARINT` |
| `switch.state.keyFieldNumber` | `1` | `1` |
| `switch.state.messageType` | `26` | `MessageType.SWITCH_STATE_RESPONSE` |
| `switch.type` | `"switch"` | `"switch"` |
| <a id="property-text"></a> `text` | \{ `command`: \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `99`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `PASSWORD`: `1`; `TEXT`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxLength`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minLength`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `pattern`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `97`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `98`; \}; `type`: `"text"`; \} | - |
| `text.command` | \{ `deviceIdFieldNumber`: `3`; `fields`: \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `99`; \} | - |
| `text.command.deviceIdFieldNumber` | `3` | `3` |
| `text.command.fields` | \{ `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `text.command.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `text.command.fields.state.fieldNumber` | `2` | `2` |
| `text.command.fields.state.valueType` | `"string"` | `"string"` |
| `text.command.fields.state.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `text.command.hasPatternFields` | \{ \} | `{}` |
| `text.command.keyFieldNumber` | `1` | `1` |
| `text.command.messageType` | `99` | `MessageType.TEXT_COMMAND_REQUEST` |
| `text.listEntities` | \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `PASSWORD`: `1`; `TEXT`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxLength`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minLength`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `pattern`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `97`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `text.listEntities.deviceIdFieldNumber` | `12` | `12` |
| `text.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `mode`: \{ `PASSWORD`: `1`; `TEXT`: `0`; \}; \} | - |
| `text.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `text.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `text.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `text.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `text.listEntities.enumMappings.mode` | \{ `PASSWORD`: `1`; `TEXT`: `0`; \} | `TextMode` |
| `text.listEntities.enumMappings.mode.PASSWORD` | `1` | `1` |
| `text.listEntities.enumMappings.mode.TEXT` | `0` | `0` |
| `text.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxLength`: \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minLength`: \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \}; `mode`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; `pattern`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `text.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `text.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `text.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `text.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `text.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `text.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `text.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `text.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `text.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `text.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `text.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `text.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `text.listEntities.fields.maxLength` | \{ `fieldNumber`: `9`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `text.listEntities.fields.maxLength.fieldNumber` | `9` | `9` |
| `text.listEntities.fields.maxLength.valueType` | `"varint"` | `"varint"` |
| `text.listEntities.fields.maxLength.wireType` | `0` | `WireType.VARINT` |
| `text.listEntities.fields.minLength` | \{ `fieldNumber`: `8`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `text.listEntities.fields.minLength.fieldNumber` | `8` | `8` |
| `text.listEntities.fields.minLength.valueType` | `"varint"` | `"varint"` |
| `text.listEntities.fields.minLength.wireType` | `0` | `WireType.VARINT` |
| `text.listEntities.fields.mode` | \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `text.listEntities.fields.mode.fieldNumber` | `11` | `11` |
| `text.listEntities.fields.mode.valueType` | `"enum"` | `"enum"` |
| `text.listEntities.fields.mode.wireType` | `0` | `WireType.VARINT` |
| `text.listEntities.fields.pattern` | \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `text.listEntities.fields.pattern.fieldNumber` | `10` | `10` |
| `text.listEntities.fields.pattern.valueType` | `"string"` | `"string"` |
| `text.listEntities.fields.pattern.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `text.listEntities.keyFieldNumber` | `2` | `2` |
| `text.listEntities.messageType` | `97` | `MessageType.LIST_ENTITIES_TEXT_RESPONSE` |
| `text.listEntities.nameFieldNumber` | `3` | `3` |
| `text.listEntities.objectIdFieldNumber` | `1` | `1` |
| `text.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `98`; \} | - |
| `text.state.deviceIdFieldNumber` | `4` | `4` |
| `text.state.fields` | \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `text.state.fields.missingState` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `text.state.fields.missingState.fieldNumber` | `3` | `3` |
| `text.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `text.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `text.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `text.state.fields.state.fieldNumber` | `2` | `2` |
| `text.state.fields.state.valueType` | `"string"` | `"string"` |
| `text.state.fields.state.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `text.state.keyFieldNumber` | `1` | `1` |
| `text.state.messageType` | `98` | `MessageType.TEXT_STATE_RESPONSE` |
| `text.type` | `"text"` | `"text"` |
| <a id="property-text_sensor"></a> `text_sensor` | \{ `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `18`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `27`; \}; `type`: `"text_sensor"`; \} | - |
| `text_sensor.listEntities` | \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `18`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `text_sensor.listEntities.deviceIdFieldNumber` | `9` | `9` |
| `text_sensor.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `text_sensor.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `text_sensor.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `text_sensor.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `text_sensor.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `text_sensor.listEntities.fields` | \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `text_sensor.listEntities.fields.deviceClass` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `text_sensor.listEntities.fields.deviceClass.fieldNumber` | `8` | `8` |
| `text_sensor.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `text_sensor.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `text_sensor.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `text_sensor.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `text_sensor.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `text_sensor.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `text_sensor.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `text_sensor.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `text_sensor.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `text_sensor.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `text_sensor.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `text_sensor.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `text_sensor.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `text_sensor.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `text_sensor.listEntities.keyFieldNumber` | `2` | `2` |
| `text_sensor.listEntities.messageType` | `18` | `MessageType.LIST_ENTITIES_TEXT_SENSOR_RESPONSE` |
| `text_sensor.listEntities.nameFieldNumber` | `3` | `3` |
| `text_sensor.listEntities.objectIdFieldNumber` | `1` | `1` |
| `text_sensor.state` | \{ `deviceIdFieldNumber`: `4`; `fields`: \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `27`; \} | - |
| `text_sensor.state.deviceIdFieldNumber` | `4` | `4` |
| `text_sensor.state.fields` | \{ `missingState`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `state`: \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `text_sensor.state.fields.missingState` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `text_sensor.state.fields.missingState.fieldNumber` | `3` | `3` |
| `text_sensor.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `text_sensor.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `text_sensor.state.fields.state` | \{ `fieldNumber`: `2`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `text_sensor.state.fields.state.fieldNumber` | `2` | `2` |
| `text_sensor.state.fields.state.valueType` | `"string"` | `"string"` |
| `text_sensor.state.fields.state.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `text_sensor.state.keyFieldNumber` | `1` | `1` |
| `text_sensor.state.messageType` | `27` | `MessageType.TEXT_SENSOR_STATE_RESPONSE` |
| `text_sensor.type` | `"text_sensor"` | `"text_sensor"` |
| <a id="property-time"></a> `time` | \{ `command`: \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `hour`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `105`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `103`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `6`; `fields`: \{ `hour`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `104`; \}; `type`: `"time"`; \} | - |
| `time.command` | \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `hour`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `105`; \} | - |
| `time.command.deviceIdFieldNumber` | `5` | `5` |
| `time.command.fields` | \{ `hour`: \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `time.command.fields.hour` | \{ `fieldNumber`: `2`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `time.command.fields.hour.fieldNumber` | `2` | `2` |
| `time.command.fields.hour.valueType` | `"varint"` | `"varint"` |
| `time.command.fields.hour.wireType` | `0` | `WireType.VARINT` |
| `time.command.fields.minute` | \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `time.command.fields.minute.fieldNumber` | `3` | `3` |
| `time.command.fields.minute.valueType` | `"varint"` | `"varint"` |
| `time.command.fields.minute.wireType` | `0` | `WireType.VARINT` |
| `time.command.fields.second` | \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `time.command.fields.second.fieldNumber` | `4` | `4` |
| `time.command.fields.second.valueType` | `"varint"` | `"varint"` |
| `time.command.fields.second.wireType` | `0` | `WireType.VARINT` |
| `time.command.hasPatternFields` | \{ \} | `{}` |
| `time.command.keyFieldNumber` | `1` | `1` |
| `time.command.messageType` | `105` | `MessageType.TIME_COMMAND_REQUEST` |
| `time.listEntities` | \{ `deviceIdFieldNumber`: `8`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `103`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `time.listEntities.deviceIdFieldNumber` | `8` | `8` |
| `time.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `time.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `time.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `time.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `time.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `time.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `time.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `time.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `time.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `time.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `time.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `time.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `time.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `time.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `time.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `time.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `time.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `time.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `time.listEntities.keyFieldNumber` | `2` | `2` |
| `time.listEntities.messageType` | `103` | `MessageType.LIST_ENTITIES_TIME_RESPONSE` |
| `time.listEntities.nameFieldNumber` | `3` | `3` |
| `time.listEntities.objectIdFieldNumber` | `1` | `1` |
| `time.state` | \{ `deviceIdFieldNumber`: `6`; `fields`: \{ `hour`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `104`; \} | - |
| `time.state.deviceIdFieldNumber` | `6` | `6` |
| `time.state.fields` | \{ `hour`: \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \}; `minute`: \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `second`: \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \}; \} | - |
| `time.state.fields.hour` | \{ `fieldNumber`: `3`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `time.state.fields.hour.fieldNumber` | `3` | `3` |
| `time.state.fields.hour.valueType` | `"varint"` | `"varint"` |
| `time.state.fields.hour.wireType` | `0` | `WireType.VARINT` |
| `time.state.fields.minute` | \{ `fieldNumber`: `4`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `time.state.fields.minute.fieldNumber` | `4` | `4` |
| `time.state.fields.minute.valueType` | `"varint"` | `"varint"` |
| `time.state.fields.minute.wireType` | `0` | `WireType.VARINT` |
| `time.state.fields.missingState` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `time.state.fields.missingState.fieldNumber` | `2` | `2` |
| `time.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `time.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `time.state.fields.second` | \{ `fieldNumber`: `5`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `time.state.fields.second.fieldNumber` | `5` | `5` |
| `time.state.fields.second.valueType` | `"varint"` | `"varint"` |
| `time.state.fields.second.wireType` | `0` | `WireType.VARINT` |
| `time.state.keyFieldNumber` | `1` | `1` |
| `time.state.messageType` | `104` | `MessageType.TIME_STATE_RESPONSE` |
| `time.type` | `"time"` | `"time"` |
| <a id="property-update"></a> `update` | \{ `command`: \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `command`: \{ `check`: `2`; `none`: `0`; `update`: `1`; \}; \}; `fields`: \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `118`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `116`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `11`; `fields`: \{ `currentVersion`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; `hasProgress`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `inProgress`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `latestVersion`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `progress`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `releaseSummary`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `releaseUrl`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `title`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `117`; \}; `type`: `"update"`; \} | - |
| `update.command` | \{ `deviceIdFieldNumber`: `3`; `enumMappings`: \{ `command`: \{ `check`: `2`; `none`: `0`; `update`: `1`; \}; \}; `fields`: \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `118`; \} | - |
| `update.command.deviceIdFieldNumber` | `3` | `3` |
| `update.command.enumMappings` | \{ `command`: \{ `check`: `2`; `none`: `0`; `update`: `1`; \}; \} | - |
| `update.command.enumMappings.command` | \{ `check`: `2`; `none`: `0`; `update`: `1`; \} | - |
| `update.command.enumMappings.command.check` | `2` | `2` |
| `update.command.enumMappings.command.none` | `0` | `0` |
| `update.command.enumMappings.command.update` | `1` | `1` |
| `update.command.fields` | \{ `command`: \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `update.command.fields.command` | \{ `fieldNumber`: `2`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `update.command.fields.command.fieldNumber` | `2` | `2` |
| `update.command.fields.command.valueType` | `"enum"` | `"enum"` |
| `update.command.fields.command.wireType` | `0` | `WireType.VARINT` |
| `update.command.hasPatternFields` | \{ \} | `{}` |
| `update.command.keyFieldNumber` | `1` | `1` |
| `update.command.messageType` | `118` | `MessageType.UPDATE_COMMAND_REQUEST` |
| `update.listEntities` | \{ `deviceIdFieldNumber`: `9`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `116`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `update.listEntities.deviceIdFieldNumber` | `9` | `9` |
| `update.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `update.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `update.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `update.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `update.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `update.listEntities.fields` | \{ `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `update.listEntities.fields.deviceClass` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `update.listEntities.fields.deviceClass.fieldNumber` | `8` | `8` |
| `update.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `update.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `update.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `update.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `update.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `update.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `update.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `update.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `update.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `update.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `update.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `update.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `update.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `update.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `update.listEntities.keyFieldNumber` | `2` | `2` |
| `update.listEntities.messageType` | `116` | `MessageType.LIST_ENTITIES_UPDATE_RESPONSE` |
| `update.listEntities.nameFieldNumber` | `3` | `3` |
| `update.listEntities.objectIdFieldNumber` | `1` | `1` |
| `update.state` | \{ `deviceIdFieldNumber`: `11`; `fields`: \{ `currentVersion`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; `hasProgress`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `inProgress`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `latestVersion`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `progress`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `releaseSummary`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `releaseUrl`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `title`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `117`; \} | - |
| `update.state.deviceIdFieldNumber` | `11` | `11` |
| `update.state.fields` | \{ `currentVersion`: \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \}; `hasProgress`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; `inProgress`: \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \}; `latestVersion`: \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \}; `missingState`: \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \}; `progress`: \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \}; `releaseSummary`: \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \}; `releaseUrl`: \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \}; `title`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; \} | - |
| `update.state.fields.currentVersion` | \{ `fieldNumber`: `6`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `update.state.fields.currentVersion.fieldNumber` | `6` | `6` |
| `update.state.fields.currentVersion.valueType` | `"string"` | `"string"` |
| `update.state.fields.currentVersion.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `update.state.fields.hasProgress` | \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `update.state.fields.hasProgress.fieldNumber` | `4` | `4` |
| `update.state.fields.hasProgress.valueType` | `"bool"` | `"bool"` |
| `update.state.fields.hasProgress.wireType` | `0` | `WireType.VARINT` |
| `update.state.fields.inProgress` | \{ `fieldNumber`: `3`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `update.state.fields.inProgress.fieldNumber` | `3` | `3` |
| `update.state.fields.inProgress.valueType` | `"bool"` | `"bool"` |
| `update.state.fields.inProgress.wireType` | `0` | `WireType.VARINT` |
| `update.state.fields.latestVersion` | \{ `fieldNumber`: `7`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `update.state.fields.latestVersion.fieldNumber` | `7` | `7` |
| `update.state.fields.latestVersion.valueType` | `"string"` | `"string"` |
| `update.state.fields.latestVersion.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `update.state.fields.missingState` | \{ `fieldNumber`: `2`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `update.state.fields.missingState.fieldNumber` | `2` | `2` |
| `update.state.fields.missingState.valueType` | `"bool"` | `"bool"` |
| `update.state.fields.missingState.wireType` | `0` | `WireType.VARINT` |
| `update.state.fields.progress` | \{ `fieldNumber`: `5`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `update.state.fields.progress.fieldNumber` | `5` | `5` |
| `update.state.fields.progress.valueType` | `"float"` | `"float"` |
| `update.state.fields.progress.wireType` | `5` | `WireType.FIXED32` |
| `update.state.fields.releaseSummary` | \{ `fieldNumber`: `9`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `update.state.fields.releaseSummary.fieldNumber` | `9` | `9` |
| `update.state.fields.releaseSummary.valueType` | `"string"` | `"string"` |
| `update.state.fields.releaseSummary.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `update.state.fields.releaseUrl` | \{ `fieldNumber`: `10`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `update.state.fields.releaseUrl.fieldNumber` | `10` | `10` |
| `update.state.fields.releaseUrl.valueType` | `"string"` | `"string"` |
| `update.state.fields.releaseUrl.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `update.state.fields.title` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `update.state.fields.title.fieldNumber` | `8` | `8` |
| `update.state.fields.title.valueType` | `"string"` | `"string"` |
| `update.state.fields.title.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `update.state.keyFieldNumber` | `1` | `1` |
| `update.state.messageType` | `117` | `MessageType.UPDATE_STATE_RESPONSE` |
| `update.type` | `"update"` | `"update"` |
| <a id="property-valve"></a> `valve` | \{ `command`: \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `stop`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `position`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `111`; \}; `listEntities`: \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `11`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `109`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \}; `state`: \{ `deviceIdFieldNumber`: `4`; `enumMappings`: \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \}; `fields`: \{ `currentOperation`: \{ `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `110`; \}; `type`: `"valve"`; \} | - |
| `valve.command` | \{ `deviceIdFieldNumber`: `5`; `fields`: \{ `stop`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `hasPatternFields`: \{ `position`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `111`; \} | - |
| `valve.command.deviceIdFieldNumber` | `5` | `5` |
| `valve.command.fields` | \{ `stop`: \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `valve.command.fields.stop` | \{ `fieldNumber`: `4`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `valve.command.fields.stop.fieldNumber` | `4` | `4` |
| `valve.command.fields.stop.valueType` | `"bool"` | `"bool"` |
| `valve.command.fields.stop.wireType` | `0` | `WireType.VARINT` |
| `valve.command.hasPatternFields` | \{ `position`: \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `valve.command.hasPatternFields.position` | \{ `hasFieldNumber`: `2`; `valueFieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `valve.command.hasPatternFields.position.hasFieldNumber` | `2` | `2` |
| `valve.command.hasPatternFields.position.valueFieldNumber` | `3` | `3` |
| `valve.command.hasPatternFields.position.valueType` | `"float"` | `"float"` |
| `valve.command.hasPatternFields.position.wireType` | `5` | `WireType.FIXED32` |
| `valve.command.keyFieldNumber` | `1` | `1` |
| `valve.command.messageType` | `111` | `MessageType.VALVE_COMMAND_REQUEST` |
| `valve.listEntities` | \{ `deviceIdFieldNumber`: `12`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \}; `fields`: \{ `assumedState`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `11`; `valueType`: `"bool"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `109`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; \} | - |
| `valve.listEntities.deviceIdFieldNumber` | `12` | `12` |
| `valve.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; \} | - |
| `valve.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `valve.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `valve.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `valve.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `valve.listEntities.fields` | \{ `assumedState`: \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \}; `deviceClass`: \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \}; `disabledByDefault`: \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \}; `supportsPosition`: \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \}; `supportsStop`: \{ `fieldNumber`: `11`; `valueType`: `"bool"`; `wireType`: `0`; \}; \} | - |
| `valve.listEntities.fields.assumedState` | \{ `fieldNumber`: `9`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `valve.listEntities.fields.assumedState.fieldNumber` | `9` | `9` |
| `valve.listEntities.fields.assumedState.valueType` | `"bool"` | `"bool"` |
| `valve.listEntities.fields.assumedState.wireType` | `0` | `WireType.VARINT` |
| `valve.listEntities.fields.deviceClass` | \{ `fieldNumber`: `8`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `valve.listEntities.fields.deviceClass.fieldNumber` | `8` | `8` |
| `valve.listEntities.fields.deviceClass.valueType` | `"string"` | `"string"` |
| `valve.listEntities.fields.deviceClass.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `valve.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `6`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `valve.listEntities.fields.disabledByDefault.fieldNumber` | `6` | `6` |
| `valve.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `valve.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `valve.listEntities.fields.entityCategory` | \{ `fieldNumber`: `7`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `valve.listEntities.fields.entityCategory.fieldNumber` | `7` | `7` |
| `valve.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `valve.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `valve.listEntities.fields.icon` | \{ `fieldNumber`: `5`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `valve.listEntities.fields.icon.fieldNumber` | `5` | `5` |
| `valve.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `valve.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `valve.listEntities.fields.supportsPosition` | \{ `fieldNumber`: `10`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `valve.listEntities.fields.supportsPosition.fieldNumber` | `10` | `10` |
| `valve.listEntities.fields.supportsPosition.valueType` | `"bool"` | `"bool"` |
| `valve.listEntities.fields.supportsPosition.wireType` | `0` | `WireType.VARINT` |
| `valve.listEntities.fields.supportsStop` | \{ `fieldNumber`: `11`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `valve.listEntities.fields.supportsStop.fieldNumber` | `11` | `11` |
| `valve.listEntities.fields.supportsStop.valueType` | `"bool"` | `"bool"` |
| `valve.listEntities.fields.supportsStop.wireType` | `0` | `WireType.VARINT` |
| `valve.listEntities.keyFieldNumber` | `2` | `2` |
| `valve.listEntities.messageType` | `109` | `MessageType.LIST_ENTITIES_VALVE_RESPONSE` |
| `valve.listEntities.nameFieldNumber` | `3` | `3` |
| `valve.listEntities.objectIdFieldNumber` | `1` | `1` |
| `valve.state` | \{ `deviceIdFieldNumber`: `4`; `enumMappings`: \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \}; `fields`: \{ `currentOperation`: \{ `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `110`; \} | - |
| `valve.state.deviceIdFieldNumber` | `4` | `4` |
| `valve.state.enumMappings` | \{ `currentOperation`: \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \}; \} | - |
| `valve.state.enumMappings.currentOperation` | \{ `IDLE`: `0`; `IS_CLOSING`: `2`; `IS_OPENING`: `1`; \} | `ValveOperation` |
| `valve.state.enumMappings.currentOperation.IDLE` | `0` | `0` |
| `valve.state.enumMappings.currentOperation.IS_CLOSING` | `2` | `2` |
| `valve.state.enumMappings.currentOperation.IS_OPENING` | `1` | `1` |
| `valve.state.fields` | \{ `currentOperation`: \{ `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `position`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `valve.state.fields.currentOperation` | \{ `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `valve.state.fields.currentOperation.fieldNumber` | `3` | `3` |
| `valve.state.fields.currentOperation.valueType` | `"enum"` | `"enum"` |
| `valve.state.fields.currentOperation.wireType` | `0` | `WireType.VARINT` |
| `valve.state.fields.position` | \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `valve.state.fields.position.fieldNumber` | `2` | `2` |
| `valve.state.fields.position.valueType` | `"float"` | `"float"` |
| `valve.state.fields.position.wireType` | `5` | `WireType.FIXED32` |
| `valve.state.keyFieldNumber` | `1` | `1` |
| `valve.state.messageType` | `110` | `MessageType.VALVE_STATE_RESPONSE` |
| `valve.type` | `"valve"` | `"valve"` |
| <a id="property-water_heater"></a> `water_heater` | \{ `command`: \{ `bitmaskFieldNumber`: `2`; `bitmaskFields`: \{ `mode`: \{ `bit`: `1`; `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `bit`: `2`; `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `bit`: `16`; `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `bit`: `8`; `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `mode`: \{ `eco`: `1`; `electric`: `2`; `gas`: `6`; `heat_pump`: `5`; `high_demand`: `4`; `off`: `0`; `performance`: `3`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `134`; `packedBitsFields`: \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; `hasFieldBit`: `64`; \}; `onState`: \{ `bit`: `2`; `hasFieldBit`: `32`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \}; \}; `listEntities`: \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedModes`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `minTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `supportedFeatures`: \{ `fieldNumber`: `12`; `valueType`: `"varint"`; `wireType`: `0`; \}; `targetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `temperatureUnit`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `132`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `supportedModes`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \}; `state`: \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `mode`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; \}; `fields`: \{ `currentTemperature`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `133`; `packedBitsFields`: \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; \}; `onState`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \}; \}; `type`: `"water_heater"`; \} | - |
| `water_heater.command` | \{ `bitmaskFieldNumber`: `2`; `bitmaskFields`: \{ `mode`: \{ `bit`: `1`; `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `bit`: `2`; `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `bit`: `16`; `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `bit`: `8`; `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `mode`: \{ `eco`: `1`; `electric`: `2`; `gas`: `6`; `heat_pump`: `5`; `high_demand`: `4`; `off`: `0`; `performance`: `3`; \}; \}; `fields`: \{ \}; `hasPatternFields`: \{ \}; `keyFieldNumber`: `1`; `messageType`: `134`; `packedBitsFields`: \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; `hasFieldBit`: `64`; \}; `onState`: \{ `bit`: `2`; `hasFieldBit`: `32`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \}; \} | - |
| `water_heater.command.bitmaskFieldNumber` | `2` | `2` |
| `water_heater.command.bitmaskFields` | \{ `mode`: \{ `bit`: `1`; `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `bit`: `2`; `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `bit`: `16`; `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `bit`: `8`; `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `water_heater.command.bitmaskFields.mode` | \{ `bit`: `1`; `fieldNumber`: `3`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `water_heater.command.bitmaskFields.mode.bit` | `1` | `WaterHeaterCommandHasField.MODE` |
| `water_heater.command.bitmaskFields.mode.fieldNumber` | `3` | `3` |
| `water_heater.command.bitmaskFields.mode.valueType` | `"enum"` | `"enum"` |
| `water_heater.command.bitmaskFields.mode.wireType` | `0` | `WireType.VARINT` |
| `water_heater.command.bitmaskFields.targetTemperature` | \{ `bit`: `2`; `fieldNumber`: `4`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.command.bitmaskFields.targetTemperature.bit` | `2` | `WaterHeaterCommandHasField.TARGET_TEMPERATURE` |
| `water_heater.command.bitmaskFields.targetTemperature.fieldNumber` | `4` | `4` |
| `water_heater.command.bitmaskFields.targetTemperature.valueType` | `"float"` | `"float"` |
| `water_heater.command.bitmaskFields.targetTemperature.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.command.bitmaskFields.targetTemperatureHigh` | \{ `bit`: `16`; `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.command.bitmaskFields.targetTemperatureHigh.bit` | `16` | `WaterHeaterCommandHasField.TARGET_TEMPERATURE_HIGH` |
| `water_heater.command.bitmaskFields.targetTemperatureHigh.fieldNumber` | `8` | `8` |
| `water_heater.command.bitmaskFields.targetTemperatureHigh.valueType` | `"float"` | `"float"` |
| `water_heater.command.bitmaskFields.targetTemperatureHigh.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.command.bitmaskFields.targetTemperatureLow` | \{ `bit`: `8`; `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.command.bitmaskFields.targetTemperatureLow.bit` | `8` | `WaterHeaterCommandHasField.TARGET_TEMPERATURE_LOW` |
| `water_heater.command.bitmaskFields.targetTemperatureLow.fieldNumber` | `7` | `7` |
| `water_heater.command.bitmaskFields.targetTemperatureLow.valueType` | `"float"` | `"float"` |
| `water_heater.command.bitmaskFields.targetTemperatureLow.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.command.deviceIdFieldNumber` | `5` | `5` |
| `water_heater.command.enumMappings` | \{ `mode`: \{ `eco`: `1`; `electric`: `2`; `gas`: `6`; `heat_pump`: `5`; `high_demand`: `4`; `off`: `0`; `performance`: `3`; \}; \} | - |
| `water_heater.command.enumMappings.mode` | \{ `eco`: `1`; `electric`: `2`; `gas`: `6`; `heat_pump`: `5`; `high_demand`: `4`; `off`: `0`; `performance`: `3`; \} | - |
| `water_heater.command.enumMappings.mode.eco` | `1` | `1` |
| `water_heater.command.enumMappings.mode.electric` | `2` | `2` |
| `water_heater.command.enumMappings.mode.gas` | `6` | `6` |
| `water_heater.command.enumMappings.mode.heat_pump` | `5` | `5` |
| `water_heater.command.enumMappings.mode.high_demand` | `4` | `4` |
| `water_heater.command.enumMappings.mode.off` | `0` | `0` |
| `water_heater.command.enumMappings.mode.performance` | `3` | `3` |
| `water_heater.command.fields` | \{ \} | `{}` |
| `water_heater.command.hasPatternFields` | \{ \} | `{}` |
| `water_heater.command.keyFieldNumber` | `1` | `1` |
| `water_heater.command.messageType` | `134` | `MessageType.WATER_HEATER_COMMAND_REQUEST` |
| `water_heater.command.packedBitsFields` | \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; `hasFieldBit`: `64`; \}; `onState`: \{ `bit`: `2`; `hasFieldBit`: `32`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \} | - |
| `water_heater.command.packedBitsFields.state` | \{ `bits`: \{ `awayState`: \{ `bit`: `1`; `hasFieldBit`: `64`; \}; `onState`: \{ `bit`: `2`; `hasFieldBit`: `32`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \} | - |
| `water_heater.command.packedBitsFields.state.bits` | \{ `awayState`: \{ `bit`: `1`; `hasFieldBit`: `64`; \}; `onState`: \{ `bit`: `2`; `hasFieldBit`: `32`; \}; \} | `WATER_HEATER_STATE_COMMAND_BITS` |
| `water_heater.command.packedBitsFields.state.bits.awayState` | \{ `bit`: `1`; `hasFieldBit`: `64`; \} | - |
| `water_heater.command.packedBitsFields.state.bits.awayState.bit` | `1` | `WaterHeaterStateFlags.AWAY` |
| `water_heater.command.packedBitsFields.state.bits.awayState.hasFieldBit` | `64` | `WaterHeaterCommandHasField.HAS_AWAY_STATE` |
| `water_heater.command.packedBitsFields.state.bits.onState` | \{ `bit`: `2`; `hasFieldBit`: `32`; \} | - |
| `water_heater.command.packedBitsFields.state.bits.onState.bit` | `2` | `WaterHeaterStateFlags.ON` |
| `water_heater.command.packedBitsFields.state.bits.onState.hasFieldBit` | `32` | `WaterHeaterCommandHasField.HAS_ON_STATE` |
| `water_heater.command.packedBitsFields.state.fieldNumber` | `6` | `6` |
| `water_heater.command.packedBitsFields.state.wireType` | `0` | `WireType.VARINT` |
| `water_heater.listEntities` | \{ `deviceIdFieldNumber`: `7`; `enumMappings`: \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedModes`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \}; `fields`: \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `minTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `supportedFeatures`: \{ `fieldNumber`: `12`; `valueType`: `"varint"`; `wireType`: `0`; \}; `targetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `temperatureUnit`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; `keyFieldNumber`: `2`; `messageType`: `132`; `nameFieldNumber`: `3`; `objectIdFieldNumber`: `1`; `repeatedFields`: \{ `supportedModes`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; \}; \} | - |
| `water_heater.listEntities.deviceIdFieldNumber` | `7` | `7` |
| `water_heater.listEntities.enumMappings` | \{ `entityCategory`: \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \}; `supportedModes`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; `temperatureUnit`: \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \}; \} | - |
| `water_heater.listEntities.enumMappings.entityCategory` | \{ `CONFIG`: `1`; `DIAGNOSTIC`: `2`; `NONE`: `0`; \} | `EntityCategory` |
| `water_heater.listEntities.enumMappings.entityCategory.CONFIG` | `1` | `1` |
| `water_heater.listEntities.enumMappings.entityCategory.DIAGNOSTIC` | `2` | `2` |
| `water_heater.listEntities.enumMappings.entityCategory.NONE` | `0` | `0` |
| `water_heater.listEntities.enumMappings.supportedModes` | \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \} | `WaterHeaterMode` |
| `water_heater.listEntities.enumMappings.supportedModes.ECO` | `1` | `1` |
| `water_heater.listEntities.enumMappings.supportedModes.ELECTRIC` | `2` | `2` |
| `water_heater.listEntities.enumMappings.supportedModes.GAS` | `6` | `6` |
| `water_heater.listEntities.enumMappings.supportedModes.HEAT_PUMP` | `5` | `5` |
| `water_heater.listEntities.enumMappings.supportedModes.HIGH_DEMAND` | `4` | `4` |
| `water_heater.listEntities.enumMappings.supportedModes.OFF` | `0` | `0` |
| `water_heater.listEntities.enumMappings.supportedModes.PERFORMANCE` | `3` | `3` |
| `water_heater.listEntities.enumMappings.temperatureUnit` | \{ `CELSIUS`: `0`; `FAHRENHEIT`: `1`; `KELVIN`: `2`; \} | `TemperatureUnit` |
| `water_heater.listEntities.enumMappings.temperatureUnit.CELSIUS` | `0` | `0` |
| `water_heater.listEntities.enumMappings.temperatureUnit.FAHRENHEIT` | `1` | `1` |
| `water_heater.listEntities.enumMappings.temperatureUnit.KELVIN` | `2` | `2` |
| `water_heater.listEntities.fields` | \{ `disabledByDefault`: \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \}; `entityCategory`: \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \}; `icon`: \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \}; `maxTemperature`: \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \}; `minTemperature`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `supportedFeatures`: \{ `fieldNumber`: `12`; `valueType`: `"varint"`; `wireType`: `0`; \}; `targetTemperatureStep`: \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \}; `temperatureUnit`: \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `water_heater.listEntities.fields.disabledByDefault` | \{ `fieldNumber`: `5`; `valueType`: `"bool"`; `wireType`: `0`; \} | - |
| `water_heater.listEntities.fields.disabledByDefault.fieldNumber` | `5` | `5` |
| `water_heater.listEntities.fields.disabledByDefault.valueType` | `"bool"` | `"bool"` |
| `water_heater.listEntities.fields.disabledByDefault.wireType` | `0` | `WireType.VARINT` |
| `water_heater.listEntities.fields.entityCategory` | \{ `fieldNumber`: `6`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `water_heater.listEntities.fields.entityCategory.fieldNumber` | `6` | `6` |
| `water_heater.listEntities.fields.entityCategory.valueType` | `"enum"` | `"enum"` |
| `water_heater.listEntities.fields.entityCategory.wireType` | `0` | `WireType.VARINT` |
| `water_heater.listEntities.fields.icon` | \{ `fieldNumber`: `4`; `valueType`: `"string"`; `wireType`: `2`; \} | - |
| `water_heater.listEntities.fields.icon.fieldNumber` | `4` | `4` |
| `water_heater.listEntities.fields.icon.valueType` | `"string"` | `"string"` |
| `water_heater.listEntities.fields.icon.wireType` | `2` | `WireType.LENGTH_DELIMITED` |
| `water_heater.listEntities.fields.maxTemperature` | \{ `fieldNumber`: `9`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.listEntities.fields.maxTemperature.fieldNumber` | `9` | `9` |
| `water_heater.listEntities.fields.maxTemperature.valueType` | `"float"` | `"float"` |
| `water_heater.listEntities.fields.maxTemperature.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.listEntities.fields.minTemperature` | \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.listEntities.fields.minTemperature.fieldNumber` | `8` | `8` |
| `water_heater.listEntities.fields.minTemperature.valueType` | `"float"` | `"float"` |
| `water_heater.listEntities.fields.minTemperature.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.listEntities.fields.supportedFeatures` | \{ `fieldNumber`: `12`; `valueType`: `"varint"`; `wireType`: `0`; \} | - |
| `water_heater.listEntities.fields.supportedFeatures.fieldNumber` | `12` | `12` |
| `water_heater.listEntities.fields.supportedFeatures.valueType` | `"varint"` | `"varint"` |
| `water_heater.listEntities.fields.supportedFeatures.wireType` | `0` | `WireType.VARINT` |
| `water_heater.listEntities.fields.targetTemperatureStep` | \{ `fieldNumber`: `10`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.listEntities.fields.targetTemperatureStep.fieldNumber` | `10` | `10` |
| `water_heater.listEntities.fields.targetTemperatureStep.valueType` | `"float"` | `"float"` |
| `water_heater.listEntities.fields.targetTemperatureStep.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.listEntities.fields.temperatureUnit` | \{ `fieldNumber`: `13`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `water_heater.listEntities.fields.temperatureUnit.fieldNumber` | `13` | `13` |
| `water_heater.listEntities.fields.temperatureUnit.valueType` | `"enum"` | `"enum"` |
| `water_heater.listEntities.fields.temperatureUnit.wireType` | `0` | `WireType.VARINT` |
| `water_heater.listEntities.keyFieldNumber` | `2` | `2` |
| `water_heater.listEntities.messageType` | `132` | `MessageType.LIST_ENTITIES_WATER_HEATER_RESPONSE` |
| `water_heater.listEntities.nameFieldNumber` | `3` | `3` |
| `water_heater.listEntities.objectIdFieldNumber` | `1` | `1` |
| `water_heater.listEntities.repeatedFields` | \{ `supportedModes`: \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \}; \} | - |
| `water_heater.listEntities.repeatedFields.supportedModes` | \{ `fieldNumber`: `11`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `water_heater.listEntities.repeatedFields.supportedModes.fieldNumber` | `11` | `11` |
| `water_heater.listEntities.repeatedFields.supportedModes.valueType` | `"enum"` | `"enum"` |
| `water_heater.listEntities.repeatedFields.supportedModes.wireType` | `0` | `WireType.VARINT` |
| `water_heater.state` | \{ `deviceIdFieldNumber`: `5`; `enumMappings`: \{ `mode`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; \}; `fields`: \{ `currentTemperature`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \}; `keyFieldNumber`: `1`; `messageType`: `133`; `packedBitsFields`: \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; \}; `onState`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \}; \} | - |
| `water_heater.state.deviceIdFieldNumber` | `5` | `5` |
| `water_heater.state.enumMappings` | \{ `mode`: \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \}; \} | - |
| `water_heater.state.enumMappings.mode` | \{ `ECO`: `1`; `ELECTRIC`: `2`; `GAS`: `6`; `HEAT_PUMP`: `5`; `HIGH_DEMAND`: `4`; `OFF`: `0`; `PERFORMANCE`: `3`; \} | `WaterHeaterMode` |
| `water_heater.state.enumMappings.mode.ECO` | `1` | `1` |
| `water_heater.state.enumMappings.mode.ELECTRIC` | `2` | `2` |
| `water_heater.state.enumMappings.mode.GAS` | `6` | `6` |
| `water_heater.state.enumMappings.mode.HEAT_PUMP` | `5` | `5` |
| `water_heater.state.enumMappings.mode.HIGH_DEMAND` | `4` | `4` |
| `water_heater.state.enumMappings.mode.OFF` | `0` | `0` |
| `water_heater.state.enumMappings.mode.PERFORMANCE` | `3` | `3` |
| `water_heater.state.fields` | \{ `currentTemperature`: \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \}; `mode`: \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \}; `targetTemperature`: \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureHigh`: \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \}; `targetTemperatureLow`: \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \}; \} | - |
| `water_heater.state.fields.currentTemperature` | \{ `fieldNumber`: `2`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.state.fields.currentTemperature.fieldNumber` | `2` | `2` |
| `water_heater.state.fields.currentTemperature.valueType` | `"float"` | `"float"` |
| `water_heater.state.fields.currentTemperature.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.state.fields.mode` | \{ `fieldNumber`: `4`; `valueType`: `"enum"`; `wireType`: `0`; \} | - |
| `water_heater.state.fields.mode.fieldNumber` | `4` | `4` |
| `water_heater.state.fields.mode.valueType` | `"enum"` | `"enum"` |
| `water_heater.state.fields.mode.wireType` | `0` | `WireType.VARINT` |
| `water_heater.state.fields.targetTemperature` | \{ `fieldNumber`: `3`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.state.fields.targetTemperature.fieldNumber` | `3` | `3` |
| `water_heater.state.fields.targetTemperature.valueType` | `"float"` | `"float"` |
| `water_heater.state.fields.targetTemperature.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.state.fields.targetTemperatureHigh` | \{ `fieldNumber`: `8`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.state.fields.targetTemperatureHigh.fieldNumber` | `8` | `8` |
| `water_heater.state.fields.targetTemperatureHigh.valueType` | `"float"` | `"float"` |
| `water_heater.state.fields.targetTemperatureHigh.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.state.fields.targetTemperatureLow` | \{ `fieldNumber`: `7`; `valueType`: `"float"`; `wireType`: `5`; \} | - |
| `water_heater.state.fields.targetTemperatureLow.fieldNumber` | `7` | `7` |
| `water_heater.state.fields.targetTemperatureLow.valueType` | `"float"` | `"float"` |
| `water_heater.state.fields.targetTemperatureLow.wireType` | `5` | `WireType.FIXED32` |
| `water_heater.state.keyFieldNumber` | `1` | `1` |
| `water_heater.state.messageType` | `133` | `MessageType.WATER_HEATER_STATE_RESPONSE` |
| `water_heater.state.packedBitsFields` | \{ `state`: \{ `bits`: \{ `awayState`: \{ `bit`: `1`; \}; `onState`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \}; \} | - |
| `water_heater.state.packedBitsFields.state` | \{ `bits`: \{ `awayState`: \{ `bit`: `1`; \}; `onState`: \{ `bit`: `2`; \}; \}; `fieldNumber`: `6`; `wireType`: `0`; \} | - |
| `water_heater.state.packedBitsFields.state.bits` | \{ `awayState`: \{ `bit`: `1`; \}; `onState`: \{ `bit`: `2`; \}; \} | `WATER_HEATER_STATE_INBOUND_BITS` |
| `water_heater.state.packedBitsFields.state.bits.awayState` | \{ `bit`: `1`; \} | - |
| `water_heater.state.packedBitsFields.state.bits.awayState.bit` | `1` | `WaterHeaterStateFlags.AWAY` |
| `water_heater.state.packedBitsFields.state.bits.onState` | \{ `bit`: `2`; \} | - |
| `water_heater.state.packedBitsFields.state.bits.onState.bit` | `2` | `WaterHeaterStateFlags.ON` |
| `water_heater.state.packedBitsFields.state.fieldNumber` | `6` | `6` |
| `water_heater.state.packedBitsFields.state.wireType` | `0` | `WireType.VARINT` |
| `water_heater.type` | `"water_heater"` | `"water_heater"` |
