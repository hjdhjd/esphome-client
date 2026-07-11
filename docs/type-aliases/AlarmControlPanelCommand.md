[**esphome-client**](../README.md)

***

[Home](../README.md) / AlarmControlPanelCommand

# Type Alias: AlarmControlPanelCommand

```ts
type AlarmControlPanelCommand = typeof AlarmControlPanelCommand[keyof typeof AlarmControlPanelCommand];
```

Alarm control panel state commands accepted on the `command` field of `AlarmControlPanelCommandRequest` (see the `alarm_control_panel.command` schema). Mirrors
`api.proto` `AlarmControlPanelCommand`. The request also carries an optional `code` string alongside this command, required when the entity's discovery-time
`requiresCode` or `requiresCodeToArm` flag is set.
