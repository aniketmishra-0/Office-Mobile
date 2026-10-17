import type { FieldSchema } from "@/types/field";

export interface CalculationRule {
  targetKey: string;
  formulaDesc: string;
  compute: (values: Record<string, string>) => string | null;
  sourceKeys: string[];
}

function normalize(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseNumber(v: string | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Automatically inspects the sheet's fields and detects common arithmetic & string formulas:
 * 1. Quantity × Price = Total
 * 2. Total + Tax / GST = Grand Total
 * 3. Total - Discount = Net Total
 * 4. First Name + Last Name = Full Name
 * 5. Date Difference (Start Date to End Date = Total Days)
 */
export function detectCalculationRules(fields: FieldSchema[]): CalculationRule[] {
  const rules: CalculationRule[] = [];
  const usedTargets = new Set<string>();

  const findField = (predicate: (norm: string) => boolean, excludeKeys: Set<string> = new Set()) => {
    return fields.find((f) => !excludeKeys.has(f.key) && predicate(normalize(f.label)));
  };

  // 1. Qty * Rate = Total
  const qtyField = findField((n) =>
    ["qty", "quantity", "pieces", "pcs", "units", "hours", "days", "count", "items", "weight"].includes(n) ||
    n.endsWith("qty") || n.endsWith("quantity")
  );

  const rateField = findField((n) =>
    ["rate", "price", "unitprice", "unitrate", "cost", "unitcost", "fee", "hourlyrate", "perunit", "mrp"].includes(n) ||
    n.endsWith("rate") || n.endsWith("price") || n.endsWith("cost")
  );

  const totalField = findField((n) =>
    ["total", "amount", "subtotal", "totalamount", "totalprice", "linetotal", "grossamount", "itemtotal", "value"].includes(n) ||
    n.startsWith("total") || n.endsWith("amount")
  );

  if (qtyField && rateField && totalField && totalField.key !== qtyField.key && totalField.key !== rateField.key) {
    usedTargets.add(totalField.key);
    rules.push({
      targetKey: totalField.key,
      formulaDesc: `${qtyField.label} × ${rateField.label}`,
      sourceKeys: [qtyField.key, rateField.key],
      compute: (values) => {
        const q = parseNumber(values[qtyField.key]);
        const r = parseNumber(values[rateField.key]);
        if (q === null || r === null) return null;
        const res = q * r;
        return Number.isInteger(res) ? String(res) : res.toFixed(2);
      },
    });
  }

  // 2. Subtotal + Tax/GST = Grand Total
  const baseTotalField = totalField || findField((n) => ["subtotal", "amount", "taxableamount", "total"].includes(n), usedTargets);
  const taxField = findField((n) => ["gst", "tax", "vat", "gstpercent", "taxpercent", "taxrate", "cgst", "sgst"].includes(n), usedTargets);
  const grandTotalField = findField((n) =>
    ["grandtotal", "nettotal", "finalamount", "netamount", "payableamount", "invoicetotal", "totalpayable"].includes(n),
    usedTargets
  );

  if (baseTotalField && taxField && grandTotalField && grandTotalField.key !== baseTotalField.key && grandTotalField.key !== taxField.key) {
    usedTargets.add(grandTotalField.key);
    rules.push({
      targetKey: grandTotalField.key,
      formulaDesc: `${baseTotalField.label} + ${taxField.label}`,
      sourceKeys: [baseTotalField.key, taxField.key],
      compute: (values) => {
        const base = parseNumber(values[baseTotalField.key]);
        const tax = parseNumber(values[taxField.key]);
        if (base === null) return null;
        if (tax === null) return String(base);
        // If tax is <= 40, treat as percentage
        const taxAmount = tax <= 40 ? (base * tax) / 100 : tax;
        const res = base + taxAmount;
        return Number.isInteger(res) ? String(res) : res.toFixed(2);
      },
    });
  }

  // 3. Amount - Discount = Net Total
  const discountField = findField((n) => ["discount", "rebate", "less", "discountpercent"].includes(n), usedTargets);
  const netTotalField = findField((n) =>
    ["netamount", "totalafterdiscount", "discountedtotal", "payable"].includes(n),
    usedTargets
  );

  if (baseTotalField && discountField && netTotalField && netTotalField.key !== baseTotalField.key && netTotalField.key !== discountField.key) {
    usedTargets.add(netTotalField.key);
    rules.push({
      targetKey: netTotalField.key,
      formulaDesc: `${baseTotalField.label} − ${discountField.label}`,
      sourceKeys: [baseTotalField.key, discountField.key],
      compute: (values) => {
        const base = parseNumber(values[baseTotalField.key]);
        const disc = parseNumber(values[discountField.key]);
        if (base === null) return null;
        if (disc === null) return String(base);
        const discAmount = disc <= 100 && (normalize(discountField.label).includes("percent") || (values[discountField.key] || "").includes("%"))
          ? (base * disc) / 100
          : disc;
        const res = Math.max(0, base - discAmount);
        return Number.isInteger(res) ? String(res) : res.toFixed(2);
      },
    });
  }

  // 4. First Name + Last Name = Full Name
  const firstNameField = findField((n) => ["firstname", "fname", "givenname", "first"].includes(n), usedTargets);
  const lastNameField = findField((n) => ["lastname", "lname", "surname", "last"].includes(n), usedTargets);
  const fullNameField = findField((n) => ["fullname", "name", "clientname", "customername", "employeename"].includes(n), usedTargets);

  if (firstNameField && lastNameField && fullNameField && fullNameField.key !== firstNameField.key && fullNameField.key !== lastNameField.key) {
    usedTargets.add(fullNameField.key);
    rules.push({
      targetKey: fullNameField.key,
      formulaDesc: `${firstNameField.label} + ${lastNameField.label}`,
      sourceKeys: [firstNameField.key, lastNameField.key],
      compute: (values) => {
        const fn = (values[firstNameField.key] || "").trim();
        const ln = (values[lastNameField.key] || "").trim();
        if (!fn && !ln) return null;
        return `${fn} ${ln}`.trim();
      },
    });
  }

  // 5. Date Difference (Days between Start Date and End Date)
  const fromDateField = findField((n) => ["startdate", "fromdate", "checkin", "checkindate", "departure", "from"].includes(n), usedTargets);
  const toDateField = findField((n) => ["enddate", "todate", "checkout", "checkoutdate", "return", "to"].includes(n), usedTargets);
  const daysField = findField((n) => ["totaldays", "days", "duration", "noofdays", "stayduration"].includes(n), usedTargets);

  if (fromDateField && toDateField && daysField && daysField.key !== fromDateField.key && daysField.key !== toDateField.key) {
    usedTargets.add(daysField.key);
    rules.push({
      targetKey: daysField.key,
      formulaDesc: `Days (${fromDateField.label} → ${toDateField.label})`,
      sourceKeys: [fromDateField.key, toDateField.key],
      compute: (values) => {
        const fStr = values[fromDateField.key];
        const tStr = values[toDateField.key];
        if (!fStr || !tStr) return null;
        const d1 = new Date(fStr).getTime();
        const d2 = new Date(tStr).getTime();
        if (isNaN(d1) || isNaN(d2)) return null;
        const diffDays = Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        return String(diffDays);
      },
    });
  }

  return rules;
}

/**
 * Applies detected calculation rules to the current form values.
 * Fields in manualOverrides are preserved and not overwritten.
 */
export function applyCalculations(
  rules: CalculationRule[],
  values: Record<string, string>,
  manualOverrides: Set<string>
): Record<string, string> {
  const next = { ...values };
  let changed = false;

  for (const rule of rules) {
    if (manualOverrides.has(rule.targetKey)) continue;

    const computedVal = rule.compute(next);
    if (computedVal !== null && computedVal !== next[rule.targetKey]) {
      next[rule.targetKey] = computedVal;
      changed = true;
    }
  }

  return changed ? next : values;
}
