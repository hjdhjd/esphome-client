[**esphome-client**](../README.md)

***

[Home](../README.md) / UserServicesApi

# Class: UserServicesApi

User-defined services sub-API. Exposes the discovered service catalog and the two execution paths (by key or by name).

## Remarks

Stateless aside from the seam reference. Construct one instance per host; the singleton lifetime is managed by the host's `services` lazy getter.

## Methods

### execute()

```ts
execute(key, args?): void;
```

Execute a user-defined service on the ESPHome device by its numeric key. Use [executeByName](#executebyname) when only the service name is known; this method is the lower
level entry point for callers that already have the key cached.

Usage:

```ts
export function serviceExecutionExample(client: EspHomeClient): void {

  // Enumerate the discovered services.
  for(const service of client.services.list()) {

    void service.key;
    void service.name;
    void service.args;
  }

  // Argument shape mirrors the service definition - one of bool, int, float, string, or their array equivalents per slot.
  const args: ExecuteServiceArgumentValue[] = [

    { stringValue: "front_door" },
    { intValue: 30 },
    { boolArray: [ true, false, true ] }
  ];

  // Two execution rails - the by-name rail looks up the key from the registry first.
  client.services.execute(12345, args);
  client.services.executeByName("notify_user", args);
}
```

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `key` | `number` | `undefined` | The service key (numeric identifier). |
| `args` | [`ExecuteServiceArgumentValue`](../interfaces/ExecuteServiceArgumentValue.md)[] | `[]` | An array of argument values matching the service definition. |

#### Returns

`void`

***

### executeByName()

```ts
executeByName(name, args?): void;
```

Execute a user-defined service on the ESPHome device by name. Looks up the service in the discovery registry and dispatches to [execute](#execute).

Usage:

```ts
export function serviceExecutionExample(client: EspHomeClient): void {

  // Enumerate the discovered services.
  for(const service of client.services.list()) {

    void service.key;
    void service.name;
    void service.args;
  }

  // Argument shape mirrors the service definition - one of bool, int, float, string, or their array equivalents per slot.
  const args: ExecuteServiceArgumentValue[] = [

    { stringValue: "front_door" },
    { intValue: 30 },
    { boolArray: [ true, false, true ] }
  ];

  // Two execution rails - the by-name rail looks up the key from the registry first.
  client.services.execute(12345, args);
  client.services.executeByName("notify_user", args);
}
```

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `name` | `string` | `undefined` | The service name as declared in the device's YAML. |
| `args` | [`ExecuteServiceArgumentValue`](../interfaces/ExecuteServiceArgumentValue.md)[] | `[]` | An array of argument values matching the service definition. |

#### Returns

`void`

***

### list()

```ts
list(): ServiceEntity[];
```

Enumerate the user-defined services discovered on the current connection. Returns a shallow copy of the registry's discovery-ordered list so consumer mutations
never bleed into the registry's state.

Usage:

```ts
export function serviceExecutionExample(client: EspHomeClient): void {

  // Enumerate the discovered services.
  for(const service of client.services.list()) {

    void service.key;
    void service.name;
    void service.args;
  }

  // Argument shape mirrors the service definition - one of bool, int, float, string, or their array equivalents per slot.
  const args: ExecuteServiceArgumentValue[] = [

    { stringValue: "front_door" },
    { intValue: 30 },
    { boolArray: [ true, false, true ] }
  ];

  // Two execution rails - the by-name rail looks up the key from the registry first.
  client.services.execute(12345, args);
  client.services.executeByName("notify_user", args);
}
```

#### Returns

[`ServiceEntity`](../interfaces/ServiceEntity.md)[]

An array of discovered service entities, in discovery order.
