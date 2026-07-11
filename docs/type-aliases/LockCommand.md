[**esphome-client**](../README.md)

***

[Home](../README.md) / LockCommand

# Type Alias: LockCommand

```ts
type LockCommand = typeof LockCommand[keyof typeof LockCommand];
```

Lock commands accepted on the `command` field of `LockCommandRequest` (see the `lock.command` schema). Mirrors `api.proto` `LockCommand`. `OPEN` is only meaningful
when the entity's discovery-time `supportsOpen` flag is set; the request also carries an optional `code` has-pattern field, required when `requiresCode` is set.
