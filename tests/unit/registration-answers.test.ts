import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/outbox", () => ({ enqueueRsvpConfirmation: vi.fn() }));

import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import {
  buildAnswersPayload,
  canSelectMore,
  formatIsoDate,
  identityErrors,
  initialAnswerState,
  limitHint,
  shouldShowCounter,
  submittedValue,
  textLimits,
  validateAnswerState,
  validateQuestion,
  visibleQuestionKeys,
  type AnswerState,
} from "@/components/rsvp/registrationAnswers";
import { validateAndNormalizeAnswers } from "@/lib/rsvpCore";

const q = (key: string, type: RegistrationFieldDefinition["type"], extra: Partial<RegistrationFieldDefinition> = {}): RegistrationFieldDefinition => ({
  key,
  label: key,
  type,
  required: false,
  options: [],
  ...extra,
});

const state = (answers: Record<string, unknown>, others: AnswerState["others"] = {}): AnswerState => ({ answers, others });

describe("Other answers", () => {
  const radio = q("heard", "RADIO", { options: ["Friend", "Newsletter"], settings: { allowOther: true } });
  const multi = q("diet", "MULTI_SELECT", { options: ["Vegan", "Halal"], settings: { allowOther: true, maxSelections: 2 } });

  it("sends the typed text itself for single choice", () => {
    expect(submittedValue(radio, "Friend", { chosen: true, text: "  A poster " })).toBe("A poster");
    expect(submittedValue(radio, "Friend", { chosen: false, text: "A poster" })).toBe("Friend");
  });

  it("adds the typed text as one extra checkbox value", () => {
    expect(submittedValue(multi, ["Vegan"], { chosen: true, text: "Kosher" })).toEqual(["Vegan", "Kosher"]);
    expect(submittedValue(multi, ["Vegan"], { chosen: true, text: "  " })).toEqual(["Vegan"]);
  });

  it("ignores Other when the question does not allow it, and drops stale choices", () => {
    const plain = q("size", "SELECT", { options: ["S", "M"] });
    expect(submittedValue(plain, "S", { chosen: true, text: "XL" })).toBe("S");
    expect(submittedValue(plain, "XXL")).toBe("");
    expect(submittedValue(q("tags", "MULTI_SELECT", { options: ["A"] }), ["A", "Gone"])).toEqual(["A"]);
  });

  it("needs the Other text once Other is picked, and counts it as an answer", () => {
    const required = { ...radio, required: true };
    expect(validateQuestion(required, "", { chosen: true, text: "" })).toMatch(/Other/);
    expect(validateQuestion(required, "", { chosen: true, text: "Poster" })).toBeNull();
    expect(validateQuestion({ ...multi, required: true }, [], { chosen: true, text: "Kosher" })).toBeNull();
  });

  it("counts Other towards the selection limit", () => {
    expect(canSelectMore(multi, ["Vegan"], { chosen: false, text: "" })).toBe(true);
    expect(canSelectMore(multi, ["Vegan"], { chosen: true, text: "" })).toBe(false);
    expect(validateQuestion(multi, ["Vegan", "Halal"], { chosen: true, text: "Kosher" })).toBe("Choose up to 2.");
  });

  it("splits saved answers back into choices and Other text", () => {
    const initial = initialAnswerState([radio, multi], { heard: "A poster", diet: ["Vegan", "Kosher"] });
    expect(initial.answers).toEqual({ heard: "", diet: ["Vegan"] });
    expect(initial.others).toEqual({ heard: { chosen: true, text: "A poster" }, diet: { chosen: true, text: "Kosher" } });
    expect(buildAnswersPayload([radio, multi], initial)).toEqual({ heard: "A poster", diet: ["Vegan", "Kosher"] });
  });

  it("produces answers the server accepts", () => {
    const fields = [radio, multi].map((field, index) => ({ ...field, id: `f${index}` }));
    const payload = buildAnswersPayload(fields, state({ heard: "", diet: ["Halal"] }, { heard: { chosen: true, text: "Poster" }, diet: { chosen: true, text: "Kosher" } }));
    const result = validateAndNormalizeAnswers({ fields, answers: payload });
    expect("rows" in result && result.rows.map((row) => row.valueText)).toEqual(["Poster", "Halal", "Kosher"]);
  });
});

