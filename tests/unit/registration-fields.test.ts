import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/outbox", () => ({ enqueueRsvpConfirmation: vi.fn() }));

import { validateAndNormalizeAnswers } from "@/lib/rsvpCore";
import { fieldSettingsSchema, generateFieldKey, parseFieldSettings, settingsForType, toFieldDefinition, visibleFieldKeys } from "@/lib/registrationFields";

const field = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
  id: `id_${key}`,
  key,
  label: key.replace(/_/g, " "),
  type: type as never,
  required: false,
  options: [] as unknown,
  settings: undefined as unknown,
  ...extra,
});

describe("question keys", () => {
  it("turns the question text into a stable, unique key", () => {
    expect(generateFieldKey("Dietary needs?", [])).toBe("dietary_needs");
    expect(generateFieldKey("Dietary needs", ["dietary_needs"])).toBe("dietary_needs_2");
    expect(generateFieldKey("Café — été", [])).toBe("cafe_ete");
    expect(generateFieldKey("!!!", [])).toBe("question");
  });
});

describe("question settings", () => {
  it("rejects contradictory or unknown settings", () => {
    expect(fieldSettingsSchema.safeParse({ min: 5, max: 1 }).success).toBe(false);
    expect(fieldSettingsSchema.safeParse({ minDate: "2026-12-01", maxDate: "2026-01-01" }).success).toBe(false);
    expect(fieldSettingsSchema.safeParse({ surprise: true }).success).toBe(false);
    expect(parseFieldSettings({ surprise: true })).toEqual({});
  });

  it("drops settings that don't apply to the question type", () => {
    expect(settingsForType("NUMBER", { min: 1, maxLength: 10, allowOther: true })).toEqual({ min: 1 });
    expect(settingsForType("MULTI_SELECT", { maxSelections: 2, allowOther: true, min: 3 })).toEqual({ maxSelections: 2, allowOther: true });
    expect(settingsForType("EMAIL", { maxLength: 10 })).toEqual({});
  });

  it("maps stored rows for the public form without trusting stored JSON", () => {
    expect(toFieldDefinition({ key: "k", label: "K", type: "TEXT", required: true, options: null, settings: { maxLength: "x" } })).toMatchObject({ options: [], settings: {}, helpText: "", placeholder: "" });
  });
});

describe("show only if", () => {
  const fields = [
    { key: "attending_dinner", type: "RADIO" as const },
    { key: "dietary", type: "MULTI_SELECT" as const, settings: { showIf: { fieldKey: "attending_dinner", values: ["Yes"] } } },
    { key: "allergy_details", type: "TEXT" as const, settings: { showIf: { fieldKey: "dietary", values: ["Allergy"] } } },
    { key: "orphan", type: "TEXT" as const, settings: { showIf: { fieldKey: "deleted_question", values: ["Yes"] } } },
  ];

  it("shows follow-up questions only for matching answers, through chains", () => {
    expect(visibleFieldKeys(fields, { attending_dinner: "No" })).toEqual(new Set(["attending_dinner", "orphan"]));
    expect(visibleFieldKeys(fields, { attending_dinner: "Yes", dietary: ["Allergy"] })).toEqual(new Set(["attending_dinner", "dietary", "allergy_details", "orphan"]));
    // A chain breaks when its trigger is hidden, even if a stale answer is sent.
    expect(visibleFieldKeys(fields, { attending_dinner: "No", dietary: ["Allergy"] }).has("allergy_details")).toBe(false);
  });

  it("ignores broken rules so a question never disappears for good", () => {
    expect(visibleFieldKeys(fields, {}).has("orphan")).toBe(true);
  });
});

describe("server-side answer rules", () => {
  it("skips hidden questions: not required, answers dropped", () => {
    const fields = [
      field("dinner", "RADIO", { options: ["Yes", "No"] }),
      field("diet", "TEXT", { required: true, settings: { showIf: { fieldKey: "dinner", values: ["Yes"] } } }),
    ];
    const hidden = validateAndNormalizeAnswers({ fields, answers: { dinner: "No", diet: "smuggled" } });
    expect(hidden).toEqual({ rows: [{ fieldId: "id_dinner", valueText: "No" }] });
    expect(validateAndNormalizeAnswers({ fields, answers: { dinner: "Yes" } })).toEqual({ error: "diet is required." });
  });

  it("enforces length, number and date limits", () => {
    expect(validateAndNormalizeAnswers({ fields: [field("bio", "TEXTAREA", { settings: { minLength: 10 } })], answers: { bio: "short" } })).toEqual({ error: "bio must be at least 10 characters." });
    expect(validateAndNormalizeAnswers({ fields: [field("bio", "TEXT", { settings: { maxLength: 3 } })], answers: { bio: "long" } })).toEqual({ error: "bio must be at most 3 characters." });
    expect(validateAndNormalizeAnswers({ fields: [field("age", "NUMBER", { settings: { min: 18 } })], answers: { age: 16 } })).toEqual({ error: "age must be 18 or more." });
    expect(validateAndNormalizeAnswers({ fields: [field("day", "DATE", { settings: { maxDate: "2026-10-31" } })], answers: { day: "2026-11-02" } })).toEqual({ error: "day can't be after 2026-10-31." });
  });

  it("accepts one 'Other' answer only when allowed, and caps selections", () => {
    const pickOne = field("heard", "RADIO", { options: ["Friend", "Social"] });
    expect(validateAndNormalizeAnswers({ fields: [pickOne], answers: { heard: "Podcast" } })).toEqual({ error: "heard must be one of the available options." });
    expect(validateAndNormalizeAnswers({ fields: [{ ...pickOne, settings: { allowOther: true } }], answers: { heard: "Podcast" } })).toEqual({ rows: [{ fieldId: "id_heard", valueText: "Podcast" }] });

    const many = field("diet", "MULTI_SELECT", { options: ["Vegan", "Halal", "Kosher"], settings: { allowOther: true, maxSelections: 2 } });
    expect(validateAndNormalizeAnswers({ fields: [many], answers: { diet: ["Vegan", "Halal", "Kosher"] } })).toEqual({ error: "diet: choose up to 2." });
    expect(validateAndNormalizeAnswers({ fields: [many], answers: { diet: ["Raw", "Paleo"] } })).toEqual({ error: "diet contains an invalid option." });
    expect(validateAndNormalizeAnswers({ fields: [many], answers: { diet: ["Vegan", "Paleo"] } })).toMatchObject({ rows: [{ valueText: "Vegan" }, { valueText: "Paleo" }] });
  });
});
