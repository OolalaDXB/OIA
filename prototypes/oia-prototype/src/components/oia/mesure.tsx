import { createContext, useContext, useState, type ReactNode } from "react";
import type { Fenetre, Valeur } from "@/lib/donnees/visibility";
import { useVisibilityDonnees } from "@/lib/donnees/provider";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { couleursGraphique } from "@/components/oia/graphiques";

type Filtres = { assistant: string; famille: string; fenetre: string; set: (k: "assistant" | "famille" | "fenetre", v: string) => void; fenetreActive: Fenetre };
const Ctx = createContext<Filtres | null>(null);
export function FiltresProvider({ children }: { children: ReactNode }) {
  const { fenetres } = useVisibilityDonnees();
  const [f, setF] = useState({ assistant: "Tous", famille: "Toutes", fenetre: "f2" });
  const fenetreActive = fenetres.find((x) => x.id === f.fenetre) ?? fenetres[1];
  return <Ctx.Provider value={{ ...f, fenetreActive, set: (k, v) => setF((p) => ({ ...p, [k]: v })) }}>{children}</Ctx.Provider>;
}
export function useFiltres() {
  const c = useContext(Ctx);
  if (!c) throw new Error("Filtres Visibility indisponibles.");
  return c;
}

const select = "min-h-11 rounded-md border border-border bg-background px-2 text-sm text-muted-foreground";
export function FiltresVisibility() {
  const { assistants, familles, fenetres } = useVisibilityDonnees();
  const f = useFiltres();
  return <div role="group" aria-label="Filtres" className="mb-6 flex flex-wrap gap-3 text-sm">
    <label className="flex items-center gap-2 text-tertiary">Assistant<select className={select} value={f.assistant} onChange={(e) => f.set("assistant", e.target.value)}><option>Tous</option>{assistants.map((a) => <option key={a.nom}>{a.nom}</option>)}</select></label>
    <label className="flex items-center gap-2 text-tertiary">Famille de questions<select className={select} value={f.famille} onChange={(e) => f.set("famille", e.target.value)}><option>Toutes</option>{familles.map((a) => <option key={a}>{a}</option>)}</select></label>
    <label className="flex items-center gap-2 text-tertiary">Fenêtre de mesure<select className={select} value={f.fenetre} onChange={(e) => f.set("fenetre", e.target.value)}>{fenetres.map((w) => <option key={w.id} value={w.id}>{w.label}{w.enCours ? " (en cours)" : ""}</option>)}</select></label>
  </div>;
}

/** Règle d'affichage : en cours = pas de chiffre définitif ; null = non mesurable ; rouge seulement si définitif et significatif. */
export function texteChiffre(val: Valeur, fen: Fenetre, unite = " %") {
  if (fen.enCours) return { principal: `Mesure en cours, jour ${fen.jour} sur 5`, intervalle: null as string | null };
  if (val.v === null) return { principal: "non mesurable", intervalle: null };
  return { principal: `${String(val.v).replace(".", ",")}${unite}`, intervalle: `${String(val.min).replace(".", ",")} à ${String(val.max).replace(".", ",")}${unite}` };
}
export function Chiffre({ val, fen, unite = " %", alerte = false, grand = false }: { val: Valeur; fen: Fenetre; unite?: string | undefined; alerte?: boolean | undefined; grand?: boolean }) {
  const t = texteChiffre(val, fen, unite);
  const definitif = !fen.enCours && val.v !== null;
  return <div>
    <div className={`num ${definitif ? (grand ? "text-4xl" : "text-base") : "text-sm text-muted-foreground"} ${definitif && alerte ? "text-block" : ""}`}>{t.principal}</div>
    {t.intervalle && <div className="num mt-1 text-xs text-tertiary">Intervalle {t.intervalle}</div>}
  </div>;
}
export function Indicateur({ titre, val, fen, unite, alerte, extra }: { titre: string; val: Valeur; fen: Fenetre; unite?: string | undefined; alerte?: boolean | undefined; extra?: ReactNode }) {
  return <div className="card min-w-0 p-5"><h3 className="mb-3 text-sm text-muted-foreground">{titre}</h3><Chiffre val={val} fen={fen} unite={unite} alerte={alerte} grand />{extra}</div>;
}
export function NoteMesure() { const { NOTE_MESURE } = useVisibilityDonnees(); return <p className="mt-10 border-t border-border pt-4 text-xs text-tertiary">{NOTE_MESURE}</p>; }

export function Surligne({ texte, marque, concurrents }: { texte: string; marque: string; concurrents: string[] }) {
  const noms = [marque, ...concurrents].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${noms.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
  return <>{texte.split(re).map((p, i) => p === marque ? <mark key={i} className="rounded-sm bg-track px-0.5 text-foreground underline decoration-module-visibility underline-offset-4">{p}</mark> : concurrents.includes(p) ? <mark key={i} className="rounded-sm bg-muted px-0.5 text-foreground">{p}</mark> : <span key={i}>{p}</span>)}</>;
}

export function Courbe({ fenetres: x, lignes }: { fenetres: string[]; lignes: { nom: string; marque: boolean; v: number[] }[] }) {
  const data = x.map((fenetre, i) => Object.fromEntries([["fenetre", fenetre], ...lignes.map((l) => [l.nom, l.v[i] ?? null])]));
  return <figure aria-label="Présence dans le temps, la marque et ses concurrents" className="min-w-0">
    <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
      <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="fenetre" tick={{ fill: "var(--tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
      <YAxis domain={[0, 50]} tickFormatter={(v: number) => `${v} %`} width={44} tick={{ fill: "var(--tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
      <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div role="status" className="rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-card"><p className="mb-2 font-medium">{label}</p>{payload.map((p) => <div key={String(p.dataKey)} className="num flex items-center justify-between gap-5 py-1"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-sm" style={{ backgroundColor: p.color }} />{p.name}</span><span>{p.value} %</span></div>)}</div> : null} />
      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
      {lignes.map((l, j) => <Line key={l.nom} type="linear" dataKey={l.nom} stroke={couleursGraphique[j % couleursGraphique.length]} strokeWidth={l.marque ? 2.5 : 1.8} dot={{ r: 3 }} activeDot={{ r: 5 }} isAnimationActive={false} />)}
    </LineChart></ResponsiveContainer></div>
  </figure>;
}
