"use client";

import { useMemo, useState } from "react";
import type { FieldSchema, FieldType } from "@/types/field";
import ClearButton from "@/components/ClearButton";
import SubmitButton from "@/components/SubmitButton";
import MobileDropdown from "@/components/MobileDropdown";
import FormDesignPicker from "@/components/FormDesignPicker";
import RichTextEditor from "@/components/RichTextEditor";

export type DraftField = {
  id: string;
  name: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export interface FormBuilderSubmitPayload {
  formTitle: string;
  description?: string;
  worksheetName: string;
  destination: "new" | "existing";
  existingSheetUrl?: string;
  fields: FieldSchema[];
  uiConfig?: Record<string, any>;
}

interface Props {
  submitting: boolean;
  onSubmit: (payload: FormBuilderSubmitPayload) => Promise<void> | void;
}

export const FIELD_TYPES: Array<{ value: FieldType; label: string; icon: string }> = [
  { value: "text", label: "Text", icon: "📝" },
  { value: "select", label: "Dropdown", icon: "▾" },
  { value: "number", label: "Number", icon: "🔢" },
  { value: "date", label: "Date", icon: "📅" },
  { value: "time", label: "Time", icon: "⏰" },
  { value: "tel", label: "Phone", icon: "📞" },
  { value: "email", label: "Email", icon: "✉️" },
  { value: "textarea", label: "Long Text", icon: "📄" },
  { value: "checkbox", label: "Checkbox", icon: "☑️" },
  { value: "file", label: "File / Photo", icon: "📎" },
  { value: "url", label: "URL", icon: "🌐" },
];

export const DEFAULT_JOB_DESCRIPTION = `<h3>💼 Role Overview</h3>
<p>We are seeking talented, high-energy professionals to join our growing team. Review the position details below and submit your application with an updated resume.</p>

<h3>🎯 Key Responsibilities</h3>
<ul>
  <li>Take end-to-end ownership of project tasks, deliverables, and timelines.</li>
  <li>Collaborate cross-functionally to design, build, and optimize business solutions.</li>
  <li>Identify bottlenecks, automate repetitive tasks, and improve overall workflows.</li>
  <li>Communicate progress proactively and participate actively in sprint and team reviews.</li>
</ul>

<h3>✨ Candidate Requirements & Skills</h3>
<ul>
  <li>Relevant degree or equivalent practical hands-on experience in the field.</li>
  <li>Strong analytical mindset, problem-solving abilities, and attention to detail.</li>
  <li>Excellent written and verbal communication skills.</li>
  <li>Proficiency with modern tools, frameworks, and industry best practices.</li>
</ul>

<h3>🎁 Compensation & Benefits</h3>
<ul>
  <li>Competitive CTC package commensurate with skills and experience.</li>
  <li>Fast-track career advancement and mentorship opportunities.</li>
  <li>Flexible work environment with modern high-performance culture.</li>
</ul>`;

export interface FormTemplate {
  id: string;
  icon: string;
  name: string;
  description: string;
  worksheetName: string;
  jd?: string;
  fields: Array<{
    name: string;
    type: FieldType;
    required?: boolean;
    options?: string[];
    placeholder?: string;
  }>;
}

export const FORM_TEMPLATES: FormTemplate[] = [
  {
    id: "job-application",
    icon: "💼",
    name: "Job Application & Hiring",
    description: "Screen candidates, collect resumes & screening details",
    worksheetName: "Applicants",
    jd: DEFAULT_JOB_DESCRIPTION,
    fields: [
      { name: "Full Name", type: "text", required: true, placeholder: "e.g. Rahul Sharma" },
      { name: "Mobile / WhatsApp Number", type: "tel", required: true, placeholder: "+91 98765 43210" },
      { name: "Email Address", type: "email", required: true, placeholder: "rahul@example.com" },
      {
        name: "Role / Position Applying For",
        type: "select",
        required: true,
        options: [
          "Software Engineer / Developer",
          "Frontend / UI Developer",
          "Backend / API Engineer",
          "Full Stack Developer",
          "Product Designer / UI-UX",
          "Product Manager",
          "Sales & Business Development",
          "Digital Marketing Specialist",
          "Operations / HR Associate",
          "Customer Support / Success",
          "Intern / Trainee",
        ],
      },
      {
        name: "Total Experience",
        type: "select",
        required: true,
        options: [
          "Fresher / 0-1 Year",
          "1-3 Years",
          "3-5 Years",
          "5-8 Years",
          "8+ Years (Lead / Senior)",
        ],
      },
      { name: "Current CTC / Salary ₹", type: "text", placeholder: "e.g. ₹6,00,000 (or NA for fresher)" },
      { name: "Expected CTC / Salary ₹", type: "text", required: true, placeholder: "e.g. ₹8,50,000" },
      {
        name: "Notice Period",
        type: "select",
        required: true,
        options: [
          "Immediate Joiner",
          "15 Days or less",
          "30 Days (1 Month)",
          "45 Days",
          "60 Days (2 Months)",
          "90 Days (3 Months)",
        ],
      },
      { name: "Current City / Location", type: "text", required: true, placeholder: "e.g. Mumbai, Bengaluru, Delhi NCR" },
      {
        name: "Work Preference",
        type: "select",
        options: [
          "Work from Office",
          "Remote / Work from Home",
          "Hybrid",
          "Flexible",
        ],
      },
      { name: "Resume / CV Upload", type: "file", required: true, placeholder: "Upload PDF or Word document" },
      { name: "LinkedIn / Portfolio URL", type: "url", placeholder: "https://linkedin.com/in/username" },
      { name: "Why are you a good fit?", type: "textarea", placeholder: "Briefly highlight your achievements and why you want to join..." },
    ],
  },
  {
    id: "attendance",
    icon: "📋",
    name: "Attendance Register",
    description: "Daily staff or student presence tracking",
    worksheetName: "Attendance",
    fields: [
      { name: "Full Name", type: "text", required: true, placeholder: "e.g. John Doe" },
      { name: "Roll / Employee ID", type: "text", required: true, placeholder: "e.g. EMP-104" },
      { name: "Date", type: "date", required: true },
      { name: "Shift / Batch", type: "select", options: ["Morning Shift", "Afternoon Shift", "Evening Shift", "General"] },
      { name: "Status", type: "select", required: true, options: ["Present", "Absent", "Late", "Half Day", "On Leave"] },
      { name: "Remarks / Reason", type: "text", placeholder: "Optional notes" },
    ],
  },
  {
    id: "expenses",
    icon: "💰",
    name: "Expense & Bill Tracker",
    description: "Log daily expenses, bills, and receipts",
    worksheetName: "Expenses",
    fields: [
      { name: "Expense Date", type: "date", required: true },
      { name: "Item / Purpose", type: "text", required: true, placeholder: "e.g. Client lunch, Uber, Stationary" },
      { name: "Category", type: "select", required: true, options: ["Travel & Fuel", "Meals & Food", "Office Supplies", "Software & Tools", "Utilities & Bills", "Client Entertainment", "Other"] },
      { name: "Amount ₹", type: "number", required: true, placeholder: "0.00" },
      { name: "Payment Mode", type: "select", options: ["UPI / GPay / PhonePe", "Cash", "Credit Card", "Debit Card", "Net Banking", "Company Card"] },
      { name: "Bill / Receipt Photo", type: "file", placeholder: "Upload receipt" },
      { name: "Notes", type: "text" },
    ],
  },
  {
    id: "leads",
    icon: "🎯",
    name: "Sales & Lead CRM",
    description: "Capture new inquiries and track status",
    worksheetName: "Leads",
    fields: [
      { name: "Client / Customer Name", type: "text", required: true, placeholder: "e.g. Sharma Enterprises" },
      { name: "Phone Number", type: "tel", required: true, placeholder: "+91 98765 43210" },
      { name: "Email Address", type: "email", placeholder: "name@company.com" },
      { name: "Requirement / Interest", type: "text", placeholder: "Product or service details" },
      { name: "Estimated Budget ₹", type: "number", placeholder: "50000" },
      { name: "Lead Priority", type: "select", options: ["🔥 High / Hot", "⚡ Medium / Warm", "❄️ Low / Cold"] },
      { name: "Stage", type: "select", required: true, options: ["New Inquiry", "Contacted", "Proposal Sent", "Negotiation", "Converted (Won)", "Lost"] },
      { name: "Next Follow-up Date", type: "date" },
    ],
  },
  {
    id: "inventory",
    icon: "📦",
    name: "Inventory & Stock Log",
    description: "Stock in/out, quantities, and items",
    worksheetName: "Inventory",
    fields: [
      { name: "Item SKU / Code", type: "text", required: true, placeholder: "e.g. SKU-4029" },
      { name: "Item Name", type: "text", required: true, placeholder: "e.g. Wireless Mouse" },
      { name: "Transaction Type", type: "select", required: true, options: ["Stock In (Received)", "Stock Out (Dispatched)", "Return", "Damaged / Disposed"] },
      { name: "Quantity", type: "number", required: true, placeholder: "10" },
      { name: "Unit", type: "select", options: ["Pcs", "Kg", "Box", "Pack", "Litre", "Meter"] },
      { name: "Unit Price ₹", type: "number", placeholder: "Unit cost" },
      { name: "Supplier / Recipient", type: "text", placeholder: "Vendor or department name" },
    ],
  },
  {
    id: "feedback",
    icon: "⭐",
    name: "Customer Feedback",
    description: "Ratings, reviews, and client satisfaction",
    worksheetName: "Feedback",
    fields: [
      { name: "Customer Name", type: "text", required: true, placeholder: "John Doe" },
      { name: "Contact Phone", type: "tel", placeholder: "Phone number" },
      { name: "Overall Experience", type: "select", required: true, options: ["⭐⭐⭐⭐⭐ Excellent", "⭐⭐⭐⭐ Very Good", "⭐⭐⭐ Good / Average", "⭐⭐ Needs Improvement", "⭐ Poor"] },
      { name: "Service Quality", type: "select", options: ["Highly Satisfied", "Satisfied", "Neutral", "Unsatisfied"] },
      { name: "Would you recommend us?", type: "select", options: ["Yes, Definitely!", "Maybe", "No"] },
      { name: "Detailed Feedback / Suggestions", type: "textarea", placeholder: "Tell us what you liked or how we can improve..." },
    ],
  },
  {
    id: "visitor",
    icon: "🪪",
    name: "Visitor / Gate Pass",
    description: "Office visitor log, entry time, and photo",
    worksheetName: "Visitors",
    fields: [
      { name: "Visitor Name", type: "text", required: true, placeholder: "Full Name" },
      { name: "Phone Number", type: "tel", required: true, placeholder: "Mobile Number" },
      { name: "Person to Meet", type: "text", required: true, placeholder: "Host Name / Employee" },
      { name: "Department", type: "select", options: ["Administration", "Human Resources", "Sales & Marketing", "Finance & Accounts", "Engineering / IT", "Management"] },
      { name: "Purpose of Visit", type: "select", options: ["Business Meeting", "Job Interview", "Delivery / Vendor", "Personal Visit", "Maintenance"] },
      { name: "Entry Date & Time", type: "date", required: true },
      { name: "Visitor Photo / ID Proof", type: "file" },
    ],
  },
];

const THEME_OPTIONS = [
  { value: "light", label: "Light Theme" },
  { value: "dark", label: "Dark Theme" },
  { value: "system", label: "System Default" },
];

const FONT_OPTIONS = [
  { value: "system", label: "System Default" },
  { value: "inter", label: "Inter (Modern)" },
  { value: "newsreader", label: "Newsreader (Editorial)" },
  { value: "plex-mono", label: "IBM Plex Mono" },
];

const LAYOUT_OPTIONS = [
  { value: "standard", label: "Standard List" },
  { value: "grid", label: "Grid Layout" },
];

function createDraftField(): DraftField {
  return {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    name: "",
    type: "text",
    required: false,
    placeholder: "",
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBulkColumnsText(rawText: string): DraftField[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = lines.length === 1 && lines[0].includes(",")
    ? lines[0].split(",").map((s) => s.trim()).filter(Boolean)
    : lines;

  return items.map((item) => {
    let name = item;
    let type: FieldType = "text";
    let options: string[] | undefined = undefined;

    const matchParens = item.match(/^(.*?)\s*[\(\[](.*?)[\)\]]$/);
    if (matchParens) {
      name = matchParens[1].trim();
      const optsString = matchParens[2].trim();
      const explicitType = FIELD_TYPES.find((t) => t.label.toLowerCase() === optsString.toLowerCase() || t.value === optsString.toLowerCase());
      if (explicitType) {
        type = explicitType.value;
      } else if (optsString.includes(",") || optsString.includes("/") || optsString.includes("|")) {
        type = "select";
        options = optsString.split(/[,/|]/).map((s) => s.trim()).filter(Boolean);
      }
    }

    if (type === "text") {
      const lower = name.toLowerCase();
      if (/phone|mobile|contact|tel|whatsapp/.test(lower)) type = "tel";
      else if (/email|mail/.test(lower)) type = "email";
      else if (/date|dob|birth|joining|deadline|schedule/.test(lower)) type = "date";
      else if (/time|slot|hour/.test(lower)) type = "time";
      else if (/price|amount|rate|cost|fee|qty|quantity|count|budget|total|salary|ctc|score|percentage|percent/.test(lower)) type = "number";
      else if (/resume|cv|photo|image|picture|file|receipt|bill|doc|document|attachment|pdf|proof/.test(lower)) type = "file";
      else if (/done|checked|verified|active|enabled|yes\/no|agree/.test(lower)) type = "checkbox";
      else if (/address|comment|remark|description|note|message|reason|feedback|fit|about/.test(lower)) type = "textarea";
      else if (/url|link|website|portfolio|linkedin|github/.test(lower)) type = "url";
      else if (/status|gender|category|mode|type|priority|shift|department|state|role|position|experience|notice|work\s*preference/.test(lower)) {
        type = "select";
      }
    }

    return {
      id: Math.random().toString(36).slice(2),
      name,
      type,
      required: false,
      placeholder: `Enter ${name.toLowerCase()}`,
      options,
    };
  });
}

export default function FormBuilder({ submitting, onSubmit }: Props) {
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");

  // Destination: New Sheet or Add to Existing
  const [destination, setDestination] = useState<"new" | "existing">("new");
  const [existingSheetUrl, setExistingSheetUrl] = useState("");

  const [formTitle, setFormTitle] = useState("Untitled Form");
  const [worksheetName, setWorksheetName] = useState("Sheet1");
  const [formDescription, setFormDescription] = useState("");
  const [showJdSection, setShowJdSection] = useState(false);
  const [previewJdExpanded, setPreviewJdExpanded] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showTemplatesGrid, setShowTemplatesGrid] = useState<boolean>(false);
  const [fields, setFields] = useState<DraftField[]>([createDraftField()]);
  const [error, setError] = useState<string | null>(null);

  // Bulk paste drawer/modal
  const [showBulkPasteModal, setShowBulkPasteModal] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState("");

  // Quick option adding state per field id
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({});

  // Form UI/UX Config
  const [formTheme, setFormTheme] = useState("system");
  const [formFont, setFormFont] = useState("system");
  const [formLayout, setFormLayout] = useState("standard");
  const [formDesign, setFormDesign] = useState("minimal");
  const [showConfig, setShowConfig] = useState(false);

  const canSubmit = useMemo(
    () => fields.some((field) => field.name.trim().length > 0) && formTitle.trim().length > 0,
    [fields, formTitle],
  );

  function updateField(id: string, next: Partial<DraftField>) {
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...next } : field)));
  }

  function removeField(id: string) {
    setFields((prev) => (prev.length > 1 ? prev.filter((field) => field.id !== id) : prev));
  }

  function duplicateField(id: string) {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.id === id);
      if (idx < 0) return prev;
      const target = prev[idx];
      const dup: DraftField = {
        ...target,
        id: Math.random().toString(36).slice(2),
        name: `${target.name} (Copy)`,
        options: target.options ? [...target.options] : undefined,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, dup);
      return next;
    });
  }

  function moveField(id: string, direction: -1 | 1) {
    setFields((prev) => {
      const index = prev.findIndex((field) => field.id === id);
      if (index < 0) return prev;
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  }

  function loadTemplate(tpl: FormTemplate) {
    setSelectedTemplateId(tpl.id);
    setFormTitle(tpl.name);
    setWorksheetName(tpl.worksheetName);
    if (tpl.jd) {
      setFormDescription(tpl.jd);
      setShowJdSection(true);
    } else {
      setFormDescription("");
      setShowJdSection(false);
    }
    setFields(
      tpl.fields.map((f) => ({
        id: Math.random().toString(36).slice(2),
        name: f.name,
        type: f.type,
        required: f.required ?? false,
        placeholder: f.placeholder || `Enter ${f.name.toLowerCase()}`,
        options: f.options ? [...f.options] : undefined,
      }))
    );
    setError(null);
  }

  function handleApplyBulkPaste(mode: "replace" | "append") {
    if (!bulkPasteText.trim()) return;
    const parsed = parseBulkColumnsText(bulkPasteText);
    if (!parsed.length) return;

    if (mode === "replace") {
      setFields(parsed);
    } else {
      setFields((prev) => [...prev.filter((f) => f.name.trim().length > 0), ...parsed]);
    }
    setBulkPasteText("");
    setShowBulkPasteModal(false);
  }

  function addOptionToField(fieldId: string) {
    const raw = (newOptionInputs[fieldId] || "").trim();
    if (!raw) return;
    const target = fields.find((f) => f.id === fieldId);
    if (!target) return;
    const current = target.options || [];
    if (!current.includes(raw)) {
      updateField(fieldId, { options: [...current, raw] });
    }
    setNewOptionInputs((prev) => ({ ...prev, [fieldId]: "" }));
  }

  function removeOptionFromField(fieldId: string, optToRemove: string) {
    const target = fields.find((f) => f.id === fieldId);
    if (!target) return;
    updateField(fieldId, {
      options: (target.options || []).filter((opt) => opt !== optToRemove),
    });
  }

  async function handleSubmit() {
    const trimmedTitle = formTitle.trim();
    const trimmedWorksheet = worksheetName.trim() || "Sheet1";
    const usableFields = fields
      .map((field) => ({ ...field, name: field.name.trim() }))
      .filter((field) => field.name.length > 0);

    if (!trimmedTitle) {
      setError("Enter a form title.");
      return;
    }
    if (!usableFields.length) {
      setError("Add at least one field name.");
      return;
    }
    if (destination === "existing" && !existingSheetUrl.trim()) {
      setError("Enter your existing Google Sheet URL or ID.");
      return;
    }

    const normalizedFields: FieldSchema[] = usableFields.map((field, index) => {
      const header = field.name;
      const baseKey = slugify(header) || `field-${index + 1}`;
      return {
        key: `${baseKey}-${index + 1}`,
        source_header: header,
        label: header,
        type: field.type,
        options: field.options,
        required: field.required ?? false,
        order: index,
        column_index: index,
        placeholder: field.placeholder?.trim() || `Enter ${header.toLowerCase()}`,
      };
    });

    const uiConfig = {
      design: formDesign,
      theme: formTheme,
      font_family: formFont,
      layout: formLayout,
    };

    setError(null);
    try {
      await onSubmit({
        formTitle: trimmedTitle,
        description: formDescription.trim() || undefined,
        worksheetName: trimmedWorksheet,
        destination,
        existingSheetUrl: destination === "existing" ? existingSheetUrl.trim() : undefined,
        fields: normalizedFields,
        uiConfig,
      });
    } catch (err: any) {
      setError(err?.message || "Failed to create form. Please try again.");
    }
  }

  return (
    <div className="space-y-6 animate-in pb-12 max-w-4xl mx-auto">
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 rounded-2xl bg-zinc-950 text-white shadow-xl border border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-emerald-400 font-semibold">
              Form Builder Studio
            </span>
          </div>
          <h2 className="text-[18px] sm:text-[20px] font-bold text-white tracking-tight mt-0.5">
            Create & Deploy Form
          </h2>
          <p className="text-[11px] sm:text-[12px] text-zinc-400 mt-0.5">
            Turn blank or existing Google Sheets into fast, mobile-friendly forms.
          </p>
        </div>

        {/* View Switcher: Editor vs Live Mobile Preview */}
        <div className="inline-flex items-center p-1 rounded-xl bg-zinc-900 border border-zinc-800 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "editor"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>✏️</span>
            <span>Editor</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === "preview"
                ? "bg-white text-zinc-950 shadow-sm"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <span>📱</span>
            <span>Live Preview ({fields.filter((f) => f.name.trim()).length})</span>
          </button>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────────
          EDITOR TAB
         ─────────────────────────────────────────────────────────────── */}
      {activeTab === "editor" && (
        <div className="space-y-6">
          {/* Quick Starters & Templates (Collapsible) */}
          <div
            className="rounded-2xl p-4 shadow-xs space-y-3 transition-all"
            style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">⚡</span>
                <span
                  className="text-[12px] font-bold uppercase tracking-wide"
                  style={{ color: "var(--ink)" }}
                >
                  Ready-Made Templates
                </span>
                <span
                  className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    color: "var(--stone)",
                    background: "var(--cream)",
                    border: "1px solid var(--rule)",
                  }}
                >
                  {FORM_TEMPLATES.length}
                </span>
                {selectedTemplateId && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      color: "var(--clay)",
                      background: "rgba(224, 122, 80, 0.12)",
                      border: "1px solid var(--clay)",
                    }}
                  >
                    Active: {FORM_TEMPLATES.find((t) => t.id === selectedTemplateId)?.name}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkPasteModal(true)}
                  className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  style={{
                    color: "var(--ink)",
                    background: "var(--cream)",
                    border: "1px solid var(--rule)",
                  }}
                >
                  <span>📋</span>
                  <span>Bulk Headers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTemplatesGrid(!showTemplatesGrid)}
                  className="text-[11px] font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  style={{
                    color: "var(--ink)",
                    background: "var(--cream)",
                    border: "1px solid var(--rule)",
                  }}
                >
                  <span>{showTemplatesGrid ? "▲ Compact View" : "▼ Show All Cards"}</span>
                </button>
              </div>
            </div>

            {/* When Collapsed: Super compact 1-line horizontal scrollable chip bar */}
            {!showTemplatesGrid ? (
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-thin">
                {FORM_TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => loadTemplate(tpl)}
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border active:scale-95 cursor-pointer"
                      style={
                        isSelected
                          ? {
                              background: "var(--ink)",
                              color: "var(--cream)",
                              borderColor: "var(--ink)",
                            }
                          : {
                              background: "var(--cream)",
                              color: "var(--ink)",
                              borderColor: "var(--rule)",
                            }
                      }
                    >
                      <span>{tpl.icon}</span>
                      <span>{tpl.name}</span>
                      <span
                        className="text-[10px] ml-0.5 font-normal"
                        style={{
                          color: isSelected ? "var(--cream)" : "var(--stone)",
                          opacity: 0.8,
                        }}
                      >
                        ({tpl.fields.length})
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              /* When Expanded: Full template card grid */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1 animate-in fade-in">
                {FORM_TEMPLATES.map((tpl) => {
                  const isSelected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        loadTemplate(tpl);
                        setShowTemplatesGrid(false);
                      }}
                      className="p-3 text-left rounded-xl border transition-all active:scale-[0.98] group flex items-start gap-3 cursor-pointer"
                      style={
                        isSelected
                          ? {
                              background: "rgba(224, 122, 80, 0.12)",
                              borderColor: "var(--clay)",
                              boxShadow: "0 0 0 1px var(--clay)",
                            }
                          : {
                              background: "var(--cream)",
                              borderColor: "var(--rule)",
                            }
                      }
                    >
                      <div
                        className="text-2xl p-1.5 rounded-lg border shrink-0"
                        style={{
                          background: "var(--paper)",
                          borderColor: "var(--rule)",
                        }}
                      >
                        {tpl.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className="text-[12px] font-bold truncate transition-colors"
                            style={{ color: isSelected ? "var(--clay)" : "var(--ink)" }}
                          >
                            {tpl.name}
                          </p>
                          <span
                            className="text-[10px] font-mono shrink-0"
                            style={{ color: "var(--stone)" }}
                          >
                            {tpl.fields.length}f
                          </span>
                        </div>
                        <p
                          className="text-[11px] mt-0.5 line-clamp-1"
                          style={{ color: "var(--stone)" }}
                        >
                          {tpl.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Destination Selector: New Sheet vs Existing Sheet */}
          <div
            className="rounded-2xl p-5 shadow-xs space-y-4"
            style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
          >
            <label
              className="block text-[11px] font-bold uppercase tracking-wider"
              style={{ color: "var(--stone)" }}
            >
              Where will the data be stored?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDestination("new")}
                className="p-3.5 text-left rounded-xl border transition-all cursor-pointer"
                style={
                  destination === "new"
                    ? {
                        borderColor: "var(--clay)",
                        background: "rgba(224, 122, 80, 0.10)",
                        boxShadow: "0 0 0 1px var(--clay)",
                      }
                    : {
                        borderColor: "var(--rule)",
                        background: "var(--cream)",
                      }
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <span className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>
                    Create New Google Sheet
                  </span>
                </div>
                <p className="text-[11px] mt-1 pl-7" style={{ color: "var(--stone)" }}>
                  We&apos;ll automatically generate a brand new Google Spreadsheet linked to this form.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDestination("existing")}
                className="p-3.5 text-left rounded-xl border transition-all cursor-pointer"
                style={
                  destination === "existing"
                    ? {
                        borderColor: "var(--clay)",
                        background: "rgba(224, 122, 80, 0.10)",
                        boxShadow: "0 0 0 1px var(--clay)",
                      }
                    : {
                        borderColor: "var(--rule)",
                        background: "var(--cream)",
                      }
                }
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔗</span>
                  <span className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>
                    Add Tab to Existing Sheet
                  </span>
                </div>
                <p className="text-[11px] mt-1 pl-7" style={{ color: "var(--stone)" }}>
                  Paste your existing Google Sheet link and we&apos;ll insert a fresh tab for this form.
                </p>
              </button>
            </div>

            {destination === "existing" && (
              <div className="pt-2 animate-in fade-in">
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5"
                  style={{ color: "var(--stone)" }}
                >
                  Existing Google Sheet URL or ID <span style={{ color: "var(--error)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={existingSheetUrl}
                  onChange={(e) => setExistingSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full rounded-xl px-3.5 py-2.5 text-[14px] focus:outline-none"
                  style={{
                    background: "var(--cream)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink)",
                  }}
                />
              </div>
            )}
          </div>

          {/* Form Title & Subsheet Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div
              className="rounded-2xl p-4 shadow-xs"
              style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
            >
              <label
                className="block text-[11px] font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--stone)" }}
              >
                Form Title
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-[15px] font-semibold transition-all focus:outline-none"
                  style={{
                    background: "var(--cream)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink)",
                  }}
                  placeholder="e.g. Daily Attendance"
                />
                {formTitle && <ClearButton onClick={() => setFormTitle("")} right={12} ariaLabel="Clear title" />}
              </div>
            </div>

            <div
              className="rounded-2xl p-4 shadow-xs"
              style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
            >
              <label
                className="block text-[11px] font-bold uppercase tracking-wider mb-1"
                style={{ color: "var(--stone)" }}
              >
                Subsheet (Tab) Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={worksheetName}
                  onChange={(e) => setWorksheetName(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-2.5 pr-10 text-[15px] font-semibold transition-all focus:outline-none"
                  style={{
                    background: "var(--cream)",
                    border: "1px solid var(--rule)",
                    color: "var(--ink)",
                  }}
                  placeholder="e.g. Sheet1"
                />
                {worksheetName !== "Sheet1" && worksheetName !== "" && (
                  <ClearButton onClick={() => setWorksheetName("Sheet1")} right={12} ariaLabel="Reset subsheet name" />
                )}
              </div>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              Job Description (JD) / Role Overview Section (Collapsible)
             ───────────────────────────────────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden shadow-xs transition-all"
            style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
          >
            <button
              type="button"
              onClick={() => setShowJdSection(!showJdSection)}
              className="w-full flex items-center justify-between p-4 transition-colors cursor-pointer"
              style={{ background: "var(--cream)" }}
            >
              <div className="flex items-center gap-2.5 text-left">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs"
                  style={{ background: "var(--clay)", color: "var(--on-clay)" }}
                >
                  💼
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[13px] font-bold"
                      style={{ color: "var(--ink)" }}
                    >
                      Job Description (JD) & Role Details
                    </span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        color: "var(--clay)",
                        background: "rgba(224, 122, 80, 0.12)",
                        border: "1px solid var(--clay)",
                      }}
                    >
                      Collapsible on Form
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--stone)" }}>
                    {formDescription.trim()
                      ? `${formDescription.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 65)}...`
                      : "Add role details, responsibilities & perks (candidates can expand/collapse on mobile)"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {formDescription.trim() && (
                  <span
                    className="text-[10px] font-mono font-medium hidden sm:inline"
                    style={{ color: "var(--stone)" }}
                  >
                    {formDescription.length} chars
                  </span>
                )}
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${showJdSection ? "rotate-180" : ""}`}
                  style={{ color: "var(--stone)" }}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showJdSection && (
              <div
                className="p-4 pt-3 space-y-3 animate-in fade-in"
                style={{
                  background: "var(--paper)",
                  borderTop: "1px solid var(--rule)",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    className="text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--stone)" }}
                  >
                    JD Content (Overview, Requirements & Perks)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormDescription(DEFAULT_JOB_DESCRIPTION)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      style={{
                        color: "var(--clay)",
                        background: "rgba(224, 122, 80, 0.12)",
                        border: "1px solid var(--clay)",
                      }}
                    >
                      <span>✨</span>
                      <span>Insert Sample JD</span>
                    </button>
                    {formDescription && (
                      <button
                        type="button"
                        onClick={() => setFormDescription("")}
                        className="px-2 py-1 text-[11px] font-medium rounded-lg transition-colors cursor-pointer"
                        style={{ color: "var(--stone)" }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <RichTextEditor
                  value={formDescription}
                  onChange={setFormDescription}
                  placeholder="Enter Job Description, Key Responsibilities, Requirements, CTC, Location & Benefits..."
                  maxLength={10000}
                />

                <p className="text-[11px] flex items-center gap-1 pt-1" style={{ color: "var(--stone)" }}>
                  <span>💡</span>
                  <span>
                    This JD will appear at the top of the form with a smooth <strong>[View Full JD ▾]</strong> accordion toggle, keeping the form fast and clean on mobile.
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* UI/UX Appearance Drawer */}
          <div
            className="rounded-2xl overflow-hidden shadow-xs"
            style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
          >
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="w-full flex items-center justify-between p-4 transition-colors cursor-pointer"
              style={{ background: "var(--cream)" }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-xs"
                  style={{ background: "var(--ink)", color: "var(--cream)" }}
                >
                  🎨
                </span>
                <span className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>
                  Theme, Fonts & Layout Configuration
                </span>
              </div>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${showConfig ? "rotate-180" : ""}`}
                style={{ color: "var(--stone)" }}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showConfig && (
              <div
                className="p-4 pt-3 space-y-4 animate-in fade-in"
                style={{ background: "var(--paper)", borderTop: "1px solid var(--rule)" }}
              >
                <FormDesignPicker value={formDesign} onChange={setFormDesign} />
                <hr style={{ borderColor: "var(--rule)" }} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: "var(--stone)" }}
                    >
                      Theme
                    </label>
                    <MobileDropdown size="sm" value={formTheme} options={THEME_OPTIONS} onChange={setFormTheme} />
                  </div>
                  <div>
                    <label
                      className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: "var(--stone)" }}
                    >
                      Font
                    </label>
                    <MobileDropdown size="sm" value={formFont} options={FONT_OPTIONS} onChange={setFormFont} />
                  </div>
                  <div>
                    <label
                      className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: "var(--stone)" }}
                    >
                      Layout
                    </label>
                    <MobileDropdown size="sm" value={formLayout} options={LAYOUT_OPTIONS} onChange={setFormLayout} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Fields List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <div>
                <h3 className="text-[14px] font-bold" style={{ color: "var(--ink)" }}>
                  Form Fields ({fields.length})
                </h3>
                <p className="text-[11px]" style={{ color: "var(--stone)" }}>
                  These will become the column headers in your Google Sheet.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkPasteModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition-all cursor-pointer"
                  style={{
                    color: "var(--ink)",
                    background: "var(--cream)",
                    border: "1px solid var(--rule)",
                  }}
                >
                  <span>📋</span>
                  <span>Bulk Paste</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFields((prev) => [...prev, createDraftField()])}
                  className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12px] font-semibold transition-all active:scale-[0.98] cursor-pointer"
                  style={{
                    color: "var(--on-clay)",
                    background: "var(--clay)",
                  }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>Add Field</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-shadow space-y-3"
                  style={{ background: "var(--paper)", border: "1px solid var(--rule)" }}
                >
                  {/* Field Header & Controls Bar */}
                  <div
                    className="flex items-center justify-between gap-2 pb-2"
                    style={{ borderBottom: "1px solid var(--rule)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-5 h-5 rounded-md text-[10px] font-mono font-bold flex items-center justify-center"
                        style={{
                          background: "var(--cream)",
                          color: "var(--stone)",
                          border: "1px solid var(--rule)",
                        }}
                      >
                        #{index + 1}
                      </span>
                      <span className="text-[12px] font-semibold" style={{ color: "var(--ink)" }}>
                        {field.name.trim() || <span className="italic" style={{ color: "var(--stone)" }}>Untitled Field</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Required Toggle */}
                      <button
                        type="button"
                        onClick={() => updateField(field.id, { required: !field.required })}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                        style={
                          field.required
                            ? {
                                background: "rgba(184, 58, 58, 0.12)",
                                color: "var(--error)",
                                border: "1px solid var(--error)",
                              }
                            : {
                                background: "var(--cream)",
                                color: "var(--stone)",
                                border: "1px solid var(--rule)",
                              }
                        }
                        title="Toggle required status"
                      >
                        <span style={{ color: "var(--error)" }}>*</span>
                        <span>Required</span>
                      </button>

                      {/* Move Up */}
                      <button
                        type="button"
                        onClick={() => moveField(field.id, -1)}
                        disabled={index === 0}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-20 cursor-pointer"
                        style={{ color: "var(--stone)" }}
                        title="Move Up"
                      >
                        ↑
                      </button>

                      {/* Move Down */}
                      <button
                        type="button"
                        onClick={() => moveField(field.id, 1)}
                        disabled={index === fields.length - 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-20 cursor-pointer"
                        style={{ color: "var(--stone)" }}
                        title="Move Down"
                      >
                        ↓
                      </button>

                      {/* Duplicate */}
                      <button
                        type="button"
                        onClick={() => duplicateField(field.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        style={{ color: "var(--stone)" }}
                        title="Duplicate Field"
                      >
                        ⎘
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeField(field.id)}
                        disabled={fields.length === 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-20 cursor-pointer"
                        style={{ color: "var(--error)" }}
                        title="Delete Field"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Field Inputs Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 items-start">
                    <div>
                      <label
                        className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                        style={{ color: "var(--stone)" }}
                      >
                        Field Label (Column Header)
                      </label>
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => updateField(field.id, { name: e.target.value })}
                        placeholder={`e.g. ${index === 0 ? "Full Name" : index === 1 ? "Mobile Number" : "Status"}`}
                        className="w-full rounded-xl px-3 py-2 text-[13px] font-medium focus:outline-none"
                        style={{
                          background: "var(--cream)",
                          border: "1px solid var(--rule)",
                          color: "var(--ink)",
                        }}
                      />
                    </div>

                    <div>
                      <label
                        className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                        style={{ color: "var(--stone)" }}
                      >
                        Field Type
                      </label>
                      <MobileDropdown
                        size="sm"
                        value={field.type}
                        options={FIELD_TYPES.map((t) => ({ value: t.value, label: `${t.icon} ${t.label}` }))}
                        onChange={(val) => updateField(field.id, { type: val as FieldType })}
                      />
                    </div>
                  </div>

                  {/* Placeholder Input */}
                  <div>
                    <label
                      className="block text-[10px] font-bold uppercase tracking-wider mb-1"
                      style={{ color: "var(--stone)" }}
                    >
                      Custom Placeholder (Optional)
                    </label>
                    <input
                      type="text"
                      value={field.placeholder || ""}
                      onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                      placeholder={`e.g. Enter ${field.name ? field.name.toLowerCase() : "value"}`}
                      className="w-full rounded-xl px-3 py-1.5 text-[12px] focus:outline-none"
                      style={{
                        background: "var(--cream)",
                        border: "1px solid var(--rule)",
                        color: "var(--ink)",
                      }}
                    />
                  </div>

                  {/* Dropdown Options Manager (if type is select) */}
                  {field.type === "select" && (
                    <div
                      className="rounded-xl p-3.5 space-y-2.5"
                      style={{ background: "var(--cream)", border: "1px solid var(--rule)" }}
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold" style={{ color: "var(--ink)" }}>
                          Dropdown Choices ({field.options?.length || 0})
                        </label>
                        <span className="text-[10px]" style={{ color: "var(--stone)" }}>
                          Type option and click &apos;+ Add&apos;
                        </span>
                      </div>

                      {/* Add Option Input */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newOptionInputs[field.id] || ""}
                          onChange={(e) => setNewOptionInputs({ ...newOptionInputs, [field.id]: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addOptionToField(field.id);
                            }
                          }}
                          placeholder="Type option name (e.g. Completed)"
                          className="flex-1 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none"
                          style={{
                            background: "var(--paper)",
                            border: "1px solid var(--rule)",
                            color: "var(--ink)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => addOptionToField(field.id)}
                          className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                          style={{
                            background: "var(--ink)",
                            color: "var(--cream)",
                          }}
                        >
                          + Add
                        </button>
                      </div>

                      {/* Chips List */}
                      {field.options && field.options.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {field.options.map((opt) => (
                            <span
                              key={opt}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium shadow-2xs"
                              style={{
                                background: "var(--paper)",
                                border: "1px solid var(--rule)",
                                color: "var(--ink)",
                              }}
                            >
                              <span>{opt}</span>
                              <button
                                type="button"
                                onClick={() => removeOptionFromField(field.id, opt)}
                                className="font-bold text-xs cursor-pointer opacity-60 hover:opacity-100"
                                style={{ color: "var(--error)" }}
                                title="Remove option"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] italic" style={{ color: "var(--stone)" }}>
                          ⚠️ No choices added yet. Add at least 1-2 options for this dropdown.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div
              className="rounded-xl p-3.5 flex items-start gap-2.5 text-xs font-semibold"
              style={{
                background: "rgba(184, 58, 58, 0.12)",
                border: "1px solid var(--error)",
                color: "var(--error)",
              }}
            >
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2">
            <SubmitButton
              label={destination === "existing" ? "Add Tab & Deploy Form" : "Create Sheet & Deploy Form"}
              submitting={submitting}
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
            />
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────
          LIVE PREVIEW TAB
         ─────────────────────────────────────────────────────────────── */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-[13px] font-semibold text-zinc-900">
              Interactive Mobile Preview
            </p>
            <p className="text-[11px] text-zinc-400">
              This is exactly how respondents will see your form on their smartphones.
            </p>
          </div>

          {/* Smartphone Frame Mockup */}
          <div className="w-full max-w-[380px] mx-auto rounded-[38px] border-[8px] border-zinc-900 bg-zinc-900 shadow-2xl overflow-hidden p-1">
            <div className="rounded-[30px] bg-white min-h-[580px] max-h-[680px] overflow-y-auto flex flex-col justify-between">
              {/* Phone Header / Dynamic Island */}
              <div className="pt-3 px-6 pb-2 border-b border-zinc-100 flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-400 font-bold">9:41</span>
                <div className="w-20 h-4 bg-zinc-950 rounded-full" />
                <span className="text-[10px] text-zinc-400 font-bold">100%</span>
              </div>

              {/* Form Content Inside Mockup */}
              <div className="p-5 space-y-4 flex-1">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    {worksheetName || "Sheet1"}
                  </span>
                  <h1 className="text-[18px] font-bold text-zinc-950 mt-1.5 leading-snug">
                    {formTitle || "Untitled Form"}
                  </h1>
                </div>

                {/* Collapsible JD Card in Live Preview */}
                {formDescription.trim() && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-left">
                    <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-zinc-200/60">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">💼</span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                          Job Description (JD)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setPreviewJdExpanded(!previewJdExpanded)}
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100 shadow-2xs transition-colors"
                      >
                        {previewJdExpanded ? "▲ Hide JD" : "▼ View JD"}
                      </button>
                    </div>
                    <div
                      className={`rich-description text-[12px] leading-relaxed text-zinc-700 overflow-hidden transition-all duration-300 ${
                        previewJdExpanded ? "" : "max-h-[3.6em]"
                      }`}
                      dangerouslySetInnerHTML={{ __html: formDescription }}
                    />
                    {!previewJdExpanded && formDescription.length > 80 && (
                      <div className="h-4 -mt-4 relative pointer-events-none bg-gradient-to-t from-zinc-50 to-transparent" />
                    )}
                  </div>
                )}

                <div className="space-y-3.5">
                  {fields
                    .filter((f) => f.name.trim().length > 0)
                    .map((f, i) => (
                      <div key={f.id || i} className="space-y-1">
                        <label className="block text-[11px] font-bold text-zinc-700">
                          {f.name}
                          {f.required && <span className="text-red-500 font-bold ml-1">*</span>}
                        </label>

                        {f.type === "checkbox" ? (
                          <div className="flex items-center gap-2 pt-1">
                            <input type="checkbox" className="w-4 h-4 rounded text-zinc-950" />
                            <span className="text-xs text-zinc-600">Yes, confirm</span>
                          </div>
                        ) : f.type === "select" ? (
                          <div className="relative">
                            <select className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800">
                              <option value="">— Select an option —</option>
                              {(f.options || []).map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : f.type === "textarea" ? (
                          <textarea
                            rows={2}
                            placeholder={f.placeholder || `Enter ${f.name.toLowerCase()}`}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800 resize-none"
                            disabled
                          />
                        ) : f.type === "file" ? (
                          <div className="border border-dashed border-zinc-300 rounded-lg p-3 text-center bg-zinc-50">
                            <span className="text-xs text-zinc-500">📎 Tap to attach photo / PDF</span>
                          </div>
                        ) : (
                          <input
                            type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
                            placeholder={f.placeholder || `Enter ${f.name.toLowerCase()}`}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800"
                            disabled
                          />
                        )}
                      </div>
                    ))}

                  {fields.filter((f) => f.name.trim()).length === 0 && (
                    <p className="text-xs text-zinc-400 italic text-center py-8">
                      No fields added yet. Go back to Editor to add fields.
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <div className="w-full py-2.5 rounded-xl bg-zinc-950 text-white text-center text-xs font-semibold shadow-sm">
                    Submit Entry
                  </div>
                </div>
              </div>

              {/* Phone Home Bar */}
              <div className="p-2 pb-3 flex justify-center">
                <div className="w-28 h-1 bg-zinc-300 rounded-full" />
              </div>
            </div>
          </div>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("editor")}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 transition-colors"
            >
              ← Back to Editor
            </button>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────────
          BULK PASTE MODAL
         ─────────────────────────────────────────────────────────────── */}
      {showBulkPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in">
          <div
            className="w-full max-w-[500px] rounded-3xl shadow-2xl p-6 space-y-4 animate-scale-up"
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              color: "var(--ink)",
            }}
          >
            <div
              className="flex items-center justify-between pb-2"
              style={{ borderBottom: "1px solid var(--rule)" }}
            >
              <div>
                <h3 className="text-[16px] font-bold" style={{ color: "var(--ink)" }}>
                  📋 Bulk Paste Column Headers
                </h3>
                <p className="text-[12px]" style={{ color: "var(--stone)" }}>
                  Paste headers from Excel, Google Sheets, or WhatsApp
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkPasteModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors"
                style={{ color: "var(--stone)" }}
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label
                className="block text-[11px] font-bold uppercase tracking-wider"
                style={{ color: "var(--stone)" }}
              >
                Paste Columns (1 per line, or comma-separated)
              </label>
              <textarea
                rows={7}
                value={bulkPasteText}
                onChange={(e) => setBulkPasteText(e.target.value)}
                placeholder={`Student Name\nPhone Number\nGender (Male, Female, Other)\nFees Amount (Number)\nFee Receipt (File)\nRemarks`}
                className="w-full font-mono text-xs rounded-xl p-3 focus:outline-none"
                style={{
                  background: "var(--cream)",
                  border: "1px solid var(--rule)",
                  color: "var(--ink)",
                }}
              />
              <p className="text-[11px]" style={{ color: "var(--stone)" }}>
                💡 Tip: Add parentheses for dropdowns like <code>Status (Active, Inactive)</code>.
              </p>
            </div>

            <div
              className="flex items-center justify-end gap-2 pt-2"
              style={{ borderTop: "1px solid var(--rule)" }}
            >
              <button
                type="button"
                onClick={() => setShowBulkPasteModal(false)}
                className="px-3 py-2 text-xs font-semibold rounded-lg cursor-pointer"
                style={{ color: "var(--stone)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplyBulkPaste("append")}
                disabled={!bulkPasteText.trim()}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl disabled:opacity-50 cursor-pointer"
                style={{
                  color: "var(--ink)",
                  background: "var(--cream)",
                  border: "1px solid var(--rule)",
                }}
              >
                + Append to Existing
              </button>
              <button
                type="button"
                onClick={() => handleApplyBulkPaste("replace")}
                disabled={!bulkPasteText.trim()}
                className="px-4 py-2 text-xs font-semibold rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                style={{
                  color: "var(--on-clay)",
                  background: "var(--clay)",
                }}
              >
                Replace All Fields
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}