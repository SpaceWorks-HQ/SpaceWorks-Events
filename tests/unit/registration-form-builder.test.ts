import { describe, expect, it } from "vitest";
import {
  affectedDependents,
  cleanChoices,
  draftFromField,
  droppedByTypeChange,
  duplicateChoiceIndexes,
  duplicateLabel,
  findLogicProblems,
  formatIsoDay,
  insertChoices,
  moveItem,
  newDraft,
  orderWithFieldBelow,
  previewFromDraft,
  removeAt,
  splitChoiceList,
  summarizeField,
  triggerCandidates,
  validateDraft,
  type BuilderField,
} from "@/components/registration/builderModel";

const field = (key: string, type: BuilderField["type"], extra: Partial<BuilderField> = {}): BuilderField => ({
  id: `id_${key}`,
  key,
  label: key.replace(/_/g, " "),
  type,
  required: false,
  sortOrder: 0,
  options: [],
  helpText: "",
  placeholder: "",
  settings: {},
  ...extra,
});

describe("question summaries", () => {
  it("describes choices, limits and rules in plain words", () => {
    expect(summarizeField(field("diet", "MULTI_SELECT", { options: ["A", "B", "C", "D"], settings: { allowOther: true, maxSelections: 2 } }))).toEqual(["4 choices", "Other allowed", "Up to 2"]);
    expect(summarizeField(field("age", "NUMBER", { settings: { min: 18, max: 99 } }))).toEqual(["18–99"]);
    expect(summarizeField(field("age", "NUMBER", { settings: { min: 18 } }))).toEqual(["At least 18"]);
    expect(summarizeField(field("bio", "TEXTAREA", { settings: { maxLength: 500 } }))).toEqual(["Up to 500 characters"]);
    expect(summarizeField(field("day", "DATE", { settings: { minDate: "2026-10-15", maxDate: "2026-11-01" } }))).toEqual(["15 Oct 2026 – 1 Nov 2026"]);
    expect(summarizeField(field("one", "RADIO", { options: ["Only"] }))).toEqual(["1 choice"]);
  });

  it("names the trigger question, never its key", () => {
    const trigger = field("attending_dinner", "CHECKBOX", { label: "Attending dinner" });
    const dependent = field("diet", "TEXT", { settings: { showIf: { fieldKey: "attending_dinner", values: ["Yes"] } } });
    const summary = summarizeField(dependent, [trigger, dependent]).join(" · ");
    expect(summary).toBe("Shows if: Attending dinner is Yes");
    expect(summary).not.toContain("attending_dinner");
    expect(summarizeField(dependent, [dependent])).toEqual(["Shows if: a removed question is Yes"]);
  });

  it("ignores settings that don't apply to the type", () => {
    expect(summarizeField(field("email", "EMAIL", { settings: { maxLength: 10 } }))).toEqual([]);
  });

  it("formats ISO days without time-zone drift", () => {
    expect(formatIsoDay("2026-01-01")).toBe("1 Jan 2026");
    expect(formatIsoDay("not a date")).toBe("not a date");
  });
});

