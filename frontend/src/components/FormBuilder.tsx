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
    await onSubmit({
      formTitle: trimmedTitle,
      description: formDescription.trim() || undefined,
      worksheetName: trimmedWorksheet,
      destination,
      existingSheetUrl: destination === "existing" ? existingSheetUrl.trim() : undefined,
      fields: normalizedFields,
      uiConfig,
    });
  }

  return (
    <div className="space-y-6 animate-in pb-12 max-w-4xl mx-auto">
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-zinc-950 text-white shadow-xl border border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-emerald-400 font-semibold">
              Form Builder Studio
            </span>
          </div>
          <h2 className="text-[20px] font-bold text-white tracking-tight mt-1">
            Create & Deploy Form
          </h2>
          <p className="text-[12px] text-zinc-400 mt-0.5">
            Turn blank or existing Google Sheets into fast, mobile-friendly forms.
          </p>
        </div>

        {/* View Switcher: Editor vs Live Mobile Preview */}
        <div className="inline-flex items-center p-1 rounded-xl bg-zinc-900 border border-zinc-800 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
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
          {/* Quick Starters & Templates */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                ⚡ Ready-Made Templates (1-Tap Load)
              </label>
              <button
                type="button"
                onClick={() => setShowBulkPasteModal(true)}
                className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 underline underline-offset-2"
              >
                <span>📋</span> Paste Bulk Headers
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {FORM_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => loadTemplate(tpl)}
                  className="p-3 text-left rounded-xl border border-zinc-200 bg-white hover:border-zinc-950 hover:shadow-md transition-all active:scale-[0.98] group flex flex-col justify-between"
                >
                  <div className="text-xl mb-1.5">{tpl.icon}</div>
                  <div>
                    <p className="text-[12px] font-bold text-zinc-900 group-hover:text-emerald-600 transition-colors leading-tight truncate">
                      {tpl.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">
                      {tpl.fields.length} fields
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Destination Selector: New Sheet vs Existing Sheet */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs space-y-4">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Where will the data be stored?
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDestination("new")}
                className={`p-3.5 text-left rounded-xl border transition-all ${
                  destination === "new"
                    ? "border-zinc-950 bg-zinc-50/80 shadow-xs ring-1 ring-zinc-950"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <span className="text-[13px] font-bold text-zinc-950">Create New Google Sheet</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 pl-7">
                  We&apos;ll automatically generate a brand new Google Spreadsheet linked to this form.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDestination("existing")}
                className={`p-3.5 text-left rounded-xl border transition-all ${
                  destination === "existing"
                    ? "border-zinc-950 bg-zinc-50/80 shadow-xs ring-1 ring-zinc-950"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">🔗</span>
                  <span className="text-[13px] font-bold text-zinc-950">Add Tab to Existing Sheet</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1 pl-7">
                  Paste your existing Google Sheet link and we&apos;ll insert a fresh tab for this form.
                </p>
              </button>
            </div>

            {destination === "existing" && (
              <div className="pt-2 animate-in fade-in">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-zinc-600 mb-1.5">
                  Existing Google Sheet URL or ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={existingSheetUrl}
                  onChange={(e) => setExistingSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-[14px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent"
                />
              </div>
            )}
          </div>

          {/* Form Title & Subsheet Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Form Title
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 pr-10 text-[15px] font-semibold text-zinc-950 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all"
                  placeholder="e.g. Daily Attendance"
                />
                {formTitle && <ClearButton onClick={() => setFormTitle("")} right={12} ariaLabel="Clear title" />}
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                Subsheet (Tab) Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={worksheetName}
                  onChange={(e) => setWorksheetName(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3.5 py-2.5 pr-10 text-[15px] font-semibold text-zinc-950 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950 transition-all"
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
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-xs transition-all">
            <button
              type="button"
              onClick={() => setShowJdSection(!showJdSection)}
              className="w-full flex items-center justify-between p-4 bg-zinc-50/50 hover:bg-zinc-100/60 transition-colors"
            >
              <div className="flex items-center gap-2.5 text-left">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 text-white text-xs">
                  💼
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-bold text-zinc-950">
                      Job Description (JD) & Role Details
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200/50">
                      Collapsible on Form
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {formDescription.trim()
                      ? `${formDescription.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 65)}...`
                      : "Add role details, responsibilities & perks (candidates can expand/collapse on mobile)"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {formDescription.trim() && (
                  <span className="text-[10px] font-mono font-medium text-zinc-400 hidden sm:inline">
                    {formDescription.length} chars
                  </span>
                )}
                <svg
                  className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${showJdSection ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {showJdSection && (
              <div className="p-4 pt-3 border-t border-zinc-100 space-y-3 bg-white animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-600">
                    JD Content (Overview, Requirements & Perks)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormDescription(DEFAULT_JOB_DESCRIPTION)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <span>✨</span>
                      <span>Insert Sample JD</span>
                    </button>
                    {formDescription && (
                      <button
                        type="button"
                        onClick={() => setFormDescription("")}
                        className="px-2 py-1 text-[11px] font-medium text-zinc-500 hover:text-red-600 rounded-lg hover:bg-zinc-100 transition-colors"
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

                <p className="text-[11px] text-zinc-400 flex items-center gap-1 pt-1">
                  <span>💡</span>
                  <span>
                    This JD will appear at the top of the form with a smooth <strong>[View Full JD ▾]</strong> accordion toggle, keeping the form fast and clean on mobile.
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* UI/UX Appearance Drawer */}
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="w-full flex items-center justify-between p-4 bg-zinc-50/50 hover:bg-zinc-100/60 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white text-xs">
                  🎨
                </span>
                <span className="text-[13px] font-bold text-zinc-950">Theme, Fonts & Layout Configuration</span>
              </div>
              <svg
                className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${showConfig ? "rotate-180" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showConfig && (
              <div className="p-4 pt-3 border-t border-zinc-100 space-y-4 bg-white animate-in fade-in">
                <FormDesignPicker value={formDesign} onChange={setFormDesign} />
                <hr className="border-zinc-100" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                      Theme
                    </label>
                    <MobileDropdown size="sm" value={formTheme} options={THEME_OPTIONS} onChange={setFormTheme} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                      Font
                    </label>
                    <MobileDropdown size="sm" value={formFont} options={FONT_OPTIONS} onChange={setFormFont} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
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
                <h3 className="text-[14px] font-bold text-zinc-950">
                  Form Fields ({fields.length})
                </h3>
                <p className="text-[11px] text-zinc-500">These will become the column headers in your Google Sheet.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkPasteModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs transition-all"
                >
                  <span>📋</span>
                  <span>Bulk Paste</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFields((prev) => [...prev, createDraftField()])}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 text-white px-3.5 py-2 text-[12px] font-semibold hover:bg-zinc-800 shadow-sm transition-all active:scale-[0.98]"
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
                  className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-2xs hover:shadow-xs transition-shadow space-y-3"
                >
                  {/* Field Header & Controls Bar */}
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-zinc-100">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-zinc-100 text-zinc-600 text-[10px] font-mono font-bold flex items-center justify-center">
                        #{index + 1}
                      </span>
                      <span className="text-[12px] font-semibold text-zinc-800">
                        {field.name.trim() || <span className="text-zinc-400 italic">Untitled Field</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Required Toggle */}
                      <button
                        type="button"
                        onClick={() => updateField(field.id, { required: !field.required })}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                          field.required
                            ? "bg-red-50 text-red-600 border border-red-200"
                            : "bg-zinc-100 text-zinc-500 hover:text-zinc-700"
                        }`}
                        title="Toggle required status"
                      >
                        <span className="text-red-500">*</span>
                        <span>Required</span>
                      </button>

                      {/* Move Up */}
                      <button
                        type="button"
                        onClick={() => moveField(field.id, -1)}
                        disabled={index === 0}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-20"
                        title="Move Up"
                      >
                        ↑
                      </button>

                      {/* Move Down */}
                      <button
                        type="button"
                        onClick={() => moveField(field.id, 1)}
                        disabled={index === fields.length - 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-20"
                        title="Move Down"
                      >
                        ↓
                      </button>

                      {/* Duplicate */}
                      <button
                        type="button"
                        onClick={() => duplicateField(field.id)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
                        title="Duplicate Field"
                      >
                        ⎘
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => removeField(field.id)}
                        disabled={fields.length === 1}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-20"
                        title="Delete Field"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Field Inputs Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3 items-start">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                        Field Label (Column Header)
                      </label>
                      <input
                        type="text"
                        value={field.name}
                        onChange={(e) => updateField(field.id, { name: e.target.value })}
                        placeholder={`e.g. ${index === 0 ? "Full Name" : index === 1 ? "Mobile Number" : "Status"}`}
                        className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2 text-[13px] font-medium text-zinc-950 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
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
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                      Custom Placeholder (Optional)
                    </label>
                    <input
                      type="text"
                      value={field.placeholder || ""}
                      onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                      placeholder={`e.g. Enter ${field.name ? field.name.toLowerCase() : "value"}`}
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50/30 px-3 py-1.5 text-[12px] text-zinc-700 focus:border-zinc-950 focus:bg-white focus:outline-none focus:ring-1 focus:ring-zinc-950"
                    />
                  </div>

                  {/* Dropdown Options Manager (if type is select) */}
                  {field.type === "select" && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-zinc-700">
                          Dropdown Choices ({field.options?.length || 0})
                        </label>
                        <span className="text-[10px] text-zinc-400">Type option and click &apos;+ Add&apos;</span>
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
                          className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950"
                        />
                        <button
                          type="button"
                          onClick={() => addOptionToField(field.id)}
                          className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white text-[11px] font-semibold hover:bg-zinc-800 transition-colors"
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
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white border border-zinc-200 text-zinc-800 shadow-2xs"
                            >
                              <span>{opt}</span>
                              <button
                                type="button"
                                onClick={() => removeOptionFromField(field.id, opt)}
                                className="text-zinc-400 hover:text-red-500 font-bold text-xs"
                                title="Remove option"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-amber-600 italic">
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
            <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 flex items-start gap-2.5 text-red-700 text-xs font-semibold">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-[500px] bg-white rounded-3xl shadow-2xl p-6 space-y-4 border border-zinc-200 animate-scale-up">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div>
                <h3 className="text-[16px] font-bold text-zinc-950">📋 Bulk Paste Column Headers</h3>
                <p className="text-[12px] text-zinc-500">Paste headers from Excel, Google Sheets, or WhatsApp</p>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkPasteModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Paste Columns (1 per line, or comma-separated)
              </label>
              <textarea
                rows={7}
                value={bulkPasteText}
                onChange={(e) => setBulkPasteText(e.target.value)}
                placeholder={`Student Name\nPhone Number\nGender (Male, Female, Other)\nFees Amount (Number)\nFee Receipt (File)\nRemarks`}
                className="w-full font-mono text-xs rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-950"
              />
              <p className="text-[11px] text-zinc-400">
                💡 Tip: Add parentheses for dropdowns like <code>Status (Active, Inactive)</code>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowBulkPasteModal(false)}
                className="px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplyBulkPaste("append")}
                disabled={!bulkPasteText.trim()}
                className="px-3.5 py-2 text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl disabled:opacity-50"
              >
                + Append to Existing
              </button>
              <button
                type="button"
                onClick={() => handleApplyBulkPaste("replace")}
                disabled={!bulkPasteText.trim()}
                className="px-4 py-2 text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl shadow-xs disabled:opacity-50"
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