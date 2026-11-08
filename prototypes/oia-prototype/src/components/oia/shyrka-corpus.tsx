import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/oia/ui";
import {
  annulerPreparation, confirmerDocument, deciderProposition, effacerFichierDossier, ErreurLocale, etatCorpus, etatSurveillance, examinerFichier, extraitsSource, piloterSurveillance,
  preparerDocument, preparerNote, propositionsCorpus, rechercherCorpus, reindexerSource, retirerSource, sourcesCorpus, TAILLE_MAX_CORPUS,
  type ApercuCorpus, type EtatCorpus, type ExtraitCorpus, type FichierDetecte, type PropositionCorpus, type SourcePrivee, type EtatSurveillance,
} from "@/lib/shyrka-locale";

/**
 * Module Corpus de Shyrka (mandat Corpus local, Mac Studio) : déposer un
 * document, le retrouver par recherche sourcée, valider ce que Shyrka propose
 * d'en retenir. Tout passe par la passerelle du Mac ; hors du Mac, la vue le
 * dit et ne simule rien. Les contenus sont affichés comme du texte, jamais
 * interprétés comme du HTML.
 */

type Vue = "deposer" | "rechercher" | "confirmer";
const message = (e: unknown) => (e instanceof ErreurLocale ? e.message : "La passerelle du Mac n'a pas répondu.");
const taille = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1024 / 1024).toFixed(1)} Mo`);
const jour = (iso: string) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
const FORMES: Record<string, string> = { decision: "Décision", preference: "Préférence ou règle", travail: "Travail en cours", experience: "Expérience" };
const COMPARTIMENTS: [string, string][] = [["personnel", "Personnel — Mac seulement"], ["projet:oia", "Projet OIA"], ["module:shyrka", "Module Shyrka"], ["projet:sillon", "Projet SILLON"], ["projet:coach-gari", "Projet Coach Gari"], ["projet:maisons", "Projet Maisons"]];

function Pastille({ ton, children }: { ton: "ok" | "warn" | "danger" | "neutre"; children: ReactNode }) {
  const c = { ok: "bg-ok", warn: "bg-warn", danger: "bg-destructive", neutre: "bg-track" }[ton];
  return <span className="inline-flex items-center gap-1.5 text-xs"><span aria-hidden className={`size-1.5 rounded-full ${c}`} />{children}</span>;
}

function Alerte({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{children}</p>;
}

export function CorpusVue() {
  const [etat, setEtat] = useState<EtatCorpus | null>(null);
  const [indispo, setIndispo] = useState<string | null>(null);
  const [vue, setVue] = useState<Vue>("deposer");
  const [filtreSource, setFiltreSource] = useState<{ id: string; nom: string } | null>(null);
  const rafraichir = useCallback(async () => {
    try {
      setEtat(await etatCorpus());
      setIndispo(null);
    } catch (e) {
      setEtat(null);
      setIndispo(e instanceof ErreurLocale && e.code !== "http_404" && e.code !== "http_502" ? e.message : "Passerelle locale absente : le Corpus n'est disponible que sur le Mac Studio, passerelle lancée (pnpm shyrka:passerelle).");
    }
  }, []);
  useEffect(() => { void rafraichir(); const t = setInterval(() => void rafraichir(), 4000); return () => clearInterval(t); }, [rafraichir]);

  if (!etat) return <Section titre="Corpus">{indispo ? <Alerte>{indispo}</Alerte> : <p className="text-sm text-muted-foreground">Connexion à la passerelle du Mac…</p>}</Section>;
  const aConfirmer = etat.propositions ?? 0;
  return <div className="grid gap-6">
    <div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        <Pastille ton="ok">Volume chiffré actif</Pastille><span className="mx-2 text-tertiary">·</span>
        {etat.sourcesOia} sources OIA + {etat.sourcesPrivees} source{etat.sourcesPrivees > 1 ? "s" : ""} privée{etat.sourcesPrivees > 1 ? "s" : ""}<span className="mx-2 text-tertiary">·</span>
        {etat.prive ? "propositions masquées (mode privé)" : `${aConfirmer} proposition${aConfirmer > 1 ? "s" : ""} à confirmer`}
      </p>
      <p className="mt-1 text-xs text-tertiary">Recherche par le sens ({etat.modeleSens}) : {etat.avecSens} extrait{etat.avecSens > 1 ? "s" : ""} sur {etat.extraits}{etat.avecSens < etat.extraits ? " (calcul en cours ; les mots servent en attendant)" : ""}. Tout reste sur le Mac.</p>
      {etat.prive && <p className="mt-2 text-xs text-warn">Mode privé : la recherche reste possible ; rien ne peut être ajouté, indexé ni proposé tant qu'il est actif.</p>}
    </div>
    <div role="tablist" aria-label="Actions du Corpus" className="flex flex-wrap gap-2">
      {([["deposer", "Déposer"], ["rechercher", "Rechercher"], ["confirmer", `À confirmer${aConfirmer ? ` (${aConfirmer})` : ""}`]] as const).map(([id, l]) =>
        <Button key={id} role="tab" aria-selected={vue === id} variant={vue === id ? "default" : "outline"} className="min-h-11 font-normal" onClick={() => setVue(id)}>{l}</Button>)}
    </div>
    {vue === "deposer" && <Deposer etat={etat} apres={rafraichir} />}
    {vue === "rechercher" && <Rechercher filtreSource={filtreSource} setFiltreSource={setFiltreSource} apres={rafraichir} />}
    {vue === "confirmer" && <AConfirmer prive={etat.prive} apres={rafraichir} />}
  </div>;
}

// ── Déposer ────────────────────────────────────────────────────────────────

type Carte = { cle: string; nom: string; etat: "analyse" | "refuse" | "apercu" | "envoi" | "indexe" | "deja" | "annule"; apercu?: ApercuCorpus; erreur?: string; source?: string; fichierDossier?: string };

function Deposer({ etat, apres }: { etat: EtatCorpus; apres: () => void }) {
  const [cartes, setCartes] = useState<Carte[]>([]);
  const [survol, setSurvol] = useState(false);
  const [note, setNote] = useState<{ titre: string; texte: string } | null>(null);
  const entree = useRef<HTMLInputElement>(null);
  const maj = (cle: string, p: Partial<Carte>) => setCartes((cs) => cs.map((c) => (c.cle === cle ? { ...c, ...p } : c)));
  const ajouter = (cle: string, nom: string, faire: () => Promise<ApercuCorpus>, fichierDossier?: string) => {
    setCartes((cs) => [{ cle, nom, etat: "analyse", ...(fichierDossier ? { fichierDossier } : {}) }, ...cs]);
    faire().then((a) => maj(cle, { etat: "apercu", apercu: a }), (e) => maj(cle, { etat: "refuse", erreur: message(e) }));
  };
  const deposer = (fichiers: FileList | File[]) => {
    let total = 0;
    for (const f of Array.from(fichiers)) {
      const cle = `${f.name}-${f.size}-${Date.now()}-${Math.random()}`;
      total += f.size;
      if (f.size > TAILLE_MAX_CORPUS) { setCartes((cs) => [{ cle, nom: f.name, etat: "refuse", erreur: "Plus de 25 Mo : refusé avant envoi." }, ...cs]); continue; }
      if (total > 100 * 1024 * 1024) { setCartes((cs) => [{ cle, nom: f.name, etat: "refuse", erreur: "Lot de plus de 100 Mo : dépose ce fichier dans un second temps." }, ...cs]); continue; }
      ajouter(cle, f.name, () => preparerDocument(f));
    }
  };
  const bloque = etat.prive ? "Mode privé actif : rien n'est ajouté au Corpus." : null;
  const deposerSurvol = (e: DragEvent) => { e.preventDefault(); setSurvol(e.type === "dragover"); };
  return <div className="grid gap-6">
    <Section titre="Ajouter au Corpus" aside={<span className="text-xs text-tertiary">.txt · .md · .pdf avec texte · .docx · 25 Mo au plus</span>}>
      <div onDragOver={deposerSurvol} onDragLeave={deposerSurvol} onDrop={(e) => { e.preventDefault(); setSurvol(false); if (!bloque) deposer(e.dataTransfer.files); }}
        className={`grid place-items-center gap-3 rounded-lg border border-dashed px-4 py-10 text-center ${survol ? "border-bar bg-muted/40" : "border-border"}`}>
        <p className="text-sm">{bloque ?? "Glisse un ou plusieurs documents ici"}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button className="min-h-11" disabled={!!bloque} onClick={() => entree.current?.click()}>Choisir des fichiers</Button>
          <Button variant="outline" className="min-h-11 font-normal" disabled={!!bloque} onClick={() => setNote({ titre: "", texte: "" })}>Ajouter une note</Button>
        </div>
        <input ref={entree} type="file" multiple accept=".txt,.md,.markdown,.pdf,.docx,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => { if (e.target.files) deposer(e.target.files); e.target.value = ""; }} />
        <p className="text-xs text-tertiary">Rien n'est enregistré avant « Ajouter au Corpus ». PDF scannés : texte absent, OCR non fait. Audio : prochain jalon.</p>
      </div>
      {note && <form className="mt-4 grid gap-2" onSubmit={(e) => { e.preventDefault(); const n = note; setNote(null); ajouter(`note-${Date.now()}`, n.titre || "Note", () => preparerNote(n.titre, n.texte)); }}>
        <label className="text-xs text-tertiary" htmlFor="note-titre">Titre</label><Input id="note-titre" className="min-h-11" value={note.titre} onChange={(e) => setNote({ ...note, titre: e.target.value })} maxLength={80} />
        <label className="text-xs text-tertiary" htmlFor="note-texte">Note</label><Textarea id="note-texte" rows={5} value={note.texte} onChange={(e) => setNote({ ...note, texte: e.target.value })} maxLength={20000} />
        <div className="flex gap-2"><Button type="submit" className="min-h-11" disabled={!note.texte.trim()}>Prévisualiser</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setNote(null)}>Annuler</Button></div>
      </form>}
    </Section>
    {cartes.length > 0 && <div className="grid gap-4">{cartes.map((c) => <CarteDepot key={c.cle} carte={c} maj={(p) => maj(c.cle, p)} apres={apres} taches={etat.taches} />)}</div>}
    <DossierSurveille prive={etat.prive} etatSurv={etat.surveillance.etat} ajouter={(f) => ajouter(`dossier-${f.id}-${Date.now()}`, f.nom, () => examinerFichier(f.id), f.id)} />
  </div>;
}

function CarteDepot({ carte: c, maj, apres, taches }: { carte: Carte; maj: (p: Partial<Carte>) => void; apres: () => void; taches: EtatCorpus["taches"] }) {
  const a = c.apercu;
  const [compartiment, setCompartiment] = useState("personnel");
  const [conversation, setConversation] = useState(false);
  const [version, setVersion] = useState(true);
  const [atteste, setAtteste] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const confirmer = async () => {
    if (!a) return;
    maj({ etat: "envoi" }); setErreur(null);
    try {
      const r = await confirmerDocument({ jeton: a.jeton, compartiment, conversation, ...(a.memeNom && version ? { nouvelleVersionDe: a.memeNom.id } : {}), attestation: atteste });
      maj({ etat: r.deja ? "deja" : "indexe", source: r.source });
      apres();
    } catch (e) { maj({ etat: "apercu" }); setErreur(message(e)); }
  };
  const tache = c.source ? taches[c.source] : undefined;
  const statut = { analyse: <Pastille ton="neutre">Analyse locale…</Pastille>, refuse: <Pastille ton="danger">Refusé</Pastille>, apercu: a?.etat === "a_verifier" ? <Pastille ton="warn">À vérifier</Pastille> : <Pastille ton="ok">Prêt à indexer</Pastille>, envoi: <Pastille ton="neutre">Ajout…</Pastille>, indexe: <Pastille ton="ok">Indexé</Pastille>, deja: <Pastille ton="neutre">Déjà présent</Pastille>, annule: <Pastille ton="neutre">Annulé</Pastille> }[c.etat];
  return <Section titre={<span className="break-all">{c.nom}</span>} aside={statut}>
    {c.etat === "refuse" && <Alerte>{c.erreur}</Alerte>}
    {c.etat === "annule" && <p className="text-sm text-muted-foreground">Annulé : rien n'a été conservé.</p>}
    {c.etat === "deja" && <p className="text-sm">Ce document est déjà dans le Corpus (même contenu) : aucune nouvelle source, aucun nouveau souvenir.</p>}
    {c.etat === "indexe" && <p className="text-sm">Ajouté au Corpus et consultable.{" "}
      {tache ? (tache.etape === "fini" ? `Sens calculé${tache.propositions !== undefined ? ` · ${tache.propositions} proposition${tache.propositions > 1 ? "s" : ""} à confirmer${tache.ecartees ? `, ${tache.ecartees} écartée${tache.ecartees > 1 ? "s" : ""} (sans citation exacte, doublon ou déjà connue)` : ""}` : ""}.`
        : tache.etape === "erreur" ? `Calcul en échec : ${tache.message}` : tache.etape === "propositions" ? "Shyrka lit le document pour proposer ce qu'il faudrait retenir…" : `Calcul du sens : ${tache.fait}/${tache.total}…`) : ""}</p>}
    {a && (c.etat === "apercu" || c.etat === "envoi") && <div className="grid gap-4">
      <p className="text-xs text-tertiary">{a.type.toUpperCase()} · {taille(a.taille)}{a.pages ? ` · ${a.pages} page${a.pages > 1 ? "s" : ""}` : ""} · {a.passages} extrait{a.passages > 1 ? "s" : ""} à indexer</p>
      <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 text-xs leading-relaxed">{a.apercu}{a.apercu.length >= 1500 ? "\n…" : ""}</pre>
      {a.dejaPresent && <Alerte>Déjà présent dans le Corpus (« {a.dejaPresent.nom} ») : confirmer ne créera pas de doublon.</Alerte>}
      {a.retireLe && <p className="text-xs text-warn">Ce contenu avait été retiré du Corpus le {jour(a.retireLe)}.</p>}
      {a.avertissements.map((x) => <p key={x} className="text-xs text-tertiary">{x}</p>)}
      {a.etat === "a_verifier" && <div className="rounded-md border border-warn/50 p-3 text-sm"><p className="mb-2">Contrôle de confidentialité : {a.motifs.join(" ; ")}.</p>
        <label className="flex min-h-11 items-center gap-2"><Checkbox checked={atteste} onCheckedChange={(v) => setAtteste(v === true)} />J'ai le droit de garder ce document tel quel (sinon : dépose une version nettoyée).</label></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm"><span className="text-xs text-tertiary">Projet ou compartiment</span>
          <select className="min-h-11 rounded-md border border-border bg-background px-2 text-sm" value={compartiment} onChange={(e) => setCompartiment(e.target.value)}>{COMPARTIMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <div className="grid gap-1 text-sm"><span className="text-xs text-tertiary">Droits</span>
          <label className="flex min-h-11 items-center gap-2"><Checkbox checked={conversation} onCheckedChange={(v) => setConversation(v === true)} />Shyrka peut s'en servir dans mes conversations sur le Mac (modèle local)</label>
          <span className="text-xs text-tertiary">Jamais le cockpit, un agent ni un modèle en ligne.</span></div>
      </div>
      {a.memeNom && <label className="flex min-h-11 items-center gap-2 text-sm"><Checkbox checked={version} onCheckedChange={(v) => setVersion(v === true)} />Nouvelle version de « {a.memeNom.nom} » (v{a.memeNom.version} ne sera plus servie)</label>}
      {erreur && <Alerte>{erreur}</Alerte>}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={c.etat === "envoi" || (a.etat === "a_verifier" && !atteste)} onClick={() => void confirmer()}>Ajouter au Corpus</Button>
        <Button variant="ghost" className="min-h-11" disabled={c.etat === "envoi"} onClick={() => { void annulerPreparation(a.jeton).catch(() => undefined); maj({ etat: "annule" }); }}>Annuler</Button>
      </div>
    </div>}
  </Section>;
}

function DossierSurveille({ prive, etatSurv, ajouter }: { prive: boolean; etatSurv: EtatSurveillance; ajouter: (f: FichierDetecte) => void }) {
  const [fichiers, setFichiers] = useState<FichierDetecte[]>([]);
  const [etat, setEtat] = useState(etatSurv);
  const [erreur, setErreur] = useState<string | null>(null);
  const [aEffacer, setAEffacer] = useState<string | null>(null);
  useEffect(() => setEtat(etatSurv), [etatSurv]);
  useEffect(() => {
    if (etat !== "active") { setFichiers([]); return; }
    const lire = () => void etatSurveillance().then((r) => { setEtat(r.etat); setFichiers(r.aExaminer); }, () => undefined);
    lire(); const t = setInterval(lire, 3000); return () => clearInterval(t);
  }, [etat]);
  const piloter = async (a: "activer" | "pause" | "arreter") => { setErreur(null); try { setEtat((await piloterSurveillance(a)).etat); } catch (e) { setErreur(message(e)); } };
  const libelle = { arretee: "Arrêté", active: "Actif", pause: "En pause", volume_absent: "Volume absent : arrêté" }[etat];
  return <Section titre="Dossier « Déposer dans Shyrka »" aside={<Pastille ton={etat === "active" ? "ok" : "neutre"}>{libelle}</Pastille>}>
    <p className="mb-3 text-sm text-muted-foreground">Sur le volume chiffré. Un fichier copié dedans est signalé ici, jamais importé sans ta confirmation. Désactivé par défaut, sans son.</p>
    <div className="flex flex-wrap gap-2">
      {etat !== "active" ? <Button variant="outline" className="min-h-11 font-normal" disabled={prive} onClick={() => void piloter("activer")}>Activer</Button> : <Button variant="outline" className="min-h-11 font-normal" onClick={() => void piloter("pause")}>Mettre en pause</Button>}
      {etat !== "arretee" && <Button variant="ghost" className="min-h-11 font-normal" onClick={() => void piloter("arreter")}>Arrêter</Button>}
    </div>
    {erreur && <div className="mt-3"><Alerte>{erreur}</Alerte></div>}
    {etat === "active" && <p className="mt-3 text-sm" aria-live="polite">{fichiers.length ? `${fichiers.length} fichier${fichiers.length > 1 ? "s" : ""} à examiner` : "Aucun fichier à examiner."}</p>}
    {fichiers.length > 0 && <ul className="mt-2">{fichiers.map((f) => <li key={f.id} className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm last:border-0">
      <span className="min-w-0 flex-1 break-all">{f.nom} <span className="text-xs text-tertiary">· {taille(f.taille)}</span></span>
      <Button size="sm" className="min-h-11" onClick={() => ajouter(f)}>Examiner</Button>
      {aEffacer === f.id ? <><span className="text-xs">Effacer ce fichier du dossier ?</span><Button size="sm" variant="ghost" className="min-h-11" onClick={() => { void effacerFichierDossier(f.id).then(() => setFichiers((x) => x.filter((y) => y.id !== f.id))); setAEffacer(null); }}>Oui, effacer</Button><Button size="sm" variant="ghost" className="min-h-11" onClick={() => setAEffacer(null)}>Non</Button></>
        : <Button size="sm" variant="ghost" className="min-h-11 font-normal" onClick={() => setAEffacer(f.id)}>Refuser</Button>}
    </li>)}</ul>}
  </Section>;
}

// ── Rechercher ─────────────────────────────────────────────────────────────

function Rechercher({ filtreSource, setFiltreSource, apres }: { filtreSource: { id: string; nom: string } | null; setFiltreSource: (s: { id: string; nom: string } | null) => void; apres: () => void }) {
  const [q, setQ] = useState("");
  const [compartiment, setCompartiment] = useState("");
  const [res, setRes] = useState<{ mode: string; resultats: ExtraitCorpus[]; ms: number } | null>(null);
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [origine, setOrigine] = useState<{ nom: string; extraits: ExtraitCorpus[] } | null>(null);
  const chercher = async () => {
    if (!q.trim()) return;
    setCharge(true); setErreur(null);
    try { setRes(await rechercherCorpus(q.trim(), { ...(filtreSource ? { source: filtreSource.id } : {}), ...(compartiment ? { compartiment } : {}) })); } catch (e) { setErreur(message(e)); } finally { setCharge(false); }
  };
  const voirOrigine = async (id: string, nom: string) => { try { setOrigine({ nom, extraits: (await extraitsSource(id)).extraits }); } catch (e) { setErreur(message(e)); } };
  return <div className="grid gap-6">
    <Section titre="Rechercher dans le Corpus">
      <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void chercher(); }}>
        <label className="sr-only" htmlFor="corpus-q">Question ou mots</label>
        <div className="flex flex-wrap gap-2"><Input id="corpus-q" className="min-h-11 min-w-0 flex-1" placeholder="Une question, une phrase, un identifiant (ml_toutes_v1)…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} /><Button type="submit" className="min-h-11" disabled={charge || !q.trim()}>{charge ? "Recherche…" : "Rechercher"}</Button></div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <select aria-label="Projet" className="min-h-11 rounded-md border border-border bg-background px-2 text-sm" value={compartiment} onChange={(e) => setCompartiment(e.target.value)}><option value="">Tous les projets</option>{COMPARTIMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {filtreSource && <span className="inline-flex items-center gap-2 text-xs">Dans « {filtreSource.nom} »<Button type="button" size="sm" variant="ghost" className="min-h-11" onClick={() => setFiltreSource(null)}>Tout le Corpus</Button></span>}
        </div>
      </form>
      {erreur && <div className="mt-3"><Alerte>{erreur}</Alerte></div>}
      {res && <div className="mt-5">
        <p className="mb-3 text-xs text-tertiary">{res.resultats.length} résultat{res.resultats.length > 1 ? "s" : ""} · {res.mode === "sens" ? "par le sens et les identifiants exacts" : "par les mots (sens indisponible)"} · {res.ms} ms</p>
        {res.resultats.length === 0 ? <p className="text-sm text-muted-foreground">Rien de pertinent dans le Corpus. Shyrka ne complète pas.</p> : <ul>{res.resultats.map((r, i) => <Resultat key={`${r.source}-${r.ref}-${i}`} r={r} voir={() => void voirOrigine(r.source, r.titre)} dans={() => { setFiltreSource({ id: r.source, nom: r.titre }); setRes(null); }} />)}</ul>}
      </div>}
    </Section>
    {origine && <Section titre={`Origine : ${origine.nom}`} aside={<Button size="sm" variant="ghost" className="min-h-11" onClick={() => setOrigine(null)}>Fermer</Button>}>
      <ol>{origine.extraits.map((e, i) => <li key={i} className="border-b border-border py-2 text-sm last:border-0"><p className="mb-1 text-xs text-tertiary">{e.ref} · {e.section}</p><p className="whitespace-pre-wrap break-words">{e.extrait}</p></li>)}</ol>
    </Section>}
    <SourcesPrivees voir={voirOrigine} dans={(id, nom) => setFiltreSource({ id, nom })} apres={apres} />
  </div>;
}

function Resultat({ r, voir, dans }: { r: ExtraitCorpus; voir: () => void; dans: () => void }) {
  const prive = r.connecteur !== "depot-git";
  return <li className="border-b border-border py-3 last:border-0">
    <p className="text-sm">{r.titre} <span className="text-xs text-tertiary">· {r.compartiment} · {prive ? "document privé, Mac seulement" : "dépôt OIA"}</span></p>
    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{r.extrait}</p>
    <p className="mt-1 text-xs text-tertiary">{r.citation} · § {r.section} · version {r.version} · source du {jour(r.dateSource)} · indexé le {jour(r.indexeLe)}{r.mode === "sens" ? ` · proximité ${r.score.toFixed(2)}${r.sousLeSeuil ? " (pertinence faible)" : ""}` : ""}{r.identifiant ? " · identifiant exact" : ""}</p>
    {prive && <div className="mt-1 flex flex-wrap gap-1"><Button size="sm" variant="ghost" className="min-h-11 font-normal" onClick={voir}>Voir l'origine</Button><Button size="sm" variant="ghost" className="min-h-11 font-normal" onClick={dans}>Rechercher dans la source</Button></div>}
  </li>;
}

function SourcesPrivees({ voir, dans, apres }: { voir: (id: string, nom: string) => void; dans: (id: string, nom: string) => void; apres: () => void }) {
  const [sources, setSources] = useState<SourcePrivee[] | null>(null);
  const [aRetirer, setARetirer] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const lire = useCallback(() => void sourcesCorpus().then((r) => setSources(r.sources), (e) => setInfo(message(e))), []);
  useEffect(() => { lire(); const t = setInterval(lire, 5000); return () => clearInterval(t); }, [lire]);
  const actives = (sources ?? []).filter((s) => s.statut !== "revoque");
  return <Section titre="Sources privées" aside={<span className="num text-sm text-tertiary">{actives.length}</span>}>
    {info && <p role="status" className="mb-3 text-sm">{info}</p>}
    {!sources ? <p className="text-sm text-muted-foreground">Chargement…</p> : actives.length === 0 ? <p className="text-sm text-muted-foreground">Aucun document privé pour l'instant. Les 18 documents du dépôt OIA sont consultables par la recherche.</p>
      : <ul>{actives.map((s) => <li key={s.id} className="border-b border-border py-3 text-sm last:border-0">
        <p className="break-all">{s.nom}</p>
        <p className="mt-1 text-xs text-tertiary">{s.type.toUpperCase()} · {s.compartiment} · {s.lecteurs.includes("conversation") ? "lu par Shyrka en conversation (Mac)" : "toi seul"} · v{s.version} · ajouté le {jour(s.dateImport)} · empreinte {s.empreinte.slice(0, 12)}{s.statut === "echec" ? " · réindexation en échec" : ""}{s.tache && s.tache.etape !== "fini" ? ` · ${s.tache.etape} ${s.tache.fait}/${s.tache.total}` : ""}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Button size="sm" variant="ghost" className="min-h-11 font-normal" onClick={() => voir(s.id, s.nom)}>Voir l'origine</Button>
          <Button size="sm" variant="ghost" className="min-h-11 font-normal" onClick={() => dans(s.id, s.nom)}>Rechercher dans la source</Button>
          <Button size="sm" variant="ghost" className="min-h-11 font-normal" onClick={() => void reindexerSource(s.id).then((r) => setInfo(`« ${s.nom} » réindexé : ${r.extraits} extraits.`), (e) => setInfo(message(e)))}>Réindexer</Button>
          {aRetirer === s.id ? <><span className="text-xs">Retirer du Corpus (index et copie admise effacés) ?</span>
            <Button size="sm" variant="ghost" className="min-h-11" onClick={() => void retirerSource(s.id).then((r) => { setInfo(`« ${s.nom} » retiré. ${r.propositionsRetirees} proposition(s) en attente retirée(s)${r.souvenirsValidesConserves ? ` ; ${r.souvenirsValidesConserves} souvenir(s) déjà validé(s) conservé(s) : tu peux les oublier dans la mémoire` : ""}. Ton fichier d'origine n'est pas touché.`); setARetirer(null); lire(); apres(); }, (e) => setInfo(message(e)))}>Oui, retirer</Button>
            <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setARetirer(null)}>Non</Button></>
            : <Button size="sm" variant="ghost" className="min-h-11 font-normal" onClick={() => setARetirer(s.id)}>Retirer du Corpus</Button>}
        </div>
      </li>)}</ul>}
  </Section>;
}

// ── À confirmer ────────────────────────────────────────────────────────────

function AConfirmer({ prive, apres }: { prive: boolean; apres: () => void }) {
  const [donnees, setDonnees] = useState<{ total: number; reportees: number; lot: PropositionCorpus[] } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState<string | null>(null);
  const lire = useCallback(() => void propositionsCorpus().then(setDonnees, (e) => setErreur(message(e))), []);
  useEffect(() => { if (!prive) lire(); }, [lire, prive]);
  if (prive) return <Section titre="À confirmer"><p className="text-sm text-muted-foreground">Mode privé : la mémoire n'est ni consultée ni modifiée.</p></Section>;
  const decider = async (p: PropositionCorpus, action: "valider" | "corriger" | "refuser" | "reporter", contenu?: string) => {
    setErreur(null);
    try {
      await deciderProposition(p.id, action, contenu);
      setFait({ valider: "Validé : Shyrka le retient comme souvenir confirmé.", corriger: "Corrigé et validé.", refuser: "Refusé : la proposition est oubliée et ne reviendra pas.", reporter: "Reporté d'une semaine." }[action]);
      lire(); apres();
    } catch (e) { setErreur(message(e)); }
  };
  return <Section titre="À confirmer" aside={donnees && <span className="text-xs text-tertiary">{donnees.total} en attente{donnees.reportees ? ` · ${donnees.reportees} reportée(s)` : ""}</span>}>
    <p className="mb-4 text-sm text-muted-foreground">Ce que Shyrka propose de retenir. Rien n'est un souvenir tant que tu ne l'as pas validé ; une proposition n'est jamais présentée comme ta décision.</p>
    {fait && <p role="status" className="mb-3 text-sm">{fait}</p>}
    {erreur && <div className="mb-3"><Alerte>{erreur}</Alerte></div>}
    {!donnees ? <p className="text-sm text-muted-foreground">Chargement…</p> : donnees.lot.length === 0 ? <p className="text-sm text-muted-foreground">Rien à confirmer.</p>
      : <ul className="grid gap-4">{donnees.lot.map((p) => <CarteProposition key={p.id} p={p} decider={(a, c) => void decider(p, a, c)} />)}</ul>}
    {donnees && donnees.total > donnees.lot.length && <p className="mt-3 text-xs text-tertiary">Lot de {donnees.lot.length} sur {donnees.total} : les suivantes apparaissent une fois celles-ci traitées.</p>}
  </Section>;
}

function CarteProposition({ p, decider }: { p: PropositionCorpus; decider: (a: "valider" | "corriger" | "refuser" | "reporter", contenu?: string) => void }) {
  const [edition, setEdition] = useState<string | null>(null);
  const d = p.details;
  return <li className="rounded-lg border border-border p-4">
    <p className="mb-1 text-xs text-tertiary">{FORMES[p.forme] ?? p.forme} · {p.compartiment} · {p.portee === "local_seulement" ? "Mac seulement" : p.portee} · proposée le {jour(p.date)} · incertitude {d.incertitude ?? "?"}</p>
    {edition !== null ? <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); decider("corriger", edition); }}>
      <label className="sr-only" htmlFor={`corr-${p.id}`}>Énoncé corrigé</label><Textarea id={`corr-${p.id}`} rows={3} value={edition} onChange={(e) => setEdition(e.target.value)} maxLength={2000} />
      <div className="flex gap-2"><Button type="submit" className="min-h-11" disabled={!edition.trim()}>Enregistrer et valider</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setEdition(null)}>Annuler</Button></div>
    </form> : <p className="text-sm">{p.enonce}</p>}
    {d.citation && <blockquote className="mt-3 border-l-2 border-border pl-3 text-sm text-muted-foreground">« {d.citation} »</blockquote>}
    <p className="mt-1 text-xs text-tertiary">{d.document ? `${d.document} · ` : ""}{d.ref ?? ""}{d.version ? ` · version ${d.version}` : ""}{d.raison ? ` · ${d.raison}` : ""}</p>
    <p className="mt-1 text-xs text-tertiary">{p.provenance}</p>
    {p.proches.length > 0 && <div className="mt-3 text-xs"><p className="text-tertiary">Souvenirs validés proches (doublon ou contradiction ?) :</p><ul className="mt-1 list-disc pl-5">{p.proches.map((x) => <li key={x.id}>{x.contenu}</li>)}</ul></div>}
    {edition === null && <div className="mt-3 flex flex-wrap gap-2">
      <Button className="min-h-11" onClick={() => decider("valider")}>Valider</Button>
      <Button variant="outline" className="min-h-11 font-normal" onClick={() => setEdition(p.enonce)}>Corriger</Button>
      <Button variant="ghost" className="min-h-11 font-normal" onClick={() => decider("refuser")}>Refuser</Button>
      <Button variant="ghost" className="min-h-11 font-normal" onClick={() => decider("reporter")}>Reporter</Button>
    </div>}
  </li>;
}
