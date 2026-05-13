"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ============================================================
   Types & mock data
   ============================================================ */

type Screen = "landing" | "setup" | "form";

type FieldType = "text" | "email" | "tel" | "textarea" | "dropdown" | "date" | "auto";

type BuilderField = {
  name: string;
  type: FieldType;
  included: boolean;
  order: number;
  /** Inline options for dropdown fields. */
  options?: string[];
  /** True when the field is non-configurable (e.g. Timestamp). */
  systemAuto?: boolean;
};

const INITIAL_FIELDS: BuilderField[] = [
  { name: "Name", type: "text", included: true, order: 0 },
  { name: "Email", type: "email", included: true, order: 1 },
  {
    name: "Department",
    type: "dropdown",
    included: true,
    order: 2,
    options: ["Engineering", "Design", "Operations", "Sales"],
  },
  { name: "Phone", type: "tel", included: true, order: 3 },
  { name: "Notes", type: "textarea", included: false, order: 4 },
  { name: "Timestamp", type: "auto", included: true, order: 5, systemAuto: true },
];

const TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: "text", label: "text input" },
  { value: "email", label: "email" },
  { value: "tel", label: "phone" },
  { value: "textarea", label: "textarea" },
  { value: "dropdown", label: "dropdown" },
  { value: "date", label: "date" },
];

/* ============================================================
   Utilities
   ============================================================ */

function isLikelySheetUrl(url: string): boolean {
  return /^https:\/\/docs\.google\.com\//i.test(url.trim());
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatNow(): { ddmmyyyy: string; stamp: string } {
  const d = new Date();
  const dd = pad2(d.getDate());
  const mm = pad2(d.getMonth() + 1);
  const yyyy = String(d.getFullYear());
  const months = [
    "jan", "feb", "mar", "apr", "may", "jun",
    "jul", "aug", "sep", "oct", "nov", "dec",
  ];
  const hh = pad2(d.getHours());
  const mn = pad2(d.getMinutes());
  const stamp = `${dd} ${months[d.getMonth()]} ${yyyy}, ${hh}:${mn}`;
  return { ddmmyyyy: `${dd} / ${mm} / ${yyyy}`, stamp };
}

/* ============================================================
   Root page
   ============================================================ */

export default function RedesignPage() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("landing");
  const [sheetUrl, setSheetUrl] = useState("");
  const [fields, setFields] = useState<BuilderField[]>(INITIAL_FIELDS);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Progress per screen: landing 0.15, setup 0.66, form 1.0.
  const progress = useMemo(() => {
    if (submitted) return 1;
    if (currentScreen === "landing") return 0.15;
    if (currentScreen === "setup") return 0.66;
    return 1;
  }, [currentScreen, submitted]);

  const activeFields = useMemo(
    () =>
      fields
        .filter((f) => f.included && !f.systemAuto)
        .sort((a, b) => a.order - b.order),
    [fields],
  );

  function handleLaunch(url: string) {
    setSheetUrl(url);
    setCurrentScreen("setup");
  }

  function handleGenerate() {
    setFormValues({});
    setSubmitted(false);
    setCurrentScreen("form");
  }

  function handleNavigate(target: Screen) {
    // Breadcrumb lets the user step backward through the journey.
    setCurrentScreen(target);
    if (target === "landing") {
      setSubmitted(false);
      setFormValues({});
    }
  }

  function handleSubmitted() {
    setSubmitted(true);
  }

  function handleAnother() {
    setFormValues({});
    setSubmitted(false);
  }

  // Derive a friendly sheet title. In the real app this would come
  // from the backend sheet detection.
  const sheetTitle = "Team Directory — 2026";

  return (
    <div className="om-redesign">
      {/* Top progress line spans the full viewport above the phone. */}
      <div className="om-progress" aria-hidden>
        <div
          className="om-progress-fill"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>

      <div className="om-stage">
        {/* Phone column */}
        <div className="om-phone" role="main">
          {currentScreen === "landing" && (
            <LandingScreen
              key="landing"
              initialUrl={sheetUrl}
              onLaunch={handleLaunch}
            />
          )}

          {currentScreen === "setup" && (
            <SetupScreen
              key="setup"
              sheetTitle={sheetTitle}
              fields={fields}
              setFields={setFields}
              onNavigate={handleNavigate}
              onGenerate={handleGenerate}
            />
          )}

          {currentScreen === "form" && !submitted && (
            <FormScreen
              key="form"
              sheetTitle={sheetTitle}
              fields={activeFields}
              values={formValues}
              setValues={setFormValues}
              onNavigate={handleNavigate}
              onSubmitted={handleSubmitted}
            />
          )}

          {currentScreen === "form" && submitted && (
            <SuccessScreen key="success" onAnother={handleAnother} />
          )}
        </div>

        {/* Desktop-only meta column */}
        <MetaColumn screen={currentScreen} submitted={submitted} />
      </div>
    </div>
  );
}

