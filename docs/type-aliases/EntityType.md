[**esphome-client**](../README.md)

***

[Home](../README.md) / EntityType

# Type Alias: EntityType

```ts
type EntityType = keyof typeof ENTITY_SCHEMAS;
```

String literal union enumerating every ESPHome entity type. Used as the discriminant on the [Entity](Entity.md) union for narrowing. Derived directly
from the keys of the [ENTITY\_SCHEMAS](../variables/ENTITY_SCHEMAS.md) registry so the union and the schema cannot drift apart - adding a new entity type to
ENTITY_SCHEMAS automatically extends this union.
