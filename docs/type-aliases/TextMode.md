[**esphome-client**](../README.md)

***

[Home](../README.md) / TextMode

# Type Alias: TextMode

```ts
type TextMode = typeof TextMode[keyof typeof TextMode];
```

Text-entity input mode, surfaced on `ListEntitiesTextResponse` (`mode` field). Mirrors `api.proto` `TextMode`. The mode tells the consumer whether to render
the input as plaintext or as a password (masked) field.
