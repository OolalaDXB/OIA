"use client";

// Porté du prototype Lovable « OIA Dashoard » (commit c6470e86), route TanStack devenue vue Next.
import { Link } from "@/lib/router";
import { useEffect, useState, type ReactNode } from "react";
import { Statut, Check, btnPrimary, btnSecondary, field } from "@/components/oia/ui";
import { VisibilityShell } from "@/components/oia/visibility";
import { useDonnees } from "@/lib/donnees-visibility";



function Etape({ n, titre, actif, fait, children }: { n: number; titre: string; actif: boolean; fait: boolean; children: ReactNode }) {
  return (
    <section className={`grid gap-4 border-t border-border py-8 md:grid-cols-[5rem_1fr] ${!actif && !fait ? "opacity-40" : ""}`} aria-current={actif ? "step" : undefined}>
      <div className="num text-3xl font-normal  text-tertiary">{String(n).padStart(2, "0")}</div>
      <div>
        <h2 className="text-xl">{titre}</h2>
        {(actif || fait) && <div className="mt-5">{children}</div>}
      </div>
    </section>
  );
}

function Toggle<T extends string>(list: T[]) {
  const [sel, setSel] = useState<Set<T>>(new Set(list));
  const cle = list.join("\u0000");
  useEffect(() => { setSel(new Set(list)); }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  return { sel, flip: (x: T) => setSel((s) => { const n = new Set(s); n.has(x) ? n.delete(x) : n.add(x); return n; }) };
}

export function NouveauCompte() {
  const o = useDonnees().onboarding;
  const [step, setStep] = useState(1);
  const [url, setUrl] = useState(o.url);
  const [shown, setShown] = useState(0);
  const [analyse, setAnalyse] = useState(false);
  const [infos, setInfos] = useState({ activite: o.activite, lieu: o.lieu, langues: o.langues });
  const offres = Toggle(o.offres);
  const conc = Toggle(o.concurrents);
  const [cx, setCx] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<"lecture" | "corrections">("lecture");
  const qs = Toggle(o.questions.map((q) => q.q));
  const [detail, setDetail] = useState(false);
  const [lance, setLance] = useState(false);
  useEffect(() => { setUrl(o.url); setInfos({ activite: o.activite, lieu: o.lieu, langues: o.langues }); }, [o]);

  useEffect(() => {
    if (!analyse || shown >= o.constats.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), 450);
    return () => clearTimeout(t);
  }, [analyse, shown]);

  const suite = (n: number) => (
    <button className={`${btnPrimary} mt-6`} onClick={() => setStep(n)}>Continuer</button>
  );

  return (
    <VisibilityShell page="Nouveau compte" active="sites">
      <h1 className="mt-2 text-3xl md:text-4xl">Nouveau compte</h1>
      <p className="mt-2 mb-10 text-muted-foreground">Cinq étapes. Une décision à chaque fois.</p>

      <Etape n={1} titre="Le site" actif={step === 1} fait={step > 1}>
        <form className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); setShown(0); setAnalyse(true); }}>
          <label className="flex-1 text-sm text-muted-foreground">
            Adresse du site
            <input className={`${field} mt-1.5 text-foreground`} value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <button type="submit" className={analyse ? btnSecondary : btnPrimary}>Analyser le site</button>
        </form>
        {analyse && (
          <ul className="mt-6 max-w-xl" aria-live="polite">
            {o.constats.slice(0, shown).map((c, i) => (
              <li key={c} className="flex items-center justify-between border-b border-border py-2.5 text-sm">
                <span>{c}</span>
                {i === 3 || i === 5 ? <Statut etat={i === 5 ? "bloquant" : "verifier"} label={i === 5 ? "Bloquant" : "À vérifier"} /> : <Statut etat="conforme" label="Lu" />}
              </li>
            ))}
          </ul>
        )}
        {shown >= o.constats.length && step === 1 && suite(2)}
      </Etape>

      <Etape n={2} titre="Ce que nous avons compris" actif={step === 2} fait={step > 2}>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
          {(["activite", "lieu", "langues"] as const).map((k) => (
            <label key={k} className="text-sm text-muted-foreground">
              {{ activite: "Activité", lieu: "Lieu", langues: "Langues" }[k]}
              <input className={`${field} mt-1.5 text-foreground`} value={infos[k]} onChange={(e) => setInfos({ ...infos, [k]: e.target.value })} />
            </label>
          ))}
        </div>
        <div className="mt-6 grid max-w-3xl gap-8 sm:grid-cols-2">
          <fieldset><legend className="mb-2 text-sm text-tertiary">Offres</legend>
            {o.offres.map((x) => <Check key={x} label={x} checked={offres.sel.has(x)} onChange={() => offres.flip(x)} />)}
          </fieldset>
          <fieldset><legend className="mb-2 text-sm text-tertiary">Concurrents</legend>
            {o.concurrents.map((x) => <Check key={x} label={x} checked={conc.sel.has(x)} onChange={() => conc.flip(x)} />)}
          </fieldset>
        </div>
        {step === 2 && suite(3)}
      </Etape>

      <Etape n={3} titre="Connexions" actif={step === 3} fait={step > 3}>
        <p className="mb-4 text-sm text-muted-foreground">Toutes facultatives. Vous pourrez les ajouter plus tard.</p>
        <ul className="max-w-3xl">
          {o.connexions.map((c) => (
            <li key={c.nom} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3">
              <div><div className="text-sm">{c.nom}</div><div className="text-sm text-tertiary">{c.detail}</div></div>
              {cx[c.nom] ? <Statut etat="conforme" label="Connecté" /> :
                <button className={btnSecondary} onClick={() => setCx({ ...cx, [c.nom]: true })}>Connecter</button>}
            </li>
          ))}
        </ul>
        <fieldset className="mt-6 max-w-3xl">
          <legend className="mb-2 text-sm text-tertiary">Ce que nous pouvons faire</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {([["lecture", "Lecture seule", "Nous mesurons, vous décidez de tout."], ["corrections", "Proposer des corrections", "Nous préparons les modifications, vous validez."]] as const).map(([v, l, d]) => (
              <label key={v} className={`card flex min-h-11 cursor-pointer gap-3 p-4 ${mode === v ? "border-bar" : ""}`}>
                <input type="radio" name="mode" checked={mode === v} onChange={() => setMode(v)} className="mt-0.5 accent-[var(--primary)]" />
                <span><span className="block text-sm">{l}</span><span className="block text-sm text-tertiary">{d}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {step === 3 && suite(4)}
      </Etape>

      <Etape n={4} titre="Questions" actif={step === 4} fait={step > 4}>
        <p className="mb-4 text-sm text-muted-foreground">Ce que vos clients demandent aux IA. <span className="num">{qs.sel.size}</span> retenues.</p>
        <div className="max-w-3xl">
          {o.questions.map((q) => (
            <Check key={q.q} label={q.q} checked={qs.sel.has(q.q)} onChange={() => qs.flip(q.q)}
              extra={q.marque ? <span className="text-xs text-tertiary">votre marque</span> : undefined} />
          ))}
        </div>
        {step === 4 && suite(5)}
      </Etape>

      <Etape n={5} titre="Lancement" actif={step === 5} fait={false}>
        <dl className="num grid max-w-3xl gap-6 sm:grid-cols-3">
          <div><dt className="text-sm text-tertiary">Durée de mesure</dt><dd className="mt-1 text-4xl font-normal">5 jours</dd></div>
          <div><dt className="text-sm text-tertiary">Questions</dt><dd className="mt-1 text-4xl font-normal">{qs.sel.size}</dd></div>
          <div><dt className="text-sm text-tertiary">Coût estimé</dt><dd className="mt-1 text-4xl font-normal">≈ 2 $</dd></div>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">Assistants interrogés : {o.assistants.join(", ")}.</p>

        <div className="card mt-8 max-w-3xl p-5">
          <h3 className="text-base">Déjà repéré</h3>
          <ul className="mt-3">
            {o.bloquants.map((b) => (
              <li key={b} className="flex gap-3 border-t border-border py-3 text-sm first:border-0">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-block" /><span>{b}</span>
              </li>
            ))}
          </ul>
          <button className="mt-2 min-h-11 text-sm underline underline-offset-4" aria-expanded={detail} onClick={() => setDetail(!detail)}>
            {detail ? "Masquer le détail" : `Voir le détail des ${o.familles.reduce((t, f) => t + f[1] + f[2] + f[3], 0)} contrôles`}
          </button>
          {detail && (
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="num mt-3 w-full min-w-[480px] text-sm">
                <thead className="text-left text-tertiary"><tr className="border-b border-border">
                  <th className="py-2 font-normal">Famille</th>
                  <th className="font-normal"><Statut etat="conforme" label="Conformes" /></th>
                  <th className="font-normal"><Statut etat="bloquant" label="À corriger" /></th>
                  <th className="font-normal"><Statut etat="verifier" label="À vérifier" /></th>
                </tr></thead>
                <tbody>{o.familles.map(([f, a, b, c]) => (
                  <tr key={f} className="border-b border-border last:border-0"><td className="py-2.5 pr-4">{f}</td><td>{a}</td><td>{b}</td><td>{c}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
        {lance ? (
          <p className="mt-6 text-sm"><Statut etat="conforme" label="Mesure lancée. Premiers résultats dans cinq jours." /> <Link to="/sites/$slug" params={{ slug: "studio-ardoise" }} className="ml-3 underline underline-offset-4">Voir le site</Link></p>
        ) : <button className={`${btnPrimary} mt-6`} onClick={() => setLance(true)}>Lancer la première mesure</button>}
      </Etape>
    </VisibilityShell>
  );
}
