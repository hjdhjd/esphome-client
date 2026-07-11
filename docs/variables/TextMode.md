[**esphome-client**](../README.md)

***

[Home](../README.md) / TextMode

# Variable: TextMode

```ts
const TextMode: {
  PASSWORD: 1;
  TEXT: 0;
};
```

Text-entity input mode, surfaced on `ListEntitiesTextResponse` (`mode` field). Mirrors `api.proto` `TextMode`. The mode tells the consumer whether to render
the input as plaintext or as a password (masked) field.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-password"></a> `PASSWORD` | `1` | `1` |
| <a id="property-text"></a> `TEXT` | `0` | `0` |
