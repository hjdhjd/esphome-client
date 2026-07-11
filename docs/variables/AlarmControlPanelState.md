[**esphome-client**](../README.md)

***

[Home](../README.md) / AlarmControlPanelState

# Variable: AlarmControlPanelState

```ts
const AlarmControlPanelState: {
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
```

Alarm control panel state values reported by ESPHome alarm-control-panel entities on telemetry. Mirrors `api.proto` `AlarmControlPanelState`. Use this constant for
narrowing on `AlarmControlPanelEvent.state` instead of raw numeric literals.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-armed_away"></a> `ARMED_AWAY` | `2` | `2` |
| <a id="property-armed_custom_bypass"></a> `ARMED_CUSTOM_BYPASS` | `5` | `5` |
| <a id="property-armed_home"></a> `ARMED_HOME` | `1` | `1` |
| <a id="property-armed_night"></a> `ARMED_NIGHT` | `3` | `3` |
| <a id="property-armed_vacation"></a> `ARMED_VACATION` | `4` | `4` |
| <a id="property-arming"></a> `ARMING` | `7` | `7` |
| <a id="property-disarmed"></a> `DISARMED` | `0` | `0` |
| <a id="property-disarming"></a> `DISARMING` | `8` | `8` |
| <a id="property-pending"></a> `PENDING` | `6` | `6` |
| <a id="property-triggered"></a> `TRIGGERED` | `9` | `9` |