describe("show only if", () => {
  const attending = q("attending_dinner", "CHECKBOX");
  const diet = q("diet", "SELECT", { options: ["Vegan", "Other"], required: true, settings: { showIf: { fieldKey: "attending_dinner", values: ["Yes"] } } });
  const notes = q("notes", "TEXT", { settings: { showIf: { fieldKey: "diet", values: ["Vegan"] } } });
  const fields = [attending, diet, notes];

  it("tracks visibility live from the current answers", () => {
    expect([...visibleQuestionKeys(fields, state({}))]).toEqual(["attending_dinner"]);
    expect([...visibleQuestionKeys(fields, state({ attending_dinner: true, diet: "Vegan" }))]).toEqual(["attending_dinner", "diet", "notes"]);
  });

  it("never sends answers to hidden questions", () => {
    const answers = { attending_dinner: false, diet: "Vegan", notes: "No mushrooms" };
    expect(buildAnswersPayload(fields, state(answers))).toEqual({ attending_dinner: false });
    expect(buildAnswersPayload(fields, state({ ...answers, attending_dinner: true }))).toEqual({ attending_dinner: true, diet: "Vegan", notes: "No mushrooms" });
  });

  it("does not require hidden questions", () => {
    expect(validateAnswerState(fields, state({ attending_dinner: false }))).toEqual({});
    expect(validateAnswerState(fields, state({ attending_dinner: true }))).toEqual({ diet: "Please choose an option." });
  });
});

describe("limits", () => {
  it("uses the built-in caps unless a limit is set", () => {
    expect(textLimits(q("a", "TEXT"))).toEqual({ min: undefined, max: 200 });
    expect(textLimits(q("a", "TEXTAREA", { settings: { minLength: 10, maxLength: 300 } }))).toEqual({ min: 10, max: 300 });
    expect(textLimits(q("a", "EMAIL"))).toEqual({});
  });

  it("shows a counter for custom limits or near the cap", () => {
    expect(shouldShowCounter(q("a", "TEXT"), 10)).toBe(false);
    expect(shouldShowCounter(q("a", "TEXT"), 170)).toBe(true);
    expect(shouldShowCounter(q("a", "TEXT", { settings: { maxLength: 50 } }), 0)).toBe(true);
  });

  it("explains limits in plain words", () => {
    expect(limitHint(q("a", "NUMBER", { settings: { min: 1, max: 10 } }))).toBe("Enter a number from 1 to 10.");
    expect(limitHint(q("a", "NUMBER", { settings: { max: 4 } }))).toBe("Enter 4 or less.");
    expect(limitHint(q("a", "DATE", { settings: { minDate: "2026-10-15" } }))).toBe("Choose a date on or after 15 Oct 2026.");
    expect(limitHint(q("a", "MULTI_SELECT", { options: ["x"], settings: { maxSelections: 3 } }))).toBe("Choose up to 3.");
    expect(limitHint(q("a", "TEXT", { settings: { minLength: 1 } }))).toBe("At least 1 character.");
    expect(limitHint(q("a", "TEXT"))).toBeNull();
    expect(formatIsoDate("2026-01-02")).toBe("2 Jan 2026");
  });

  it("matches the server's text, number and date rules", () => {
    const text = q("bio", "TEXTAREA", { settings: { minLength: 5, maxLength: 10 } });
    expect(validateQuestion(text, "abc")).toBe("Use at least 5 characters (you have 3).");
    expect(validateQuestion(text, "  abcdef  ")).toBeNull();
    expect(validateQuestion(text, "abcdefghijk")).toBe("Use 10 characters or fewer.");
    const number = q("age", "NUMBER", { settings: { min: 18 } });
    expect(validateQuestion(number, "17")).toBe("Enter 18 or more.");
    expect(validateQuestion(number, 18)).toBeNull();
    expect(validateQuestion(number, "")).toBeNull();
    const date = q("day", "DATE", { required: true, settings: { minDate: "2026-10-01", maxDate: "2026-10-31" } });
    expect(validateQuestion(date, "")).toBe("Please choose a date.");
    expect(validateQuestion(date, "2026-11-01")).toBe("Choose a date from 1 Oct 2026 to 31 Oct 2026.");
    expect(validateQuestion(date, "2026-10-31")).toBeNull();
  });

  it("checks the rest of the question types", () => {
    expect(validateQuestion(q("e", "EMAIL"), "nope")).toMatch(/valid email/);
    expect(validateQuestion(q("p", "PHONE"), "+9112345")).toMatch(/Indian mobile/);
    expect(validateQuestion(q("p", "PHONE"), "+447700900123")).toBeNull();
    expect(validateQuestion(q("c", "CHECKBOX", { required: true }), false)).toMatch(/tick/);
    expect(validateQuestion(q("t", "TEXT", { required: true }), "   ")).toBe("Please answer this question.");
  });
});

describe("name and email", () => {
  it("asks for what is missing", () => {
    expect(identityErrors({ name: " ", email: "", requireName: true, requireEmail: true })).toEqual({ name: "Please enter your name.", email: "Please enter your email address." });
    expect(identityErrors({ name: "", email: "a@b", requireName: false, requireEmail: true }).email).toMatch(/valid email/);
    expect(identityErrors({ name: "Ada", email: "ada@example.com", requireName: true, requireEmail: true })).toEqual({});
  });
});
