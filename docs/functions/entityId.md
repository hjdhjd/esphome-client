[**esphome-client**](../README.md)

***

[Home](../README.md) / entityId

# Function: entityId()

```ts
function entityId<T>(type, objectId): EntityId<T>;
```

Canonical constructor - the only sanctioned way to mint an EntityId. Encapsulates the `{type}-{object_id}` format rule and the lowercasing convention so every code
path produces the same string for the same entity.

Usage:

```ts
export function entityIdConstructionExample(client: EspHomeClient): void {

  // Brand mint - the type carries through to client.command's options narrowing.
  const bedroomLamp = entityId("light", "bedroom_lamp");
  const frontDoor = entityId("switch", "front_door");
  const livingRoomTemp = entityId("sensor", "living_room_temperature");

  client.command(bedroomLamp, { state: true });
  client.command(frontDoor, { state: false });

  // Sensor entities have no command surface (read-only); referencing the brand at the right call site keeps the type checker honest.
  void client.latest(livingRoomTemp);
}
```

## Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* `string` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The entity type discriminant. Accepts any string (not just built-in [EntityType](../type-aliases/EntityType.md) members) so callers using extras-registered schemas can mint branded ids for them; the type-system narrowing carries the literal through, so a typo's brand still fails to assign to a method expecting the correct brand. |
| `objectId` | `string` | The ESPHome object identifier (typically the YAML key). |

## Returns

[`EntityId`](../type-aliases/EntityId.md)\<`T`\>

A branded entity id.
