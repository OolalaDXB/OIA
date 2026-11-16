import { describe, expect, it } from "vitest";
import { contentText } from "../src/mistral";

describe("contenu Mistral", () => {
  it("accepte une chaîne ou des morceaux, et ne garde que le texte", () => {
    expect(contentText('{"a":1}')).toBe('{"a":1}');
    expect(contentText([{ type: "thinking", text: "hmm" }, { type: "text", text: '{"a":' }, { type: "text", text: "1}" }])).toBe('{"a":1}');
    expect(contentText(null)).toBe("");
    expect(contentText(undefined)).toBe("");
  });
});
