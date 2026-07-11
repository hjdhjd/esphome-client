/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * voice-assistant.test.ts: Unit tests for the module-level inbound dispatchers in voice-assistant.ts.
 */
import { decodeProtobuf, encodeProtoFields } from "./protocol/codec.ts";
import { describe, test } from "node:test";
import {
  dispatchVoiceAssistantAnnounceFinished, dispatchVoiceAssistantAudio, dispatchVoiceAssistantConfiguration, dispatchVoiceAssistantRequest
} from "./voice-assistant.ts";
import { Buffer } from "node:buffer";
import type { ClientEventsMap } from "./esphome-client.ts";
import { EventBus } from "./event-bus.ts";
import type { FieldValue } from "./protocol/codec.ts";
import type { ProtoField } from "./protocol/codec.ts";
import type { VoiceAssistantInboundContext } from "./voice-assistant.ts";
import { WireType } from "./protocol/wire-types.ts";
import assert from "node:assert/strict";

function makeCtx(): VoiceAssistantInboundContext & { events: readonly { event: string; payload: unknown }[]; warnings: string[] } {

  const bus = new EventBus<ClientEventsMap>();
  const events: { event: string; payload: unknown }[] = [];
  const warnings: string[] = [];

  // Capture every event the dispatcher emits. We attach a listener for each known voice-assistant event so the test bus does not lose emissions to "no listener".
  for(const evt of [ "voiceAssistantRequest", "voiceAssistantAnnounceFinished", "voiceAssistantConfiguration", "voiceAssistantAudio" ] as const) {

    bus.on(evt, (payload) => { events.push({ event: evt, payload }); });
  }

  return {

    bus,
    decode: (buffer: Buffer): Record<number, FieldValue[]> => decodeProtobuf(buffer, { maxFieldsPerMessage: 100 }),
    events,
    log: {

      debug: (): void => { /* swallowed */ },
      error: (): void => { /* swallowed */ },
      info: (): void => { /* swallowed */ },
      warn: (msg: string): void => { warnings.push(msg); }
    },
    warnings
  };
}

describe("dispatchVoiceAssistantRequest", () => {

  test("emits a voiceAssistantRequest event with start, conversationId, flags, wakeWordPhrase from the wire", () => {

    const ctx = makeCtx();
    const fields: ProtoField[] = [

      { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 2, value: Buffer.from("conv-1", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: 7, wireType: WireType.VARINT },
      { fieldNumber: 5, value: Buffer.from("Hey ESP", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ];

    dispatchVoiceAssistantRequest(encodeProtoFields(fields), ctx);

    assert.equal(ctx.events.length, 1);
    assert.equal(ctx.events[0]?.event, "voiceAssistantRequest");

    const payload = ctx.events[0]?.payload as { conversationId?: string; flags: number; start: boolean; wakeWordPhrase?: string };

    assert.equal(payload.start, true);
    assert.equal(payload.conversationId, "conv-1");
    assert.equal(payload.flags, 7);
    assert.equal(payload.wakeWordPhrase, "Hey ESP");
  });

  test("omits optional fields when absent on the wire (exactOptionalPropertyTypes contract)", () => {

    const ctx = makeCtx();
    const fields: ProtoField[] = [{ fieldNumber: 1, value: 0, wireType: WireType.VARINT }];

    dispatchVoiceAssistantRequest(encodeProtoFields(fields), ctx);

    const payload = ctx.events[0]?.payload as Record<string, unknown>;

    assert.equal(("conversationId" in payload), false, "absent on wire -> omitted from payload (not undefined)");
    assert.equal(("wakeWordPhrase" in payload), false);
    assert.equal(("audioSettings" in payload), false);
    assert.equal(payload["start"], false);
    assert.equal(payload["flags"], 0, "flags defaults to 0 when absent");
  });

  test("parses nested audioSettings buffer into the audioSettings field", () => {

    const ctx = makeCtx();

    // Inner audio settings: noise=2, autoGain=3, volume=1.5 (fixed32 float).
    const volBuf = Buffer.alloc(4);

    volBuf.writeFloatLE(1.5, 0);

    const audioSettingsInner = encodeProtoFields([

      { fieldNumber: 1, value: 2, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 3, wireType: WireType.VARINT },
      { fieldNumber: 3, value: volBuf, wireType: WireType.FIXED32 }
    ]);

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 4, value: audioSettingsInner, wireType: WireType.LENGTH_DELIMITED }
    ];

    dispatchVoiceAssistantRequest(encodeProtoFields(fields), ctx);

    const payload = ctx.events[0]?.payload as { audioSettings?: { autoGain: number; noiseSuppressionLevel: number; volumeMultiplier: number } };

    assert.deepEqual(payload.audioSettings, { autoGain: 3, noiseSuppressionLevel: 2, volumeMultiplier: 1.5 });
  });

  test("a wire volume of 0 falls back to the unity volume multiplier", () => {

    const ctx = makeCtx();

    // Mirror the nested audioSettings setup but write 0 into the volume float. A literal 0 on the wire is the sentinel ESPHome sends for "unset", so the dispatcher
    // coerces it to the unity multiplier (1.0) rather than silencing the stream.
    const volBuf = Buffer.alloc(4);

    volBuf.writeFloatLE(0, 0);

    const audioSettingsInner = encodeProtoFields([

      { fieldNumber: 1, value: 2, wireType: WireType.VARINT },
      { fieldNumber: 2, value: 3, wireType: WireType.VARINT },
      { fieldNumber: 3, value: volBuf, wireType: WireType.FIXED32 }
    ]);

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
      { fieldNumber: 4, value: audioSettingsInner, wireType: WireType.LENGTH_DELIMITED }
    ];

    dispatchVoiceAssistantRequest(encodeProtoFields(fields), ctx);

    const payload = ctx.events[0]?.payload as { audioSettings?: { volumeMultiplier: number } };

    assert.equal(payload.audioSettings?.volumeMultiplier, 1.0, "a wire volume of 0 falls back to the unity multiplier (1.0), not 0");
  });
});

