"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/supabase";
import {
  BUDGET, CARE, END, HEIGHT_CM, RITUALS, START, START_WEIGHT, WEEKS,
  dateISO, dayNumber, emptyEntry, intention, weekNumber,
  type DailyEntry, type IntakeKind, type IntakeItem,
} from "./plan";
import "./transformation.css";

type Tab = "today" | "journal" | "weeks" | "photos" | "care";
type PhotoRecord = { id: string; date: string; category: string; blob: Blob; type: string };
type Preview = { id: string; date: string; category: string; url: string };
const STORE_KEY = "oia:personal:transformation90:v1";
const DB_NAME = "oia-personal-transformation-v1";
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const PHOTO_CATEGORIES = ["Corps face", "Corps profil", "Corps dos", "Visage face", "Visage profil", "Sourire", "Cheveux dessus", "Cheveux tempes", "Cheveux vertex"];

function load(): Record<string, DailyEntry> {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || "{}") as Record<string, DailyEntry>;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function openPhotos(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("photos")) r.result.createObjectStore("photos", { keyPath: "id" });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error || new Error("IndexedDB inaccessible"));
  });
}
async function photoAction<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore, finish: (value: T) => void) => void): Promise<T> {
  const db = await openPhotos();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", mode);
    let answer: T;
    tx.oncomplete = () => { db.close(); resolve(answer); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error("Photo inaccessible")); };
    fn(tx.objectStore("photos"), (value) => { answer = value; });
  });
}
async function getPhotos(): Promise<PhotoRecord[]> {
  return photoAction<PhotoRecord[]>("readonly", (store, finish) => {
    const r = store.getAll();
    r.onsuccess = () => finish(r.result as PhotoRecord[]);
  });
}
async function savePhoto(photo: PhotoRecord) {
  await photoAction<void>("readwrite", (store, finish) => { store.put(photo); finish(undefined); });
}
async function removePhoto(id: string) {
  await photoAction<void>("readwrite", (store, finish) => { store.delete(id); finish(undefined); });
}
function downloadFile(name: string, contents: string, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function TransformationDashboard() {
  const { state } = useAuth();
  const [tab, setTab] = useState<Tab>("today");
  const [entries, setEntries] = useState<Record<string, DailyEntry>>({});
  const [loaded, setLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemKind, setItemKind] = useState<IntakeKind>("repas");
  const [itemQuantity, setItemQuantity] = useState("");
  const [itemCalories, setItemCalories] = useState("");
  const [itemProtein, setItemProtein] = useState("");
  const [photoCategory, setPhotoCategory] = useState(PHOTO_CATEGORIES[0]!);
  const [photos, setPhotos] = useState<Preview[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [weekFilter, setWeekFilter] = useState(1);
  const [showReset, setShowReset] = useState(false);

  useEffect(() => {
    setEntries(load());
    setSelectedDate(dateISO(new Date()));
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(entries)); }
      catch { /* quota exceeded: show local-only disclaimer */ }
    }
  }, [entries, loaded]);
  async function refreshPhotos() {
    try {
      const all = await getPhotos();
      setPhotos(old => { old.forEach(p => URL.revokeObjectURL(p.url)); return all.sort((a,b)=>b.date.localeCompare(a.date)).map(p=>({id:p.id,date:p.date,category:p.category,url:URL.createObjectURL(p.blob)})); });
    } catch { setPhotoError("Le navigateur ne permet pas de stocker les photos ici."); }
  }
  useEffect(() => { void refreshPhotos(); return () => { /* object URLs revoked on refresh */ }; }, []);

  const currentDate = selectedDate || START;
  const today = entries[currentDate] || emptyEntry(currentDate);
  const day = dayNumber(currentDate);
  const week = weekNumber(currentDate);
  const all = Object.values(entries).sort((a,b)=>a.date.localeCompare(b.date));
  const latestWeight = [...all].reverse().find(e=>e.weight !== undefined)?.weight;
  const latestWaist = [...all].reverse().find(e=>e.waist !== undefined)?.waist;
  const latestSleep = [...all].reverse().find(e=>e.sleepHours !== undefined)?.sleepHours;
  const weeklyComplete = all.filter(e=>weekNumber(e.date)===week && e.done.length >= 3).length;
  const intakeCalories = today.intake.reduce((s,x)=>s+(x.calories||0),0);
  const intakeProtein = today.intake.reduce((s,x)=>s+(x.protein||0),0);

  function edit(patch: Partial<DailyEntry>) {
    setEntries(prev => ({...prev,[currentDate]:{...(prev[currentDate] || emptyEntry(currentDate)),...patch,updatedAt:new Date().toISOString()}}));
  }
  function setNumber(field: "weight"|"waist"|"sleepHours"|"sleepQuality"|"energy"|"stress"|"steps"|"waterMl"|"proteinG"|"activityMinutes", str: string) {
    const n = str.trim() === "" ? undefined : Number(str);
    if (n !== undefined && (!Number.isFinite(n) || n < 0)) return;
    edit({[field]:n});
  }
  function addIntake() {
    if (!itemName.trim()) return;
    const item: IntakeItem = {
      id: crypto.randomUUID(), at: new Date().toISOString(), kind: itemKind,
      name: itemName.trim(), quantity: itemQuantity.trim(),
      ...(itemCalories !== "" && Number.isFinite(Number(itemCalories)) && Number(itemCalories) >= 0 ? {calories:Number(itemCalories)} : {}),
      ...(itemProtein !== "" && Number.isFinite(Number(itemProtein)) && Number(itemProtein) >= 0 ? {protein:Number(itemProtein)} : {}),
    };
    edit({intake:[...today.intake,item]});
    setItemName(""); setItemQuantity(""); setItemCalories(""); setItemProtein("");
  }
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setPhotoBusy(true); setPhotoError("");
    try {
      for (const file of Array.from(files)) {
        if (!PHOTO_TYPES.includes(file.type) && !/\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) throw new Error("Format photo non accepté.");
        if (file.size > 15 * 1024 * 1024) throw new Error("Maximum 15 Mo par photo.");
        await savePhoto({id:crypto.randomUUID(),date:currentDate,category:photoCategory,blob:file,type:file.type});
      }
      await refreshPhotos();
    } catch (e) { setPhotoError((e as Error).message); }
    finally {setPhotoBusy(false);}
  }
  async function resetAll() {
    try {
      const db = await openPhotos();
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction("photos","readwrite");
        tx.objectStore("photos").clear();
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
      db.close();
      localStorage.removeItem(STORE_KEY);
      setEntries({}); setPhotos(old=>{old.forEach(p=>URL.revokeObjectURL(p.url));return [];}); setShowReset(false);
    } catch {setPhotoError("La suppression des photos a échoué.");}
  }
  const reminder = useMemo(()=>intention(today,currentDate),[today,currentDate]);

  return <main className="t90">
    <header className="t90-header">
      <div>
        <Link className="t90-back" href="/">← OIA / Retour aux opportunités</Link>
        <div className="t90-eyebrow">OIA / PERSONAL PERFORMANCE</div>
        <h1>Transformation <span>90</span></h1>
        <p>31 oct. 2026 — 31 janv. 2027 · Ton cockpit personnel, un jour après l'autre.</p>
      </div>
      <div className="t90-status"><strong>JOUR {day} / 93</strong><span>SEMAINE {week} / 13</span></div>
    </header>
    <div className="t90-progress"><div style={{width:Math.min(100,(day/93)*100)+"%"}} /></div>
    <div className="t90-privacy"><strong>Données privées sur cet appareil.</strong> Les mesures, prises et notes sont conservées dans ce navigateur ; les photos dans son stockage local IndexedDB. Pas de synchronisation inter-appareils ni de connexion Apple Santé/Health Connect pour le moment. Sur un appareil partagé, ce stockage n'est pas confidentiel. {state.status==="UNCONFIGURED" ? "L'authentification Supabase n'est pas configurée : n'y dépose aucune donnée sensible sur un ordinateur partagé." : "Le compte OIA ne synchronise pas encore ce module."}</div>
    <nav className="t90-nav" aria-label="Navigation Transformation">
      {([["today","Aujourd'hui"],["journal","Journal & prises"],["weeks","13 semaines"],["photos","Photos"],["care","Soins & budget"]] as [Tab,string][]).map(([key,label])=><button key={key} type="button" className={tab===key?"selected":""} onClick={()=>setTab(key)}>{label}</button>)}
    </nav>
    <div className="t90-content">
      <section className="t90-top">
        <div className="t90-stat"><span>Départ</span><strong>{START_WEIGHT} kg</strong><small>176 cm · IMC initial 29,1</small></div>
        <div className="t90-stat"><span>Dernier poids</span><strong>{latestWeight===undefined?"—":latestWeight+" kg"}</strong><small>Objectif indicatif 84–86 kg</small></div>
        <div className="t90-stat"><span>Tour de taille</span><strong>{latestWaist===undefined?"—":latestWaist+" cm"}</strong><small>À mesurer au nombril</small></div>
        <div className="t90-stat"><span>Dernier sommeil</span><strong>{latestSleep===undefined?"—":latestSleep+" h"}</strong><small>Source déclarative</small></div>
      </section>
      {tab==="today" && <>
        <div className="t90-columns">
          <section className="t90-panel t90-intent">
            <div className="t90-section-head"><span>TON INTENTION DU JOUR</span><label>DATE <input type="date" min={START} max={END} value={currentDate} onChange={e=>setSelectedDate(e.target.value)} /></label></div>
            <h2>{reminder}</h2>
            <p>Une seule mission : construire une journée répétable et respectueuse de la récupération.</p>
            <div className="t90-mini"><span>{weeklyComplete} journée(s) avec au moins 3 rituels cette semaine</span><span>{today.done.length} / {RITUALS.length} rituels cochés aujourd'hui</span></div>
          </section>
          <section className="t90-panel">
            <div className="t90-section-head"><span>CHECK-IN DU MATIN</span><span>2 MINUTES</span></div>
            <div className="t90-form-grid">
              <label>Poids (kg)<input type="number" step="0.1" min="30" max="300" value={today.weight??""} onChange={e=>setNumber("weight",e.target.value)} /></label>
              <label>Tour de taille (cm)<input type="number" step="0.5" min="40" max="200" value={today.waist??""} onChange={e=>setNumber("waist",e.target.value)} /></label>
              <label>Sommeil (heures)<input type="number" step="0.25" min="0" max="24" value={today.sleepHours??""} onChange={e=>setNumber("sleepHours",e.target.value)} /></label>
              <label>Énergie (1–5)<select value={today.energy??""} onChange={e=>setNumber("energy",e.target.value)}><option value="">—</option>{[1,2,3,4,5].map(x=><option key={x}>{x}</option>)}</select></label>
              <label>Stress (1–5)<select value={today.stress??""} onChange={e=>setNumber("stress",e.target.value)}><option value="">—</option>{[1,2,3,4,5].map(x=><option key={x}>{x}</option>)}</select></label>
              <label>Pas<input type="number" min="0" max="100000" value={today.steps??""} onChange={e=>setNumber("steps",e.target.value)} /></label>
            </div>
          </section>
        </div>
        <section className="t90-panel">
          <div className="t90-section-head"><span>MES RITUELS — 44 EN 45 JOURS, VERSION 2026</span><span>MAX 25 MIN LE MATIN</span></div>
          <div className="t90-rituals">{RITUALS.map(r=><label className={"t90-ritual "+(today.done.includes(r.id)?"complete":"")} key={r.id}><input type="checkbox" checked={today.done.includes(r.id)} onChange={e=>edit({done:e.target.checked?[...today.done,r.id]:today.done.filter(x=>x!==r.id)})} /><div><strong>{r.title}</strong><p>{r.detail}</p></div></label>)}</div>
          <p className="t90-note">Ancien programme : CeraVe, vitamine C topique, hydratation et SPF 50 étaient utilisés. La routine du soir validée était douce, sans rétinol automatique. Avec les rougeurs actuelles, vérifier toute reprise d'actif avec un dermatologue.</p>
        </section>
        <section className="t90-panel">
          <div className="t90-section-head"><span>SEMAINE {week} — {WEEKS[week-1]?.title}</span></div>
          <p>{WEEKS[week-1]?.body}</p>
          <button className="t90-btn" onClick={()=>{setWeekFilter(week);setTab("weeks");}}>Voir le calendrier</button>
        </section>
      </>}
      {tab==="journal" && <>
        <section className="t90-panel">
          <div className="t90-section-head"><span>JOURNAL QUOTIDIEN</span><label>DATE <input type="date" min={START} max={END} value={currentDate} onChange={e=>setSelectedDate(e.target.value)} /></label></div>
          <div className="t90-form-grid">
            <label>Eau (ml)<input type="number" min="0" max="10000" value={today.waterMl??""} onChange={e=>setNumber("waterMl",e.target.value)} /></label>
            <label>Protéines estimées (g)<input type="number" min="0" max="400" value={today.proteinG??""} onChange={e=>setNumber("proteinG",e.target.value)} /></label>
            <label>Activité (minutes)<input type="number" min="0" max="500" value={today.activityMinutes??""} onChange={e=>setNumber("activityMinutes",e.target.value)} /></label>
            <label>Qualité sommeil (1–5)<select value={today.sleepQuality??""} onChange={e=>setNumber("sleepQuality",e.target.value)}><option value="">—</option>{[1,2,3,4,5].map(x=><option key={x}>{x}</option>)}</select></label>
          </div>
          <label className="t90-wide-label">Sport / mobilité / padel / stretching<input value={today.training||""} onChange={e=>edit({training:e.target.value})} placeholder="Ex. marche 25 min, gainage 10 min, mollet OK" /></label>
          <label className="t90-wide-label">Notes libres, douleur, humeur, observations<textarea rows={3} value={today.diary||""} onChange={e=>edit({diary:e.target.value})} placeholder="Ce qui a bien fonctionné / ce qui mérite adaptation" /></label>
        </section>
        <section className="t90-panel">
          <div className="t90-section-head"><span>TOUT CE QUE J'AI PRIS AUJOURD'HUI</span><span>REPAS · BOISSONS · COMPLÉMENTS · MÉDICAMENTS</span></div>
          <div className="t90-form-grid">
            <label>Catégorie<select value={itemKind} onChange={e=>setItemKind(e.target.value as IntakeKind)}><option value="repas">Repas / aliment</option><option value="boisson">Boisson</option><option value="complement">Complément</option><option value="medicament">Médicament</option></select></label>
            <label>Nom<input value={itemName} onChange={e=>setItemName(e.target.value)} placeholder="Ex. lentilles, thé, supplément, médicament" /></label>
            <label>Quantité / dosage déclaré<input value={itemQuantity} onChange={e=>setItemQuantity(e.target.value)} placeholder="Ex. 200 g, 1 comprimé" /></label>
            <label>Kcal (si connues)<input type="number" min="0" value={itemCalories} onChange={e=>setItemCalories(e.target.value)} /></label>
            <label>Protéines g (si connues)<input type="number" min="0" value={itemProtein} onChange={e=>setItemProtein(e.target.value)} /></label>
          </div>
          <button className="t90-btn t90-primary" disabled={!itemName.trim()} onClick={addIntake}>+ Ajouter au journal</button>
          <p className="t90-note">Le journal enregistre ce que tu déclares ; il ne recommande pas de dose ni de modification de traitement. Les calories et protéines ne sont pas estimées automatiquement.</p>
          <div className="t90-intake-summary">Total renseigné : {intakeCalories} kcal · {intakeProtein} g de protéines (données partielles si champs vides)</div>
          {today.intake.length ? <div className="t90-records">{today.intake.map(item=><div className="t90-record" key={item.id}><span><strong>{item.name}</strong><small>{item.kind} · {item.quantity || "quantité non notée"} · {new Date(item.at).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</small></span><button aria-label={"Supprimer "+item.name} onClick={()=>edit({intake:today.intake.filter(x=>x.id!==item.id)})}>Supprimer</button></div>)}</div> : <p className="t90-empty">Aucune prise enregistrée à cette date.</p>}
        </section>
        <section className="t90-panel">
          <div className="t90-section-head"><span>HISTORIQUE & EXPORT</span></div>
          <p>{all.length} journée(s) avec données enregistrées. Les informations restent sur cet appareil.</p>
          <button className="t90-btn" onClick={()=>downloadFile("oia-transformation-journal.json",JSON.stringify({version:1,start:START,end:END,entries},null,2))}>Exporter le journal (JSON)</button>
        </section>
      </>}
      {tab==="weeks" && <>
        <section className="t90-panel">
          <div className="t90-section-head"><span>PARCOURS 13 SEMAINES</span><span>PLAN RÉVISABLE</span></div>
          <div className="t90-weeks">{WEEKS.map((w,i)=><button key={i} className={weekFilter===i+1?"active":""} onClick={()=>setWeekFilter(i+1)}>{String(i+1).padStart(2,"0")}</button>)}</div>
          <h2>Semaine {weekFilter} : {WEEKS[weekFilter-1]?.title}</h2>
          <p>{WEEKS[weekFilter-1]?.body}</p>
          <p className="t90-note">Entraînement : viser à terme 2–3 séances de renforcement, 2 sorties de padel maximum les soirs où le mollet le permet, et une mobilité matinale de moins de 25 minutes. Diminuer la charge si douleur ou fatigue importante.</p>
        </section>
        <section className="t90-panel"><div className="t90-section-head"><span>MESURES ENREGISTRÉES</span></div>
          <div className="t90-table-wrap"><table><thead><tr><th>Date</th><th>Poids</th><th>Taille</th><th>Sommeil</th><th>Énergie</th><th>Rituels</th></tr></thead><tbody>{all.length===0?<tr><td colSpan={6}>Aucune mesure pour le moment</td></tr>:[...all].reverse().map(e=><tr key={e.date}><td>{e.date}</td><td>{e.weight??"—"}</td><td>{e.waist??"—"}</td><td>{e.sleepHours??"—"}</td><td>{e.energy??"—"}</td><td>{e.done.length}/4</td></tr>)}</tbody></table></div>
        </section>
      </>}
      {tab==="photos" && <>
        <section className="t90-panel"><div className="t90-section-head"><span>PHOTOS DE RÉFÉRENCE & AVANT / APRÈS</span><span>LOCAL / PRIVÉ SUR CET APPAREIL</span></div>
          <p>Ajoute les mêmes angles toutes les 2 à 4 semaines : lumière, distance, posture et heure similaires. Évite les interprétations médicales à partir d'une seule photo.</p>
          <div className="t90-form-grid"><label>Catégorie<select value={photoCategory} onChange={e=>setPhotoCategory(e.target.value)}>{PHOTO_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label>Date de prise<input type="date" min={START} max={END} value={currentDate} onChange={e=>setSelectedDate(e.target.value)} /></label></div>
          <label className="t90-photo-upload">+ Choisir des photos (maximum 15 Mo chacune)<input type="file" accept="image/*,.heic,.heif" multiple disabled={photoBusy} onChange={e=>{void uploadFiles(e.target.files);e.target.value="";}} /></label>
          {photoError&&<p role="alert" className="t90-error">{photoError}</p>}
          <p className="t90-note">Pour une comparaison, sélectionne le même type de photo à plusieurs dates. Les anciennes photos partagées dans ChatGPT ne sont pas importées automatiquement dans OIA : tu dois les sélectionner ici.</p>
        </section>
        <section className="t90-panel"><div className="t90-section-head"><span>GALERIE PERSONNELLE</span><span>{photos.length} PHOTO(S)</span></div>
          {photos.length===0?<p className="t90-empty">Ta galerie est vide. Commence par les photos du 31 octobre.</p>:<div className="t90-gallery">{photos.map(p=><figure key={p.id}><img alt={p.category+" du "+p.date} src={p.url} /><figcaption><strong>{p.category}</strong><span>{p.date}</span><button onClick={async()=>{await removePhoto(p.id);await refreshPhotos();}}>Supprimer</button></figcaption></figure>)}</div>}
        </section>
      </>}
      {tab==="care" && <>
        <section className="t90-panel"><div className="t90-section-head"><span>PRIORITÉS SANTÉ, VISAGE ET CHEVEUX</span><span>DÉCISION APRÈS CONSULTATION</span></div>
          <div className="t90-care">{CARE.map(c=><article key={c.name}><div><strong>{c.name}</strong><span>{c.when} · {c.priority}</span></div><p>{c.note}</p></article>)}</div>
          <p className="t90-note">À 50 ans et après une déchirure au mollet, pas de reprise explosive du padel sans récupération fonctionnelle. Une greffe capillaire ou une chirurgie des yeux demandent un diagnostic individuel et ne garantissent pas un résultat à trois mois.</p>
        </section>
        <section className="t90-panel"><div className="t90-section-head"><span>ENVELOPPE INDICATIVE</span><span>AED · TOTAL 18 500</span></div>
          <div className="t90-budget">{BUDGET.map(b=><div key={b.label}><span>{b.label}</span><strong>{b.amount.toLocaleString("fr-FR")} AED</strong></div>)}</div>
          <p className="t90-note">Budget de planification, non devis de cliniques. Exclut greffe et chirurgie réfractive : une décision sur ces actes doit faire l'objet de devis et d'un bilan séparés. Budget global disponible : 10 000–25 000 AED.</p>
        </section>
        <section className="t90-panel">
          <div className="t90-section-head"><span>INTÉGRATION SOMMEIL / SANTÉ</span></div>
          <p><strong>Version initiale :</strong> saisie manuelle du sommeil, pas, énergie et mesures. <strong>Étape technique suivante :</strong> synchronisation avec Apple Santé (nécessite une passerelle iOS autorisée) ou Health Connect sur Android (nécessite une application Android autorisée). Un site web Next.js seul ne peut pas lire directement les données de ces applications.</p>
        </section>
      </>}
      <footer className="t90-footer">
        <span>OIA PERSONAL · Aucune donnée photo ni santé n'est ajoutée aux projets Funding.</span>
        <button onClick={()=>setShowReset(!showReset)}>{showReset?"Annuler":"Effacer toutes mes données locales"}</button>
        {showReset&&<button className="t90-danger" onClick={()=>void resetAll()}>Confirmer la suppression irréversible</button>}
      </footer>
    </div>
  </main>;
}
