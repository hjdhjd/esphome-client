[**esphome-client**](../README.md)

***

[Home](../README.md) / AlarmControlPanelEntity

# Type Alias: AlarmControlPanelEntity

```ts
type AlarmControlPanelEntity = EntityFor<typeof ENTITY_SCHEMAS["alarm_control_panel"]>;
```

The `alarm_control_panel` entity type: arm / disarm / trigger transitions guarded by an optional code.

Usage:

```ts
export async function alarmControlPanelCommandExample(client: EspHomeClient): Promise<AlarmControlPanelEvent> {

  const panel = entityId("alarm_control_panel", "house_alarm");

  return client.commandAndAwait(panel, {

    code: process.env["ALARM_CODE"] ?? "",
    command: AlarmControlPanelCommand.ARM_AWAY
  }, {

    // The schema's state-side enumMappings narrows event.state to the AlarmControlPanelState literal-union, so this comparison is a typed compile-time check rather
    // than a stringly-numeric guess. Forgetting which numeric value corresponds to "armed away" is no longer a thing the consumer has to remember.
    predicate: (event): boolean => event.state === AlarmControlPanelState.ARMED_AWAY,
    timeoutMs: 30000
  });
}
```
