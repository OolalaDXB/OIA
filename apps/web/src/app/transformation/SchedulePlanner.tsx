"use client";

import { useEffect, useState } from "react";
import { dateISO } from "./plan";

type Routine = {id:string;title:string;time:string;duration:number;days:number[];kind:"rose"|"glaive"|"other";note:string;enabled:boolean};
type EventItem = {id:string;date:string;time:string;title:string;note:string};
type Settings = {city:string;timezone:string;travelNote:string};
const RKEY="oia:transformation90:schedule:v1";
const defaults:Routine[]=[
{id:"rose-am",title:"La Rose · mobilité et respiration",time:"07:25",duration:20,days:[0,1,2,3,4,5,6],kind:"rose",note:"Mobilité douce et respiration selon forme du jour",enabled:true},
{id:"skin-am",title:"Soins visage et SPF",time:"07:50",duration:8,days:[0,1,2,3,4,5,6],kind:"rose",note:"Nettoyant doux, hydratation, protection solaire",enabled:true},
{id:"strength",title:"Le Glaive · renforcement",time:"18:00",duration:40,days:[1,3],kind:"glaive",note:"Progressif et sans douleur du mollet",enabled:true},
{id:"padel",title:"Padel · sous réserve récupération",time:"19:00",duration:75,days:[2,5],kind:"glaive",note:"Ne reprendre que si la fonction du mollet le permet",enabled:false},
{id:"evening",title:"La Rose · récupération du soir",time:"21:30",duration:20,days:[0,1,2,3,4,5,6],kind:"rose",note:"Étirements doux, sommeil, calme",enabled:true}
];
function loadState():{routines:Routine[];events:EventItem[];settings:Settings}{
try{const p=JSON.parse(localStorage.getItem(RKEY)||"{}");return {routines:p.routines||defaults,events:p.events||[],settings:p.settings||{city:"Dubaï",timezone:"Asia/Dubai",travelNote:""}}}catch{return {routines:defaults,events:[],settings:{city:"Dubaï",timezone:"Asia/Dubai",travelNote:""}}}}
const wd=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
export function SchedulePlanner(){
const [ready,setReady]=useState(false);
const [routines,setRoutines]=useState<Routine[]>(defaults);
const [events,setEvents]=useState<EventItem[]>([]);
const [settings,setSettings]=useState<Settings>({city:"Dubaï",timezone:"Asia/Dubai",travelNote:""});
const [date,setDate]=useState("");
const [newTitle,setNewTitle]=useState("");
const [newTime,setNewTime]=useState("12:00");
const [newNote,setNewNote]=useState("");
const [newRoutine,setNewRoutine]=useState("");
const [geoStatus,setGeoStatus]=useState("");
const [editRoutines,setEditRoutines]=useState(false);
useEffect(()=>{const s=loadState();setRoutines(s.routines);setEvents(s.events);setSettings(s.settings);setDate(dateISO(new Date()));setReady(true)},[]);
useEffect(()=>{if(ready)localStorage.setItem(RKEY,JSON.stringify({routines,events,settings}))},[routines,events,settings,ready]);
const day=date||"2026-10-31";
const weekday=new Date(day+"T12:00:00").getDay();
const items=[
...routines.filter(r=>r.enabled&&r.days.includes(weekday)).map(r=>({id:"r-"+r.id,title:r.title,time:r.time,note:r.note,kind:r.kind,type:"routine" as const})),
...events.filter(e=>e.date===day).map(e=>({id:e.id,title:e.title,time:e.time,note:e.note,kind:"other",type:"event" as const}))
].sort((a,b)=>a.time.localeCompare(b.time));
const clashes=items.filter((a,i)=>i>0&&a.time===items[i-1]?.time);
function addEvent(){if(!newTitle.trim())return;setEvents(v=>[...v,{id:crypto.randomUUID(),date:day,time:newTime,title:newTitle.trim(),note:newNote.trim()}]);setNewTitle("");setNewNote("")}
function addRoutine(){if(!newRoutine.trim())return;setRoutines(v=>[...v,{id:crypto.randomUUID(),title:newRoutine.trim(),time:"08:00",duration:15,days:[0,1,2,3,4,5,6],kind:"other",note:"",enabled:true}]);setNewRoutine("")}
function requestLocation(){
if(!navigator.geolocation){setGeoStatus("Localisation indisponible. Indique ta ville manuellement.");return;}
setGeoStatus("Autorisation de localisation demandée…");
navigator.geolocation.getCurrentPosition(p=>{
setGeoStatus("Position vérifiée sur l'appareil (précision ~"+Math.round(p.coords.accuracy)+" m). Les coordonnées ne sont ni conservées ni transmises. Renseigne la ville ci-dessous.");
},()=>setGeoStatus("Localisation refusée ou indisponible ; saisie de ville possible."),{enableHighAccuracy:false,timeout:10000,maximumAge:600000})
}
function updateRoutine(id:string,patch:Partial<Routine>){setRoutines(v=>v.map(r=>r.id===id?{...r,...patch}:r))}
const sleep="Le plan doit rester ajustable à la fatigue, à la douleur, aux déplacements et aux événements imprévus. Aucune activité ne s'impose si récupération insuffisante.";
return <div className="t90-schedule">
<section className="t90-panel">
<div className="t90-section-head"><span>OÙ SUIS-JE AUJOURD'HUI ?</span><span>LOCALISATION VOLONTAIRE</span></div>
<div className="t90-form-grid">
<label>Ville / pays<input value={settings.city} onChange={e=>setSettings(s=>({...s,city:e.target.value}))} placeholder="Dubaï, Vannes, Doha..." /></label>
<label>Fuseau horaire IANA<input value={settings.timezone} onChange={e=>setSettings(s=>({...s,timezone:e.target.value}))} placeholder="Europe/Paris" /></label>
</div>
<button className="t90-btn" onClick={requestLocation}>Vérifier ma position (permission navigateur)</button>
{geoStatus&&<p className="t90-note">{geoStatus}</p>}
<label className="t90-wide-label">Contexte local / voyage<input value={settings.travelNote} onChange={e=>setSettings(s=>({...s,travelNote:e.target.value}))} placeholder="En déplacement, disponible seulement après 17h..." /></label>
<p className="t90-note">Pour le moment la ville est déclarative. Le bouton GPS ne transmet ni ne stocke tes coordonnées ; il ne déduit pas encore ta ville et n'importe pas la météo.</p>
</section>
<section className="t90-panel">
<div className="t90-section-head"><span>MON AGENDA PERSONNEL</span><label>DATE <input type="date" min="2026-10-31" max="2027-01-31" value={day} onChange={e=>setDate(e.target.value)} /></label></div>
<h2>{new Intl.DateTimeFormat("fr-FR",{weekday:"long",day:"numeric",month:"long"}).format(new Date(day+"T12:00:00"))} · {settings.city}</h2>
<div className="t90-records">{items.length===0?<p>Aucun événement. Ajoute le premier ci-dessous.</p>:items.map(item=><div className="t90-record" key={item.id}><span><strong>{item.time} · {item.title}</strong><small>{item.note} · {item.type==="routine"?"récurrent":"ponctuel"}</small></span>{item.type==="event"&&<button onClick={()=>setEvents(v=>v.filter(e=>e.id!==item.id))}>Supprimer</button>}</div>)}</div>
{clashes.length>0&&<p className="t90-error">Conflit possible : plusieurs engagements commencent à la même heure. Ajuste l'horaire des routines ci-dessous.</p>}
<div className="t90-form-grid" style={{marginTop:18}}>
<label>Heure<input type="time" value={newTime} onChange={e=>setNewTime(e.target.value)} /></label>
<label>Événement<input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Déjeuner, réunion, trajet..." /></label>
</div>
<label className="t90-wide-label">Précisions<input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Lieu, contraintes, préparation" /></label>
<button className="t90-btn t90-primary" disabled={!newTitle.trim()} onClick={addEvent}>+ Ajouter à cette journée</button>
<p className="t90-note">{sleep}</p>
</section>
<section className="t90-panel"><div className="t90-section-head"><span>ROUTINES RÉCURRENTES · ROSE ET GLAIVE</span><button className="t90-btn" onClick={()=>setEditRoutines(v=>!v)}>{editRoutines?"Terminer":"Modifier"}</button></div>
{routines.map(r=><div className="t90-routine-editor" key={r.id}>
<label><input type="checkbox" checked={r.enabled} onChange={e=>updateRoutine(r.id,{enabled:e.target.checked})} /> <strong>{r.title}</strong></label>
{editRoutines?<><div className="t90-form-grid"><label>Heure<input type="time" value={r.time} onChange={e=>updateRoutine(r.id,{time:e.target.value})} /></label><label>Durée (min)<input type="number" min="5" max="240" value={r.duration} onChange={e=>updateRoutine(r.id,{duration:Number(e.target.value)})} /></label></div><div className="t90-weekdays">{wd.map((d,i)=><label key={i}><input type="checkbox" checked={r.days.includes(i)} onChange={e=>updateRoutine(r.id,{days:e.target.checked?[...r.days,i].sort():r.days.filter(x=>x!==i)})}/>{d}</label>)}</div></>:<span>{r.time} · {r.duration} min · {r.days.map(d=>wd[d]).join(", ")}</span>}
</div>)}
{editRoutines&&<><label className="t90-wide-label">Nouvelle routine<input value={newRoutine} onChange={e=>setNewRoutine(e.target.value)} placeholder="Ex. lecture, marche après repas..." /></label><button className="t90-btn" onClick={addRoutine}>Ajouter une routine</button></>}
<p className="t90-note">Les événements récurrents sont affichés chaque semaine, sans modifier le calendrier externe. Une connexion à Google Calendar / Apple Calendar et un moteur de replanification restent à développer.</p>
</section>
</div>
}
