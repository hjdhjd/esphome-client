[**esphome-client**](../README.md)

***

[Home](../README.md) / MediaPlayerEntity

# Type Alias: MediaPlayerEntity

```ts
type MediaPlayerEntity = EntityFor<typeof ENTITY_SCHEMAS["media_player"]>;
```

The `media_player` entity type: playback transport, volume, mute, and media-URL playback with announcements.

Usage:

```ts
export async function mediaPlayerCommandExample(client: EspHomeClient): Promise<MediaPlayerEvent> {

  const speaker = entityId("media_player", "kitchen_speaker");

  using subscription = client.on("media_player", (event) => {

    if(event.state === undefined) {

      return;
    }

    switch(event.state) {

      case MediaPlayerState.NONE:
      case MediaPlayerState.IDLE: {

        // Stopped or no media loaded. Show the idle UI.
        break;
      }

      case MediaPlayerState.PLAYING: {

        // Active playback. Update the play/pause toggle to "playing".
        break;
      }

      case MediaPlayerState.PAUSED: {

        // Paused. Update the play/pause toggle to "paused".
        break;
      }

      case MediaPlayerState.ANNOUNCING: {

        // TTS announcement in progress. Suppress unrelated UI changes until the next state.
        break;
      }

      case MediaPlayerState.OFF:
      case MediaPlayerState.ON: {

        // Power-state transitions on speakers that surface them. Reflect the badge.
        break;
      }

      default: {

        const _exhaustive: never = event.state;

        void _exhaustive;
      }
    }
  });

  void subscription;

  // Play a URL at half volume.
  client.command(speaker, {

    command: MediaPlayerCommand.PLAY,
    mediaUrl: "https://stream.example.com/playlist.m3u8",
    volume: 0.5
  });

  // Mute and await the matching state.
  return await client.commandAndAwait(speaker, { command: MediaPlayerCommand.MUTE });
}
```
