import { describe, expect, it } from "vitest";
import { messages } from "../messages";

const locales = Object.keys(messages) as Array<keyof typeof messages>;
const [base, ...rest] = locales;
const baseKeys = Object.keys(messages[base]).sort();

describe("i18n messages", () => {
  it.each(rest.map((locale) => [locale]))(
    "%s mirrors the %s key set exactly",
    (locale) => {
      expect(Object.keys(messages[locale]).sort()).toEqual(baseKeys);
    },
  );

  it("keeps every value a non-empty string in every locale", () => {
    for (const locale of locales) {
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value, `${String(locale)}:${key}`).toBeTruthy();
        expect(typeof value, `${String(locale)}:${key}`).toBe("string");
      }
    }
  });
});
