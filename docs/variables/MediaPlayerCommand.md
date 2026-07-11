[**esphome-client**](../README.md)

***

[Home](../README.md) / MediaPlayerCommand

# Variable: MediaPlayerCommand

```ts
const MediaPlayerCommand: {
  CLEAR_PLAYLIST: 11;
  ENQUEUE: 8;
  MUTE: 3;
  PAUSE: 1;
  PLAY: 0;
  REPEAT_OFF: 10;
  REPEAT_ONE: 9;
  STOP: 2;
  TOGGLE: 5;
  TURN_OFF: 13;
  TURN_ON: 12;
  UNMUTE: 4;
  VOLUME_DOWN: 7;
  VOLUME_UP: 6;
};
```

Media player commands accepted on the has-pattern `command` field of `MediaPlayerCommandRequest` (see the `media_player.command` schema). Mirrors `api.proto`
`MediaPlayerCommand`. Because `command`, `volume`, `mediaUrl`, and `announcement` are independent has-pattern fields on the same request, a single command call
can combine, for example, a volume change with a play command in one round trip.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-clear_playlist"></a> `CLEAR_PLAYLIST` | `11` | `11` |
| <a id="property-enqueue"></a> `ENQUEUE` | `8` | `8` |
| <a id="property-mute"></a> `MUTE` | `3` | `3` |
| <a id="property-pause"></a> `PAUSE` | `1` | `1` |
| <a id="property-play"></a> `PLAY` | `0` | `0` |
| <a id="property-repeat_off"></a> `REPEAT_OFF` | `10` | `10` |
| <a id="property-repeat_one"></a> `REPEAT_ONE` | `9` | `9` |
| <a id="property-stop"></a> `STOP` | `2` | `2` |
| <a id="property-toggle"></a> `TOGGLE` | `5` | `5` |
| <a id="property-turn_off"></a> `TURN_OFF` | `13` | `13` |
| <a id="property-turn_on"></a> `TURN_ON` | `12` | `12` |
| <a id="property-unmute"></a> `UNMUTE` | `4` | `4` |
| <a id="property-volume_down"></a> `VOLUME_DOWN` | `7` | `7` |
| <a id="property-volume_up"></a> `VOLUME_UP` | `6` | `6` |