describe("dispatchVoiceAssistantAnnounceFinished", () => {

  test("emits true when success flag is set", () => {

    const ctx = makeCtx();
    const fields = encodeProtoFields([{ fieldNumber: 1, value: 1, wireType: WireType.VARINT }]);

    dispatchVoiceAssistantAnnounceFinished(fields, ctx);

    assert.equal(ctx.events[0]?.event, "voiceAssistantAnnounceFinished");
    assert.equal(ctx.events[0]?.payload, true);
  });

  test("emits false when success flag is unset or absent", () => {

    const ctx = makeCtx();

    dispatchVoiceAssistantAnnounceFinished(Buffer.alloc(0), ctx);

    assert.equal(ctx.events[0]?.payload, false, "absent success -> false (not undefined)");
  });
});

describe("dispatchVoiceAssistantConfiguration", () => {

  test("emits a configuration record with empty arrays when no wake words declared", () => {

    const ctx = makeCtx();

    dispatchVoiceAssistantConfiguration(Buffer.alloc(0), ctx);

    const payload = ctx.events[0]?.payload as { activeWakeWords: string[]; availableWakeWords: unknown[]; maxActiveWakeWords: number };

    assert.deepEqual(payload.activeWakeWords, []);
    assert.deepEqual(payload.availableWakeWords, []);
    assert.equal(payload.maxActiveWakeWords, 0);
  });

  test("decodes repeated wake-word entries with id, wakeWord, and trainedLanguages", () => {

    const ctx = makeCtx();

    const wakeWord1 = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("ok-jarvis", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("Ok Jarvis", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: Buffer.from("en", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: Buffer.from("fr", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: wakeWord1, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("ok-jarvis", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: 2, wireType: WireType.VARINT }
    ];

    dispatchVoiceAssistantConfiguration(encodeProtoFields(fields), ctx);

    const payload = ctx.events[0]?.payload as {
      activeWakeWords: string[]; availableWakeWords: { id: string; trainedLanguages: string[]; wakeWord: string }[]; maxActiveWakeWords: number;
    };

    assert.equal(payload.availableWakeWords.length, 1);
    assert.equal(payload.availableWakeWords[0]?.id, "ok-jarvis");
    assert.equal(payload.availableWakeWords[0]?.wakeWord, "Ok Jarvis");
    assert.deepEqual(payload.availableWakeWords[0]?.trainedLanguages, [ "en", "fr" ]);
    assert.deepEqual(payload.activeWakeWords, ["ok-jarvis"]);
    assert.equal(payload.maxActiveWakeWords, 2);
  });

  test("a complete wake-word entry with no trainedLanguages yields an empty array, not undefined", () => {

    const ctx = makeCtx();

    // A complete entry (id + wakeWord) but with the field-3 language buffers omitted. The decoder seeds trainedLanguages to [] and never populates it, so the entry
    // surfaces with an empty array rather than an absent field.
    const wakeWord1 = encodeProtoFields([

      { fieldNumber: 1, value: Buffer.from("ok-jarvis", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("Ok Jarvis", "utf8"), wireType: WireType.LENGTH_DELIMITED }
    ]);

    const fields: ProtoField[] = [

      { fieldNumber: 1, value: wakeWord1, wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: Buffer.from("ok-jarvis", "utf8"), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 3, value: 2, wireType: WireType.VARINT }
    ];

    dispatchVoiceAssistantConfiguration(encodeProtoFields(fields), ctx);

    const payload = ctx.events[0]?.payload as { availableWakeWords: { id: string; trainedLanguages: string[]; wakeWord: string }[] };

    assert.equal(payload.availableWakeWords.length, 1, "the complete entry is retained even with no languages");
    assert.deepEqual(payload.availableWakeWords[0]?.trainedLanguages, [], "a missing language list yields [], not undefined");
  });

  test("skips wake-word entries missing id or wakeWord", () => {

    const ctx = makeCtx();

    // Entry with only id (no wake-word string) - must be skipped.
    const incomplete = encodeProtoFields([{ fieldNumber: 1, value: Buffer.from("orphan", "utf8"), wireType: WireType.LENGTH_DELIMITED }]);

    dispatchVoiceAssistantConfiguration(encodeProtoFields([{ fieldNumber: 1, value: incomplete, wireType: WireType.LENGTH_DELIMITED }]), ctx);

    const payload = ctx.events[0]?.payload as { availableWakeWords: unknown[] };

    assert.deepEqual(payload.availableWakeWords, [], "incomplete wake-word entries are silently skipped");
  });

  test("skips a wake-word entry that carries only a wakeWord string and no id", () => {

    const ctx = makeCtx();

    // Entry with only the wake-word string (no field-1 id) - the `if(id && wakeWord)` guard must skip it. The complementary only-id case is covered above.
    const incomplete = encodeProtoFields([{ fieldNumber: 2, value: Buffer.from("Ok Jarvis", "utf8"), wireType: WireType.LENGTH_DELIMITED }]);

    dispatchVoiceAssistantConfiguration(encodeProtoFields([{ fieldNumber: 1, value: incomplete, wireType: WireType.LENGTH_DELIMITED }]), ctx);

    const payload = ctx.events[0]?.payload as { availableWakeWords: unknown[] };

    assert.deepEqual(payload.availableWakeWords, [], "an entry missing the id is silently skipped");
  });
});

describe("dispatchVoiceAssistantAudio", () => {

  test("emits audioData with data and end flag", () => {

    const ctx = makeCtx();
    const fields: ProtoField[] = [

      { fieldNumber: 1, value: Buffer.from([ 0x01, 0x02, 0x03 ]), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: 1, wireType: WireType.VARINT }
    ];

    dispatchVoiceAssistantAudio(encodeProtoFields(fields), ctx);

    const payload = ctx.events[0]?.payload as { data: Buffer; end: boolean };

    assert.equal(payload.end, true);
    assert.deepEqual(payload.data, Buffer.from([ 0x01, 0x02, 0x03 ]));
  });

  test("warns and does not emit when data field is missing", () => {

    const ctx = makeCtx();

    dispatchVoiceAssistantAudio(Buffer.alloc(0), ctx);

    assert.equal(ctx.events.length, 0, "missing data must not emit");
    assert.equal(ctx.warnings.length, 1);
    assert.match(ctx.warnings[0] ?? "", /audio/);
  });

  test("end defaults to false when field is absent", () => {

    const ctx = makeCtx();
    const fields = encodeProtoFields([{ fieldNumber: 1, value: Buffer.from([0x42]), wireType: WireType.LENGTH_DELIMITED }]);

    dispatchVoiceAssistantAudio(fields, ctx);

    const payload = ctx.events[0]?.payload as { end: boolean };

    assert.equal(payload.end, false);
  });

  test("data2 is surfaced when present (ESPHome 1.14+ stereo extension)", () => {

    const ctx = makeCtx();
    const fields: ProtoField[] = [

      { fieldNumber: 1, value: Buffer.from([ 0xaa, 0xbb ]), wireType: WireType.LENGTH_DELIMITED },
      { fieldNumber: 2, value: 0, wireType: WireType.VARINT },
      { fieldNumber: 3, value: Buffer.from([ 0xcc, 0xdd ]), wireType: WireType.LENGTH_DELIMITED }
    ];

    dispatchVoiceAssistantAudio(encodeProtoFields(fields), ctx);

    const payload = ctx.events[0]?.payload as { data: Buffer; data2?: Buffer; end: boolean };

    assert.deepEqual(payload.data, Buffer.from([ 0xaa, 0xbb ]));
    assert.deepEqual(payload.data2, Buffer.from([ 0xcc, 0xdd ]));
    assert.equal(payload.end, false);
  });

  test("data2 is omitted from the payload when absent (pre-1.14 firmware compatibility)", () => {

    const ctx = makeCtx();
    const fields = encodeProtoFields([{ fieldNumber: 1, value: Buffer.from([0x42]), wireType: WireType.LENGTH_DELIMITED }]);

    dispatchVoiceAssistantAudio(fields, ctx);

    const payload = ctx.events[0]?.payload as { data: Buffer; data2?: Buffer; end: boolean };

    assert.equal(payload.data2, undefined, "data2 must be undefined (not a 0-byte Buffer) when the wire omits the field");
    assert.equal(Object.prototype.hasOwnProperty.call(payload, "data2"), false, "data2 should not appear as an own property when absent");
  });
});
