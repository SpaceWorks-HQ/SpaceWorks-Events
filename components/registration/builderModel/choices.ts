export const MAX_CHOICE = 200;
export const MAX_CHOICES = 100;

/* ---------- Choice lists ---------- */

export function moveItem<T>(list: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list];
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

export function replaceAt<T>(list: readonly T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item));
}

/** Splits pasted text into choices: one per line (or tab), bullets and numbering removed. */
export function splitChoiceList(text: string): string[] {
  return text
    .split(/\r?\n|\t/)
    .map((line) => line.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .map((line) => line.slice(0, MAX_CHOICE));
}

export const norm = (value: string) => value.trim().toLocaleLowerCase();

/** Inserts pasted choices at `index` (replacing that row), skipping ones already on the list. */
export function insertChoices(list: readonly string[], index: number, pasted: readonly string[], replace = true): string[] {
  const keep = list.filter((_, i) => !(replace && i === index));
  const seen = new Set(keep.map(norm).filter(Boolean));
  const fresh: string[] = [];
  for (const choice of pasted) {
    if (seen.has(norm(choice))) continue;
    seen.add(norm(choice));
    fresh.push(choice);
  }
  const at = Math.min(Math.max(index, 0), keep.length);
  return [...keep.slice(0, at), ...fresh, ...keep.slice(at)].slice(0, MAX_CHOICES);
}

/** Indexes of rows that repeat an earlier choice (ignoring case and spaces). */
export function duplicateChoiceIndexes(list: readonly string[]): Set<number> {
  const seen = new Set<string>();
  const dupes = new Set<number>();
  list.forEach((choice, index) => {
    const key = norm(choice);
    if (!key) return;
    if (seen.has(key)) dupes.add(index);
    else seen.add(key);
  });
  return dupes;
}

/** Trimmed, non-empty, first-wins unique choices: what actually gets saved. */
export function cleanChoices(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const choice = raw.trim();
    if (!choice || seen.has(norm(choice))) continue;
    seen.add(norm(choice));
    out.push(choice);
  }
  return out;
}
