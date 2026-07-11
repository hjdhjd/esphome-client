[**esphome-client**](../README.md)

***

[Home](../README.md) / AlarmControlPanelCommand

# Variable: AlarmControlPanelCommand

```ts
const AlarmControlPanelCommand: {
  ARM_AWAY: 1;
  ARM_CUSTOM_BYPASS: 5;
  ARM_HOME: 2;
  ARM_NIGHT: 3;
  ARM_VACATION: 4;
  DISARM: 0;
  TRIGGER: 6;
};
```

Alarm control panel state commands accepted on the `command` field of `AlarmControlPanelCommandRequest` (see the `alarm_control_panel.command` schema). Mirrors
`api.proto` `AlarmControlPanelCommand`. The request also carries an optional `code` string alongside this command, required when the entity's discovery-time
`requiresCode` or `requiresCodeToArm` flag is set.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-arm_away"></a> `ARM_AWAY` | `1` | `1` |
| <a id="property-arm_custom_bypass"></a> `ARM_CUSTOM_BYPASS` | `5` | `5` |
| <a id="property-arm_home"></a> `ARM_HOME` | `2` | `2` |
| <a id="property-arm_night"></a> `ARM_NIGHT` | `3` | `3` |
| <a id="property-arm_vacation"></a> `ARM_VACATION` | `4` | `4` |
| <a id="property-disarm"></a> `DISARM` | `0` | `0` |
| <a id="property-trigger"></a> `TRIGGER` | `6` | `6` |
