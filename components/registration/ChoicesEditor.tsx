"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowUp, ClipboardPaste, GripVertical, Plus, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { controlClasses } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import { duplicateChoiceIndexes, insertChoices, MAX_CHOICE, MAX_CHOICES, moveItem, removeAt, replaceAt, splitChoiceList } from "./builderModel";

/** One row per choice: rename, reorder, remove, add, or paste a whole list at once. */
export function ChoicesEditor({ choices, onChange, error, disabled }: { choices: string[]; onChange: (next: string[]) => void; error?: string; disabled?: boolean }) {
  const groupId = useId();
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const focusIndex = useRef<number | null>(null);
  const setFocusIndex = (index: number) => {
    focusIndex.current = index;
  };
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const dupes = duplicateChoiceIndexes(choices);
  const full = choices.length >= MAX_CHOICES;

  // Runs after each render: focuses a row added or removed by the last edit.
  useEffect(() => {
    if (focusIndex.current == null) return;
    inputs.current[focusIndex.current]?.focus();
    focusIndex.current = null;
  });

  const add = () => {
    if (full) return;
    onChange([...choices, ""]);
    setFocusIndex(choices.length);
  };

  const addPasted = () => {
    const items = splitChoiceList(pasteText);
    if (items.length === 0) return;
    const kept = choices.filter((choice) => choice.trim());
    onChange(insertChoices(kept, kept.length, items, false));
    setPasteText("");
    setPasteOpen(false);
  };

  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={error ? `${groupId}-error` : undefined}>
      <legend className="mb-1.5 text-label text-ink">Choices</legend>
      <ol className="flex flex-col gap-1.5">
        {choices.map((choice, index) => {
          const name = choice.trim() || `choice ${index + 1}`;
          return (
            <li key={index} className="flex min-w-0 items-center gap-1">
              <GripVertical aria-hidden className="size-4 shrink-0 text-ink-disabled" />
              <input
                ref={(node) => {
                  inputs.current[index] = node;
                }}
                value={choice}
                maxLength={MAX_CHOICE}
                disabled={disabled}
                aria-label={`Choice ${index + 1}`}
                aria-invalid={dupes.has(index) || undefined}
                placeholder={`Choice ${index + 1}`}
                className={cn(controlClasses, "min-w-0 flex-1 py-2")}
                onChange={(event) => onChange(replaceAt(choices, index, event.target.value))}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!/[\r\n\t]/.test(text.trim())) return;
                  event.preventDefault();
                  const items = splitChoiceList(text);
                  onChange(insertChoices(choices, choice.trim() ? index + 1 : index, items, !choice.trim()));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (index === choices.length - 1) add();
                    else inputs.current[index + 1]?.focus();
                  } else if (event.key === "Backspace" && !choice && choices.length > 1) {
                    event.preventDefault();
                    onChange(removeAt(choices, index));
                    setFocusIndex(Math.max(index - 1, 0));
                  }
                }}
              />
              <div className="flex shrink-0 items-center">
                <IconButton label={`Move ${name} up`} size="sm" disabled={disabled || index === 0} onClick={() => onChange(moveItem(choices, index, -1))}>
                  <ArrowUp />
                </IconButton>
                <IconButton label={`Move ${name} down`} size="sm" disabled={disabled || index === choices.length - 1} onClick={() => onChange(moveItem(choices, index, 1))}>
                  <ArrowDown />
                </IconButton>
                <IconButton label={`Remove ${name}`} size="sm" variant="danger" disabled={disabled || choices.length <= 1} onClick={() => onChange(removeAt(choices, index))}>
                  <X />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>

      {dupes.size > 0 ? (
        <p role="status" className="flex items-start gap-1.5 text-caption text-warning-fg">
          <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
          <span>Some choices appear twice. Duplicates are merged when you save.</span>
        </p>
      ) : null}
      {error ? (
        <p id={`${groupId}-error`} className="flex items-start gap-1.5 text-caption text-danger-fg">
          <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" startIcon={<Plus />} onClick={add} disabled={disabled || full}>
          Add choice
        </Button>
        <Button size="sm" variant="quiet" startIcon={<ClipboardPaste />} aria-expanded={pasteOpen} aria-controls={`${groupId}-paste`} onClick={() => setPasteOpen((open) => !open)} disabled={disabled || full}>
          Paste a list
        </Button>
      </div>

      {pasteOpen ? (
        <div id={`${groupId}-paste`} className="flex flex-col gap-2 rounded-xl border border-line bg-subtle p-3">
          <label htmlFor={`${groupId}-paste-input`} className="text-label text-ink">
            Paste choices, one per line
          </label>
          <Textarea id={`${groupId}-paste-input`} rows={4} value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={"Small\nMedium\nLarge"} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="primary" onClick={addPasted} disabled={splitChoiceList(pasteText).length === 0}>
              Add {splitChoiceList(pasteText).length || ""} {splitChoiceList(pasteText).length === 1 ? "choice" : "choices"}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}
