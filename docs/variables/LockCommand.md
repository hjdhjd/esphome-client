[**esphome-client**](../README.md)

***

[Home](../README.md) / LockCommand

# Variable: LockCommand

```ts
const LockCommand: {
  LOCK: 1;
  OPEN: 2;
  UNLOCK: 0;
};
```

Lock commands accepted on the `command` field of `LockCommandRequest` (see the `lock.command` schema). Mirrors `api.proto` `LockCommand`. `OPEN` is only meaningful
when the entity's discovery-time `supportsOpen` flag is set; the request also carries an optional `code` has-pattern field, required when `requiresCode` is set.

## Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-lock"></a> `LOCK` | `1` | `1` |
| <a id="property-open"></a> `OPEN` | `2` | `2` |
| <a id="property-unlock"></a> `UNLOCK` | `0` | `0` |
