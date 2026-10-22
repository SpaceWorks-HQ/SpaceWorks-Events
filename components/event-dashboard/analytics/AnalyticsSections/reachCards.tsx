import { percentOf } from "../metrics";
import { Bar, card, ColumnChart, Stats } from "./primitives";

/* ---------- Short link ---------- */

export function ShortLinkCard({ code, series }: { code: string; series: { columns: Array<{ label: string; count: number }>; total: number; lastWeek: number; largest: number } | null }) {
  return (
    <section aria-labelledby="analytics-shortlink-title" className={card}>
      <div>
        <h2 id="analytics-shortlink-title" className="text-h4 text-ink">
          Short link visits
        </h2>
        <p className="text-caption text-ink-muted">
          Opens of /{code}, counted per day. Only a number is kept: no addresses, browsers or names. Link previews in chat apps are not counted.
        </p>
      </div>
      {series ? (
        <>
          <Stats
            items={[
              { label: "All visits", value: String(series.total) },
              { label: "Last 7 days", value: String(series.lastWeek) },
            ]}
          />
          <ColumnChart columns={series.columns} largest={series.largest} caption="Short link visits per day, last 14 days" unit="visits" tone="bg-highlight" />
        </>
      ) : (
        <p className="text-body-ui text-ink-muted">Nobody has opened the short link yet.</p>
      )}
    </section>
  );
}

/* ---------- Registration questions ---------- */

type Question = { label: string; type: string; answered: number; choices: Array<{ label: string; count: number }> | null };

export function QuestionsCard({ questions, going }: { questions: Question[]; going: number }) {
  return (
    <section aria-labelledby="analytics-questions-title" className={card}>
      <div>
        <h2 id="analytics-questions-title" className="text-h4 text-ink">
          Answers to your registration questions
        </h2>
        <p className="text-caption text-ink-muted">From the {going} people going. Choice questions are charted; written answers are only counted here, never shown.</p>
      </div>
      <ul className="grid gap-6 lg:grid-cols-2">
        {questions.map((question, index) => {
          const largest = Math.max(1, ...(question.choices ?? []).map((choice) => choice.count));
          return (
            <li key={index} className="flex flex-col gap-3">
              <span className="flex flex-col">
                <span className="font-semibold text-ink [overflow-wrap:anywhere]">{question.label}</span>
                <span className="text-caption text-ink-muted">
                  {question.answered} of {going} answered
                </span>
              </span>
              {question.choices ? (
                <ul className="flex flex-col gap-2">
                  {question.choices.map((choice) => (
                    <li key={choice.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3">
                      <span className="truncate text-sm text-ink-secondary" title={choice.label}>
                        {choice.label}
                      </span>
                      <Bar share={choice.count / largest} tone="bg-accent-text" />
                      <span className="text-right text-sm tabular-nums text-ink">
                        {choice.count} <span className="text-caption text-ink-muted">· {percentOf(choice.count, question.answered) ?? 0}%</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
