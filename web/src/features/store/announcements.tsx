"use client";
import { useEffect, useState } from "react";
import { useData, useStore } from "./store-provider";
import { StoreLayout, State } from "./ui";
import { ActionForm } from "./admin-forms";
import { date } from "./types";
type Announcement = {id:string;title:string;body:string;published:boolean;startsAt:string|null;endsAt:string|null;updatedAt:string};
function useAnnouncements(admin=false) {
 const result=useData<{announcements:Announcement[]}>(admin ? "/api/admin/announcements" : "/api/announcements");
 const {reload}=result;
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible")void reload();};const timer=setInterval(refresh,30000);window.addEventListener("focus",refresh);return()=>{clearInterval(timer);window.removeEventListener("focus",refresh);};},[reload]);
 return result;
}
export function AnnouncementBanner() {
 const {data}=useAnnouncements();const [index,setIndex]=useState(0),[dismissed,setDismissed]=useState(""),[paused,setPaused]=useState(false);
 const rows=data?.announcements||[];const version=rows.map(a=>a.id+a.updatedAt).join(":");
 useEffect(()=>{if(paused||rows.length<2)return;const timer=setInterval(()=>setIndex(i=>(i+1)%rows.length),6000);return()=>clearInterval(timer);},[rows.length,paused]);
 const current=rows[index%rows.length];if(!current||dismissed===version)return null;
 return <aside className="announcement" aria-label="Store announcements" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={()=>setPaused(false)}>
 <small>STORE NEWS</small><div><strong>{current.title}</strong><span className="announcement-excerpt">{current.body}</span></div>

 <button type="button" aria-label="Dismiss announcement" onClick={()=>setDismissed(version)}>×</button></aside>;
}
export function AnnouncementsPage() {
 const {data,loading,error,reload}=useAnnouncements();return <StoreLayout><div className="store-container announcements-page"><small className="eyebrow">EKRAF UPDATES</small><h1>Announcements</h1><p>Store news, sales and campus pickup arrangements.</p><State loading={loading&&!data} error={error} retry={reload}>{data?.announcements.length===0&&<p className="empty">No announcements right now.</p>}{data?.announcements.map(a=><article className="panel announcement-article" id={a.id} key={a.id}><h2>{a.title}</h2><small className="muted">Updated {date(a.updatedAt)}</small><p>{a.body}</p></article>)}</State></div></StoreLayout>;
}
const inputDate=(value:string|null)=>value?new Date(new Date(value).getTime()-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16):"";
export function AdminAnnouncements() {
 const {data,loading,error,reload}=useAnnouncements(true);const {api,report}=useStore();const [selected,setSelected]=useState<string|null>(null);const row=data?.announcements.find(a=>a.id===selected);
 return <><h1>Announcements</h1><p>Publish store news, maintenance, sales, or pickup instructions independently of batches. Active announcements rotate every six seconds.</p><State loading={loading&&!data} error={error} retry={reload}><div className="announcement-admin-grid"><section><button className="button-secondary" type="button" onClick={()=>setSelected(null)}>New announcement</button>{data?.announcements.map(a=><article className="panel announcement-article" key={a.id}><h2>{a.title}</h2><p>{a.published?"Published / scheduled":"Draft"}</p><button className="button-secondary" onClick={()=>setSelected(a.id)}>Edit</button></article>)}</section><ActionForm key={row?.id+":"+row?.updatedAt} submit={async f=>{const get=(key:string)=>String(f.get(key)||"").trim();await api("/api/admin/announcements"+(row?"/"+row.id:""),{method:row?"PATCH":"POST",body:JSON.stringify({title:get("title"),body:get("body"),published:f.get("published")==="on",startsAt:get("startsAt")?new Date(get("startsAt")).toISOString():null,endsAt:get("endsAt")?new Date(get("endsAt")).toISOString():null})});setSelected(null);await reload();}}><section className="panel form-section"><h2>{row?"Edit announcement":"New announcement"}</h2><label>Title<input name="title" required maxLength={160} defaultValue={row?.title}/></label><label>Message<textarea name="body" required maxLength={10000} rows={7} defaultValue={row?.body}/></label><label>Start (optional, local time)<input name="startsAt" type="datetime-local" defaultValue={inputDate(row?.startsAt??null)}/></label><label>End (optional, local time)<input name="endsAt" type="datetime-local" defaultValue={inputDate(row?.endsAt??null)}/></label><label className="check-label"><input type="checkbox" name="published" defaultChecked={row?.published}/> Publish announcement</label><p className="muted">Leave dates empty to keep it available until unpublished. Drafts and announcements outside their dates are hidden from customers. Store pages refresh within 30 seconds or when refocused.</p><button className="button-primary">Save announcement</button>{row&&<button className="cancel-order-button" type="button" onClick={async()=>{if(!window.confirm("Delete this announcement?"))return;try{await api("/api/admin/announcements/"+row.id,{method:"DELETE"});setSelected(null);await reload();report("Announcement deleted.");}catch(e){report((e as Error).message);}}}>Delete announcement</button>}</section></ActionForm></div></State></>;
}