/* ============================================================
   LANDING
   ============================================================ */

function LandingScreen({
  initialUrl,
  onLaunch,
}: {
  initialUrl: string;
  onLaunch: (url: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState("");

  function attempt() {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("paste a google sheet url to continue.");
      return;
    }
    if (!isLikelySheetUrl(trimmed)) {
      setError("that doesn't look like a google sheets url.");
      return;
    }
    setError("");
    onLaunch(trimmed);
  }

  return (
    <section className="om-screen om-landing" aria-label="Landing">
      <div className="om-landing-top">
        <h1 className="om-landing-hero">
          Your Spreadsheet.
          <br />
          Your <em>Form.</em>
        </h1>
        <p className="om-landing-sub">
          // connect a google sheet. collect data. done.
        </p>
      </div>

      <div className="om-landing-bottom">
        <label className="om-url-label" htmlFor="om-url">
          Sheet URL
        </label>
        <div className="om-url-row">
          <input
            id="om-url"
            className="om-url-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            placeholder="https://docs.google.com/spreadsheets/..."
            onChange={(e) => {
              setUrl(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") attempt();
            }}
          />
          <button
            type="button"
            className="om-url-open"
            onClick={attempt}
            disabled={!url.trim()}
          >
            open<span className="om-arrow" aria-hidden>→</span>
          </button>
        </div>
        {error ? (
          <p className="om-url-error" role="alert">
            ✕ {error}
          </p>
        ) : (
          <span className="om-url-error" aria-hidden />
        )}
      </div>

      <div className="om-stamp" aria-hidden>
        v2 · free · no login
      </div>
    </section>
  );
}

/* ============================================================
   SETUP
   ============================================================ */

function SetupScreen({
  sheetTitle,
  fields,
  setFields,
  onNavigate,
  onGenerate,
}: {
  sheetTitle: string;
  fields: BuilderField[];
  setFields: (updater: (prev: BuilderField[]) => BuilderField[]) => void;
  onNavigate: (target: Screen) => void;
  onGenerate: () => void;
}) {
  const includedCount = fields.filter((f) => f.included && !f.systemAuto).length;

  function updateField(name: string, patch: Partial<BuilderField>) {
    setFields((prev) =>
      prev.map((f) => (f.name === name ? { ...f, ...patch } : f)),
    );
  }

  return (
    <section className="om-screen" aria-label="Configure fields">
      <div className="om-setup-header">
        <nav className="om-breadcrumb" aria-label="Progress">
          <button
            className="om-breadcrumb-seg"
            onClick={() => onNavigate("landing")}
          >
            sheet
          </button>
          <span className="om-breadcrumb-arrow">→</span>
          <button className="om-breadcrumb-seg is-active" disabled>
            configure
          </button>
          <span className="om-breadcrumb-arrow">→</span>
          <button className="om-breadcrumb-seg" disabled>
            form
          </button>
        </nav>
        <h2 className="om-screen-title">{sheetTitle}</h2>
        <p className="om-screen-meta">
          {pad2(fields.length)} columns detected · {pad2(includedCount)} selected
        </p>
      </div>

      <div className="om-setup-body">
        <div className="om-field-head" role="row">
          <span>Column name</span>
          <span>Field type</span>
          <span>Include?</span>
        </div>

        {fields.map((field) => {
          const isAuto = !!field.systemAuto;
          return (
            <div
              key={field.name}
              className={`om-field-row ${isAuto ? "is-auto" : ""}`}
              role="row"
            >
              <span className="om-field-name">{field.name}</span>

              {isAuto ? (
                <span className="om-type-text-only">auto</span>
              ) : (
                <div className="om-type-wrap">
                  <select
                    className="om-type-select"
                    value={field.type}
                    onChange={(e) =>
                      updateField(field.name, {
                        type: e.target.value as FieldType,
                      })
                    }
                    aria-label={`Field type for ${field.name}`}
                  >
                    {TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="om-type-caret" aria-hidden>
                    ▾
                  </span>
                </div>
              )}

              <button
                type="button"
                className="om-include"
                disabled={isAuto}
                onClick={() =>
                  updateField(field.name, { included: !field.included })
                }
                aria-label={
                  isAuto
                    ? `${field.name} is auto — always included`
                    : `Toggle include ${field.name}`
                }
                aria-pressed={field.included}
              >
                {isAuto ? (
                  <span className="om-include-dot is-auto">──</span>
                ) : (
                  <span
                    className={`om-include-dot ${field.included ? "" : "is-off"}`}
                  >
                    {field.included ? "●" : "○"}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="om-generate"
        onClick={onGenerate}
        disabled={includedCount === 0}
      >
        Generate Form <span className="om-arrow" aria-hidden>→</span>
      </button>
    </section>
  );
}

/* ============================================================
   FORM (live entry)
   ============================================================ */

function FormScreen({
  sheetTitle,
  fields,
  values,
  setValues,
  onNavigate,
  onSubmitted,
}: {
  sheetTitle: string;
  fields: BuilderField[];
  values: Record<string, string>;
  setValues: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onNavigate: (target: Screen) => void;
  onSubmitted: () => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focused, setFocused] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "done">("idle");

  // Estimate ~10 seconds of entry time per field, minimum 20s.
  const estSeconds = Math.max(20, fields.length * 10);

  function setVal(name: string, value: string) {
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const f of fields) {
      const v = (values[f.name] || "").trim();
      if (!v) {
        next[f.name] = "required field";
      } else if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        next[f.name] = "invalid email";
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitState !== "idle") return;
    if (!validate()) return;
    setSubmitState("submitting");
    // The 800ms submit fill is the loading state — no spinner.
    window.setTimeout(() => {
      setSubmitState("done");
      window.setTimeout(() => onSubmitted(), 250);
    }, 800);
  }

  const { ddmmyyyy: todayStr } = formatNow();

  return (
    <section className="om-screen" aria-label="Live form">
      <div className="om-form-header">
        <nav className="om-breadcrumb" aria-label="Progress">
          <button
            className="om-breadcrumb-seg"
            onClick={() => onNavigate("landing")}
          >
            sheet
          </button>
          <span className="om-breadcrumb-arrow">→</span>
          <button
            className="om-breadcrumb-seg"
            onClick={() => onNavigate("setup")}
          >
            configure
          </button>
          <span className="om-breadcrumb-arrow">→</span>
          <button className="om-breadcrumb-seg is-active" disabled>
            form
          </button>
        </nav>
        <h2 className="om-form-title" style={{ marginTop: 16 }}>
          {sheetTitle}
        </h2>
        <p className="om-form-meta">
          {pad2(fields.length)} fields · est. {estSeconds} sec
        </p>
      </div>

      <form className="om-form-body" onSubmit={handleSubmit} noValidate>
        {fields.map((field) => (
          <FieldRow
            key={field.name}
            field={field}
            value={values[field.name] || ""}
            onChange={(v) => setVal(field.name, v)}
            error={errors[field.name]}
            focused={focused === field.name}
            onFocus={() => setFocused(field.name)}
            onBlur={() => setFocused((prev) => (prev === field.name ? null : prev))}
            todayStr={todayStr}
          />
        ))}
      </form>

      <button
        type="button"
        onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
        className={`om-submit ${submitState === "submitting" ? "is-submitting" : ""} ${submitState === "done" ? "is-done" : ""}`}
        disabled={submitState !== "idle"}
        aria-label="Submit form"
      >
        <span className="om-submit-fill" aria-hidden />
        <span className="om-submit-label">
          {submitState === "done" ? (
            <>
              <span aria-hidden>✓</span> Submitted
            </>
          ) : (
            <>
              Submit <span className="om-arrow" aria-hidden>→</span>
            </>
          )}
        </span>
      </button>
    </section>
  );
}

/* ------------------------------------------------------------
   Individual field rows
   ------------------------------------------------------------ */

function FieldRow({
  field,
  value,
  onChange,
  error,
  focused,
  onFocus,
  onBlur,
  todayStr,
}: {
  field: BuilderField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  todayStr: string;
}) {
  const stateClass = `${focused ? "is-focused" : ""} ${error ? "has-error" : ""}`;

  if (field.type === "textarea") {
    return (
      <div className={`om-field ${stateClass}`}>
        <label className="om-label" htmlFor={`f-${field.name}`}>
          {field.name}
        </label>
        <textarea
          id={`f-${field.name}`}
          className="om-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          rows={3}
          placeholder=""
        />
        {error && <span className="om-error">✕ {error}</span>}
      </div>
    );
  }

  if (field.type === "dropdown") {
    const options = field.options ?? [];
    return (
      <div className={`om-field ${stateClass}`}>
        <span className="om-label" id={`f-${field.name}-label`}>
          {field.name}
        </span>
        <div
          className="om-radio-list"
          role="radiogroup"
          aria-labelledby={`f-${field.name}-label`}
        >
          {options.map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                className={`om-radio-option ${selected ? "is-selected" : ""}`}
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(opt)}
              >
                <span className="om-radio-bullet" aria-hidden>
                  {selected ? "●" : "○"}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
        {error && <span className="om-error">✕ {error}</span>}
      </div>
    );
  }

  if (field.type === "date") {
    return (
      <DateField
        field={field}
        value={value}
        onChange={onChange}
        error={error}
        focused={focused}
        onFocus={onFocus}
        onBlur={onBlur}
        todayStr={todayStr}
      />
    );
  }

  const inputType =
    field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
  const inputMode =
    field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";

  return (
    <div className={`om-field ${stateClass}`}>
      <label className="om-label" htmlFor={`f-${field.name}`}>
        {field.name}
      </label>
      <input
        id={`f-${field.name}`}
        className="om-input"
        type={inputType}
        inputMode={inputMode as React.HTMLAttributes<HTMLInputElement>["inputMode"]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete="off"
      />
      {error && <span className="om-error">✕ {error}</span>}
    </div>
  );
}

function DateField({
  field,
  value,
  onChange,
  error,
  focused,
  onFocus,
  onBlur,
  todayStr,
}: {
  field: BuilderField;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  todayStr: string;
}) {
  // Composite value stored as "DD/MM/YYYY".
  const [dd, mm, yyyy] = value.split("/");
  const ddRef = useRef<HTMLInputElement>(null);
  const mmRef = useRef<HTMLInputElement>(null);
  const yyRef = useRef<HTMLInputElement>(null);

  function commit(next: { dd?: string; mm?: string; yyyy?: string }) {
    const d = next.dd ?? dd ?? "";
    const m = next.mm ?? mm ?? "";
    const y = next.yyyy ?? yyyy ?? "";
    // Only store a value once all three parts have content.
    if (d || m || y) onChange([d, m, y].join("/"));
    else onChange("");
  }

  const stateClass = `${focused ? "is-focused" : ""} ${error ? "has-error" : ""}`;

  return (
    <div className={`om-field ${stateClass}`}>
      <span className="om-label">{field.name}</span>
      <div className="om-date-row" onFocus={onFocus} onBlur={onBlur}>
        <input
          ref={ddRef}
          className="om-date-input"
          placeholder="DD"
          inputMode="numeric"
          maxLength={2}
          value={dd ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            commit({ dd: v });
            if (v.length === 2) mmRef.current?.focus();
          }}
        />
        <span className="om-date-sep">/</span>
        <input
          ref={mmRef}
          className="om-date-input"
          placeholder="MM"
          inputMode="numeric"
          maxLength={2}
          value={mm ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 2);
            commit({ mm: v });
            if (v.length === 2) yyRef.current?.focus();
          }}
        />
        <span className="om-date-sep">/</span>
        <input
          ref={yyRef}
          className="om-date-input is-year"
          placeholder="YYYY"
          inputMode="numeric"
          maxLength={4}
          value={yyyy ?? ""}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(0, 4);
            commit({ yyyy: v });
          }}
        />
      </div>
      <span className="om-date-hint">today is {todayStr}</span>
      {error && <span className="om-error">✕ {error}</span>}
    </div>
  );
}

/* ============================================================
   SUCCESS
   ============================================================ */

function SuccessScreen({ onAnother }: { onAnother: () => void }) {
  const [stamp, setStamp] = useState("");
  useEffect(() => {
    setStamp(`sheet updated · ${formatNow().stamp}`);
  }, []);

  return (
    <section className="om-screen om-success" aria-live="polite">
      <div className="om-success-check" aria-hidden>✓</div>
      <h2 className="om-success-title">entry recorded.</h2>
      <p className="om-success-meta">{stamp}</p>
      <button type="button" className="om-success-link" onClick={onAnother}>
        → submit another
      </button>
    </section>
  );
}

/* ============================================================
   DESKTOP META COLUMN — right-side context, not navigation
   ============================================================ */

function MetaColumn({ screen, submitted }: { screen: Screen; submitted: boolean }) {
  if (screen === "landing") {
    return (
      <aside className="om-meta" aria-label="About">
        <p className="om-meta-kicker">Officemobile · v2</p>
        <h3 className="om-meta-title">
          A quiet <em>editorial</em> take on mobile data entry.
        </h3>
        <hr className="om-meta-rule" />
        <p className="om-meta-body">
          Paste any Google Sheet. Columns become fields. Entries go straight back
          into the sheet. No accounts, no scaffolding, no dashboards to tend.
        </p>
        <ul className="om-meta-list">
          <li>
            <span>01</span>
            <span>Paste a sheet URL.</span>
          </li>
          <li>
            <span>02</span>
            <span>Review detected columns and field types.</span>
          </li>
          <li>
            <span>03</span>
            <span>Share the form and collect entries.</span>
          </li>
        </ul>
        <p className="om-meta-footer">Set in Newsreader & IBM Plex Mono</p>
      </aside>
    );
  }

  if (screen === "setup") {
    return (
      <aside className="om-meta" aria-label="Configure help">
        <p className="om-meta-kicker">Step · 02 of 03</p>
        <h3 className="om-meta-title">Configure fields.</h3>
        <hr className="om-meta-rule" />
        <p className="om-meta-body">
          Each row in your sheet header becomes a form field. Pick the input type
          that fits the data, and mark which columns respondents should see.
        </p>
        <ul className="om-meta-list">
          <li>
            <span>●</span>
            <span>Included in the form.</span>
          </li>
          <li>
            <span>○</span>
            <span>Hidden from respondents.</span>
          </li>
          <li>
            <span>──</span>
            <span>Auto — filled by the system (timestamp, row id).</span>
          </li>
        </ul>
        <p className="om-meta-footer">Tap names to reorder · coming soon</p>
      </aside>
    );
  }

  // form / success
  return (
    <aside className="om-meta" aria-label="Form help">
      <p className="om-meta-kicker">{submitted ? "Entry · recorded" : "Step · 03 of 03"}</p>
      <h3 className="om-meta-title">
        {submitted ? (
          <>Thanks for the <em>entry</em>.</>
        ) : (
          <>Fill out the <em>form</em>.</>
        )}
      </h3>
      <hr className="om-meta-rule" />
      <p className="om-meta-body">
        {submitted
          ? "Your row has been appended to the connected sheet. Submit another to keep going, or close the tab — no confirmation email, no follow-up."
          : "Every field is required unless marked otherwise. Tap a label to focus the input. The submit band at the bottom fills left-to-right while your entry is saved."}
      </p>
      <p className="om-meta-footer">Mobile-first · 390px column</p>
    </aside>
  );
}
