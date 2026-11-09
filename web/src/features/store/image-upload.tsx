"use client";
import { useEffect, useId, useRef, useState } from "react";
import { FieldError } from "./form-feedback";
import { RequestError } from "./request-errors";
import type { Api } from "./types";

type Item = { id: string; url: string; file?: File };
const uploaded = new WeakMap<File, { purpose: string; url: string }>();
export async function resolveImageUploads(form: FormData, name: string, api: Api) {
  const order: { url?: string; file?: number }[] = JSON.parse(String(form.get(name + "Order") || "[]"));
  const files = form.getAll(name).filter((value): value is File => value instanceof File && value.size > 0);
  const urls: string[] = [];
  const purpose = name === "imageKeys" ? "product" : "qris";
  for (const item of order) {
    if (item.url) { urls.push(item.url); continue; }
    const file = files[item.file ?? -1];
    if (!file) throw new RequestError(400, { details: [{ path: name, message: "Choose the image again before saving." }] });
    let asset = uploaded.get(file);
    if (asset?.purpose !== purpose) {
      try {
        const response = await api("/api/admin/images", { method: "POST", headers: { "Content-Type": file.type, "X-Image-Purpose": purpose }, body: file });
        asset = { purpose, url: response.image.url };
        uploaded.set(file, asset);
      } catch (error) {
        if (error instanceof RequestError && error.status === 400) throw new RequestError(400, { details: [{ path: name, message: error.message }] });
        throw error;
      }
    }
    urls.push(asset!.url);
  }
  return urls;
}
export function ImageUpload({ name, label, initial = [], multiple = false, required = false }: { name: string; label: string; initial?: string[]; multiple?: boolean; required?: boolean }) {
  const [items, setItems] = useState<Item[]>(() => initial.map((url, index) => ({ id: String(index), url })));
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null), objectUrls = useRef(new Set<string>()), id = useId();
  useEffect(() => () => { objectUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  const update = (next: Item[]) => {
    items.forEach(item => { if (item.file && !next.includes(item) && objectUrls.current.has(item.url)) { URL.revokeObjectURL(item.url); objectUrls.current.delete(item.url); } });
    const transfer = new DataTransfer();
    next.forEach(item => { if (item.file) transfer.items.add(item.file); });
    if (input.current) input.current.files = transfer.files;
    setItems(next);
  };
  const fileOrder: { url?: string; file?: number }[] = [];
  let index = 0;
  items.forEach(item => fileOrder.push(item.file ? { file: index++ } : { url: item.url }));
  return <div className="image-upload">
    <label htmlFor={id}>{label}</label>
    <input ref={input} id={id} name={name} type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} required={required && !items.length} aria-describedby={id + "-help"} aria-invalid={error ? true : undefined} onChange={event => {
      const files = Array.from(event.currentTarget.files || []);
      const limit = multiple ? 8 : 1;
      const message = files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type)) ? "Choose JPG, PNG, or WebP images." : files.some(file => file.size > 10 * 1024 * 1024 || !file.size) ? "Each image must be between 1 byte and 10 MB." : multiple && items.length + files.length > limit ? "Use at most 8 product images. Remove an image before adding another." : "";
      setError(message);
      if (message) { update(items); return; }
      if (!files.length) { update(items); return; }
      const additions = files.map(file => { const url = URL.createObjectURL(file); objectUrls.current.add(url); return { id: crypto.randomUUID(), file, url }; });
      update(multiple ? [...items, ...additions] : additions);
    }}/>
    <small id={id + "-help"} className="muted">JPG, PNG, or WebP · max 10 MB each{multiple ? " · up to 8 images. The first image is the cover." : ". Choose a clear, complete QR code."}</small>
    <input type="hidden" name={name + "Order"} value={JSON.stringify(fileOrder)}/>
    {error && <p className="field-error" role="alert">{error}</p>}<FieldError name={name}/>
    {!!items.length && <ol className="image-upload-list">{items.map((item, position) => <li key={item.id}>
      <img src={item.url} alt={multiple ? `Product photo ${position + 1}${position === 0 ? ", cover" : ""}` : "QRIS preview"}/>
      <div><span>{multiple ? position === 0 ? "Cover image" : `Photo ${position + 1}` : "QRIS image"}</span>
      <div className="button-row">{multiple && position > 0 && <button type="button" className="button-secondary" onClick={() => update([item, ...items.filter(other => other !== item)])}>Make cover</button>}
      <button type="button" className="button-secondary" aria-label={`Remove ${multiple ? "photo " + (position + 1) : "QRIS image"}`} onClick={() => { if (item.file) { URL.revokeObjectURL(item.url); objectUrls.current.delete(item.url); } update(items.filter(other => other !== item)); setError(""); }}>Remove</button></div></div>
    </li>)}</ol>}
  </div>;
}
