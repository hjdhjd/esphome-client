[**esphome-client**](../README.md)

***

[Home](../README.md) / MediaPlayerFormatPurpose

# Variable: MediaPlayerFormatPurpose

```ts
const MediaPlayerFormatPurpose: {
  ANNOUNCEMENT: 1;
  DEFAULT: 0;
};
```

Media player supported-format purpose values reported on entity discovery. Mirrors `api.proto` `MediaPlayerFormatPurpose`. Use this constant for narrowing on
`MediaPlayerEntity.supportedFormats[].purpose` instead of raw numeric literals.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-announcement"></a> `ANNOUNCEMENT` | `1` | `1` |
| <a id="property-default"></a> `DEFAULT` | `0` | `0` |
