"use client";
import { useEffect, useState } from "react";
import { useData } from "./store-provider";
import { StoreLayout, State } from "./ui";
import { date } from "./types";
type Announcement = {id:string;title:string;body:string;published:boolean;startsAt:string|null;endsAt:string|null;updatedAt:string};
export function useAnnouncements(admin=false) {
 const result=useData<{announcements:Announcement[]}>(admin ? "/api/admin/announcements" : "/api/announcements");
 const {reload}=result;
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible")void reload();};const timer=setInterval(refresh,30000);window.addEventListener("focus",refresh);return()=>{clearInterval(timer);window.removeEventListener("focus",refresh);};},[reload]);
 return result;
}
export function AnnouncementBanner() {
 const {data,loading}=useAnnouncements();const [index,setIndex]=useState(0),[dismissed,setDismissed]=useState(""),[paused,setPaused]=useState(false);
 const rows=data?.announcements||[];const version=rows.map(a=>a.id+a.updatedAt).join(":");
 useEffect(()=>{if(paused||rows.length<2)return;const timer=setInterval(()=>setIndex(i=>(i+1)%rows.length),6000);return()=>clearInterval(timer);},[rows.length,paused]);
 if(loading&&!data)return <aside className="announcement announcement-loading" aria-hidden="true"><div className="loading-line"/></aside>;
 const current=rows[index%rows.length];if(!current||dismissed===version)return null;
 return <aside className="announcement" aria-label="Store announcements" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={()=>setPaused(false)}>
 <small>STORE NEWS</small><div><strong>{current.title}</strong><span className="announcement-excerpt">{current.body}</span></div>

 <button type="button" aria-label="Dismiss announcement" onClick={()=>setDismissed(version)}>×</button></aside>;
}
export function AnnouncementsPage() {
 const {data,loading,error,reload}=useAnnouncements();return <StoreLayout><div className="store-container announcements-page"><small className="eyebrow">EKRAF UPDATES</small><h1>Announcements</h1><p>Store news, sales and campus pickup arrangements.</p><State loading={loading&&!data} error={error} retry={reload}>{data?.announcements.length===0&&<p className="empty">No announcements right now.</p>}{data?.announcements.map(a=><article className="panel announcement-article" id={a.id} key={a.id}><h2>{a.title}</h2><small className="muted">Updated {date(a.updatedAt)}</small><p>{a.body}</p></article>)}</State></div></StoreLayout>;
}
