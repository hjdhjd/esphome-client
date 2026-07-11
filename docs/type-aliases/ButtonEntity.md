[**esphome-client**](../README.md)

***

[Home](../README.md) / ButtonEntity

# Type Alias: ButtonEntity

```ts
type ButtonEntity = EntityFor<typeof ENTITY_SCHEMAS["button"]>;
```

The `button` entity type: a stateless momentary trigger (press-only, with no awaitable state).

Usage:

```ts
export function buttonCommandExample(client: EspHomeClient): void {

  const reboot = entityId("button", "reboot_now");

  client.command(reboot, {});
}
```
