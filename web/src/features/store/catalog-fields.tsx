"use client";

import { useState } from "react";
import type { CatalogOptions } from "./types";

export function CategorySelect({ options, current }: { options: CatalogOptions; current?: string | null }) {
  const standard = options.categories.filter(value => value !== "Other");
  const [choice, setChoice] = useState(current ? standard.includes(current) ? current : "Other" : "");
  return <>
    <label>Category<select name="categoryChoice" aria-label="Category" value={choice} onChange={e => setChoice(e.target.value)}>
      <option value="">Select category (optional)</option>
      {options.categories.map(value => <option key={value}>{value}</option>)}
    </select></label>
    {choice === "Other" && <label>Custom category<input name="customCategory" required maxLength={160} defaultValue={current && !standard.includes(current) ? current : ""} placeholder="Enter category name"/></label>}
  </>;
}

export function VariantInputs({ options, sellingType }: { options: CatalogOptions; sellingType: "CONTINUOUS" | "BATCH" }) {
  const isBatch = sellingType === "BATCH";
  return <>
    <p><strong>SKU</strong><br/>Generated automatically when saved.</p>
    <p>One combination per variant—for example, M / Black. Add another variant for L / Black.</p>
    <div className="form-grid">
      <label>Size<select key={sellingType} name="size" aria-label="Size" required defaultValue={isBatch ? "" : "STANDARD"}>
        {isBatch && <option value="" disabled>Choose a clothing size</option>}
        {options.sizes.filter(value => !isBatch || value !== "STANDARD").map(value => <option key={value} value={value}>{value === "STANDARD" ? "No size" : value}</option>)}
      </select></label>
      <label>Color<input name="color" type="text" maxLength={160} placeholder="Type one color, e.g. Black; blank if not offered"/></label>
      <label>Price (IDR)<input name="price" type="number" min="1" step="0.01" required/></label>
      <label>Initial stock (zero for batches)<input name="onHand" type="number" min="0" max={isBatch ? "0" : "100000"} step="1" defaultValue="0" required/></label>
    </div>
  </>;
}
