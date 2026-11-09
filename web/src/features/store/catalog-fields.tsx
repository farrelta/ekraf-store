"use client";

import { useState } from "react";
import { FieldError } from "./form-feedback";
import type { CatalogOptions } from "./types";

export function CategorySelect({ options, current }: { options: CatalogOptions; current?: string | null }) {
  const standard = options.categories.filter(value => value !== "Other");
  const [choice, setChoice] = useState(current ? standard.includes(current) ? current : "Other" : "");
  return <>
    <label>Category<select name="categoryChoice" aria-label="Category" value={choice} onChange={e => setChoice(e.target.value)}>
      <option value="">Select category (optional)</option>
      {options.categories.map(value => <option key={value}>{value}</option>)}
    </select><FieldError name="categoryChoice"/></label>
    {choice === "Other" && <label>Custom category<input name="customCategory" required maxLength={160} defaultValue={current && !standard.includes(current) ? current : ""} placeholder="Enter category name"/><FieldError name="customCategory"/></label>}
  </>;
}

export function VariantInputs({ options, sellingType }: { options: CatalogOptions; sellingType: "CONTINUOUS" | "BATCH" }) {
  const isBatch = sellingType === "BATCH";
  return <>
    <p><strong>SKU</strong><br/>Generated automatically when saved.</p>
    <p>One combination per variant—for example, M / Black. Add another variant for L / Black.</p>
    <div className="form-grid">
      <label>Size<select key={sellingType} name="size" aria-label="Size" required defaultValue="STANDARD">
        {options.sizes.map(value => <option key={value} value={value}>{value === "STANDARD" ? "No size" : value}</option>)}
      </select><FieldError name="size"/></label>
      <label>Color<input name="color" aria-label="Color" maxLength={160} placeholder="Black; blank if not offered"/><FieldError name="color"/></label>
      <label>Type<input name="type" aria-label="Type" maxLength={160} placeholder="Physics; blank if not offered"/><FieldError name="type"/></label>
      <label>Price (IDR)<input name="price" type="number" min="1" max="999999999.99" step="0.01" required/><FieldError name="price"/></label>
      <label>Initial stock (zero for batches)<input name="onHand" type="number" min="0" disabled={isBatch} max={isBatch ? "0" : "100000"} step="1" defaultValue="0" required/><FieldError name="onHand"/></label>
    </div>
  </>;
}
