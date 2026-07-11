[**esphome-client**](../README.md)

***

[Home](../README.md) / MediaPlayerCommand

# Type Alias: MediaPlayerCommand

```ts
type MediaPlayerCommand = typeof MediaPlayerCommand[keyof typeof MediaPlayerCommand];
```

Media player commands accepted on the has-pattern `command` field of `MediaPlayerCommandRequest` (see the `media_player.command` schema). Mirrors `api.proto`
`MediaPlayerCommand`. Because `command`, `volume`, `mediaUrl`, and `announcement` are independent has-pattern fields on the same request, a single command call
can combine, for example, a volume change with a play command in one round trip.