describe("choice list editing", () => {
  it("moves and removes rows", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(removeAt(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("splits a pasted list, dropping bullets, numbering and blanks", () => {
    expect(splitChoiceList("- Small\n• Medium\r\n\n2. Large\tXL")).toEqual(["Small", "Medium", "Large", "XL"]);
  });

  it("inserts pasted choices without repeating existing ones", () => {
    expect(insertChoices(["Small", ""], 1, ["medium", "Large", "Small"])).toEqual(["Small", "medium", "Large"]);
    expect(insertChoices(["A", "B"], 1, ["C"], false)).toEqual(["A", "C", "B"]);
  });

  it("flags and merges duplicates ignoring case", () => {
    expect([...duplicateChoiceIndexes(["Yes", "No", " yes ", ""])]).toEqual([2]);
    expect(cleanChoices(["Yes", " No ", "yes", "", "  "])).toEqual(["Yes", "No"]);
  });
});

describe("duplicate labels", () => {
  it("adds (copy), then numbers further copies", () => {
    expect(duplicateLabel("T-shirt size", ["T-shirt size"])).toBe("T-shirt size (copy)");
    expect(duplicateLabel("T-shirt size", ["T-shirt size", "T-shirt size (copy)"])).toBe("T-shirt size (copy 2)");
    expect(duplicateLabel("T-shirt size (copy)", ["T-shirt size", "T-shirt size (copy)"])).toBe("T-shirt size (copy 2)");
  });

  it("stays within the question length limit", () => {
    expect(duplicateLabel("x".repeat(200), []).length).toBeLessThanOrEqual(200);
  });
});

describe("show-only-if rules", () => {
  const dinner = field("dinner", "CHECKBOX");
  const diet = field("diet", "MULTI_SELECT", { options: ["Vegan"], settings: { showIf: { fieldKey: "dinner", values: ["Yes"] } } });

  it("finds rules that point at a later, missing, or non-choice question", () => {
    expect(findLogicProblems([dinner, diet]).size).toBe(0);
    expect(findLogicProblems([diet, dinner]).get(diet.id)).toEqual({ kind: "later", triggerId: dinner.id, triggerLabel: "dinner" });
    expect(findLogicProblems([diet]).get(diet.id)).toEqual({ kind: "missing" });
    const textTrigger = field("dinner", "TEXT");
    expect(findLogicProblems([textTrigger, diet]).get(diet.id)?.kind).toBe("cannotTrigger");
  });

  it("fixes order by moving the question directly below its trigger", () => {
    expect(orderWithFieldBelow(["diet", "a", "dinner", "b"], "diet", "dinner")).toEqual(["a", "dinner", "diet", "b"]);
    expect(orderWithFieldBelow(["a", "b"], "a", "missing")).toEqual(["a", "b"]);
  });

  it("only offers earlier choice or yes/no questions as triggers", () => {
    const text = field("name", "TEXT");
    expect(triggerCandidates([dinner, text, diet], 2).map((item) => item.key)).toEqual(["dinner"]);
    expect(triggerCandidates([dinner, text, diet], 0)).toEqual([]);
  });

  it("warns when an edit removes an answer a later rule depends on", () => {
    const meal = field("meal", "RADIO", { options: ["Fish", "Veg"] });
    const allergy = field("allergy", "TEXT", { settings: { showIf: { fieldKey: "meal", values: ["Fish"] } } });
    expect(affectedDependents([meal, allergy], "meal", "RADIO", ["Fish", "Veg"])).toEqual([]);
    expect(affectedDependents([meal, allergy], "meal", "RADIO", ["Veg"])).toEqual([{ id: allergy.id, label: "allergy", missing: ["Fish"] }]);
    expect(affectedDependents([meal, allergy], "meal", "TEXT", [])[0]?.missing).toEqual(["Fish"]);
  });
});

describe("question drafts", () => {
  it("round-trips a saved question", () => {
    const saved = field("age", "NUMBER", { label: "Age", required: true, settings: { min: 18 } });
    const result = validateDraft(draftFromField(saved));
    expect(result).toEqual({ ok: true, value: { label: "Age", type: "NUMBER", required: true, options: [], helpText: "", placeholder: "", settings: { min: 18 } } });
  });

  it("needs a question and at least one choice", () => {
    const draft = newDraft("RADIO");
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.label).toBe("Write the question.");
      expect(result.errors.options).toBe("Add at least one choice.");
    }
  });

  it("gives friendly, per-input limit errors", () => {
    const draft = { ...newDraft("NUMBER"), label: "Age", limits: { ...newDraft("NUMBER").limits, min: "50", max: "10" } };
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.max).toBe("The minimum can't be more than the maximum.");

    const words = { ...newDraft("TEXT"), label: "Bio", limits: { ...newDraft("TEXT").limits, maxLength: "ten" } };
    const wordsResult = validateDraft(words);
    expect(wordsResult.ok).toBe(false);
    if (!wordsResult.ok) expect(wordsResult.errors.maxLength).toBe("Enter a whole number.");

    const picks = { ...newDraft("MULTI_SELECT"), label: "Pick", options: ["A", "B"], limits: { ...newDraft("MULTI_SELECT").limits, maxSelections: "5" } };
    const picksResult = validateDraft(picks);
    expect(picksResult.ok).toBe(false);
    if (!picksResult.ok) expect(picksResult.errors.maxSelections).toBe("There are only 2 choices.");
  });

  it("requires at least one revealing answer for a rule", () => {
    const draft = { ...newDraft("TEXT"), label: "Diet", showIf: { fieldKey: "dinner", values: [] } };
    const result = validateDraft(draft);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.showIf).toBe("Tick at least one answer that shows this question.");
  });

  it("drops settings the chosen type can't use and cleans choices", () => {
    const draft = { ...newDraft("RADIO"), label: " Size ", options: ["S", "s", " M ", ""], allowOther: true, placeholder: "ignored", limits: { ...newDraft("RADIO").limits, min: "3" } };
    const result = validateDraft(draft);
    expect(result).toEqual({ ok: true, value: { label: "Size", type: "RADIO", required: false, options: ["S", "M"], helpText: "", placeholder: "", settings: { allowOther: true } } });
  });

  it("lists what a type switch would remove", () => {
    const draft = { ...newDraft("MULTI_SELECT"), options: ["A"], allowOther: true, limits: { ...newDraft("MULTI_SELECT").limits, maxSelections: "1" } };
    expect(droppedByTypeChange(draft, "RADIO")).toEqual(["the choice limit"]);
    expect(droppedByTypeChange(draft, "TEXT")).toEqual(["choices", "the “Other” answer", "the choice limit"]);
    expect(droppedByTypeChange(draft, "SELECT")).toEqual(["the choice limit"]);
  });

  it("previews half-finished drafts leniently", () => {
    const draft = { ...newDraft("TEXT"), limits: { ...newDraft("TEXT").limits, maxLength: "abc" } };
    expect(previewFromDraft(draft)).toMatchObject({ label: "Untitled question", settings: {} });
  });
});
