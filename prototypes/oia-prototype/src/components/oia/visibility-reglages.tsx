import { useState, type FormEvent, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Section } from "@/components/oia/ui";
import { VueMoteurs } from "@/components/oia/visibility-moteurs";
import { LogoMarque } from "@/components/oia/visibility-identites";
import { FaviconSource, LogoReseau } from "@/components/oia/identites";
import { useReglagesVisibility, useVisibilityDonnees } from "@/lib/donnees/provider";
import { cleNormalisee, contientNormalise, normaliserSite } from "@/lib/visibility-reglages";

const classeOnglet = "min-h-12 rounded-none border-b-2 border-transparent px-2 font-normal text-muted-foreground data-[state=active]:border-module-visibility data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
const classeLigne = "flex flex-wrap items-center justify-between gap-3 border-b border-border py-2.5 text-sm last:border-0";
const classeChamp = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring";

function Champ({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs text-tertiary"><span>{label}</span>{children}</label>;
}

function FormulaireLocal({
  titre,
  children,
  onAjouter,
}: {
  titre: string;
  children: ReactNode;
  onAjouter: (donnees: FormData) => string | undefined;
}) {
  const { pret } = useReglagesVisibility();
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  function soumettre(evenement: FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const resultat = onAjouter(new FormData(evenement.currentTarget));
    if (typeof resultat === "string") {
      setErreur(resultat);
      return;
    }
    setErreur(null);
    setOuvert(false);
  }

  if (!ouvert) {
    return <Button type="button" variant="outline" className="min-h-11" disabled={!pret} onClick={() => setOuvert(true)}><Plus aria-hidden="true" />{titre}</Button>;
  }
  return <form className="grid gap-4 rounded-md border border-border p-4" onSubmit={soumettre}>
    <h3 className="text-sm">{titre}</h3>
    {children}
    <div className="flex flex-wrap gap-2">
      <Button type="submit" className="min-h-11">Ajouter</Button>
      <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setOuvert(false); setErreur(null); }}>Annuler</Button>
    </div>
    {erreur && <p role="alert" className="text-sm text-block">{erreur}</p>}
  </form>;
}

function Retirer({ label, onRetirer }: { label: string; onRetirer: () => void }) {
  return <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0" aria-label={`Retirer ${label}`} title={`Retirer ${label}`} onClick={onRetirer}><X aria-hidden="true" /></Button>;
}

function MarqueLocale() {
  return <span className="text-[10px] font-normal text-tertiary">Ajout local</span>;
}

export function VueReglages() {
  const { marque, concurrents, questions, familles } = useVisibilityDonnees();
  const { ajouts, modifier, pret, erreur } = useReglagesVisibility();

  return <Tabs defaultValue="marque">
    <TabsList aria-label="Réglages Visibility" className="mb-4 h-auto justify-start gap-2 rounded-none border-b border-border bg-transparent p-0">
      {([["marque", "Marque"], ["concurrents", "Concurrents"], ["questions", "Questions"], ["moteurs", "Moteurs"]] as const).map(([valeur, label]) => <TabsTrigger key={valeur} value={valeur} className={classeOnglet}>{label}</TabsTrigger>)}
    </TabsList>
    <p className="mb-6 text-xs text-tertiary" role="status">{pret ? "Vos ajouts sont conservés dans ce navigateur. Ils ne lancent aucune mesure et ne modifient pas les données de démonstration." : "Ouverture des réglages locaux…"}</p>
    {erreur && <p role="alert" className="mb-6 text-sm text-block">Le navigateur refuse la sauvegarde. Les ajouts restent visibles pendant cette visite, mais pourraient être perdus au rechargement.</p>}

    <TabsContent value="marque">
      <Section titre="Marque">
        <div className={classeLigne}><span className="text-tertiary">Nom</span><span>{marque.nom}</span></div>
        <div className={classeLigne}>
          <span className="text-tertiary">Sites</span>
          <div className="grid gap-1">{marque.sites.map((site) => {
            const local = ajouts.sites.includes(site);
            return <span key={site} className="flex min-h-8 items-center justify-end gap-2"><FaviconSource source={site} petite /><span>{site}</span>{local && <><MarqueLocale /><Retirer label={site} onRetirer={() => modifier((actuel) => ({ ...actuel, sites: actuel.sites.filter((x) => x !== site) }))} /></>}</span>;
          })}</div>
        </div>
        <div className={classeLigne}>
          <span className="text-tertiary">Alias</span>
          <div className="grid gap-1">{marque.alias.map((alias) => {
            const local = ajouts.alias.includes(alias);
            return <span key={alias} className="flex min-h-8 items-center justify-end gap-2"><span>{alias}</span>{local && <><MarqueLocale /><Retirer label={alias} onRetirer={() => modifier((actuel) => ({ ...actuel, alias: actuel.alias.filter((x) => x !== alias) }))} /></>}</span>;
          })}</div>
        </div>
        {marque.profils.map((profil) => {
          const local = ajouts.profils.some((x) => x.reseau === profil.reseau && x.handle === profil.handle);
          return <div key={`${profil.reseau}-${profil.handle}`} className={classeLigne}><span className="flex items-center gap-2 text-tertiary"><LogoReseau nom={profil.reseau} petite />{profil.reseau}</span><span className="flex items-center gap-2">{profil.handle}{local && <><MarqueLocale /><Retirer label={`${profil.reseau} ${profil.handle}`} onRetirer={() => modifier((actuel) => ({ ...actuel, profils: actuel.profils.filter((x) => !(x.reseau === profil.reseau && x.handle === profil.handle)) }))} /></>}</span></div>;
        })}
        <div className="mt-6 grid gap-3">
          <FormulaireLocal titre="Ajouter un site" onAjouter={(donnees) => {
            const site = normaliserSite(String(donnees.get("site") ?? ""));
            if (!site) return "Saisissez un domaine valide, par exemple exemple.fr.";
            if (contientNormalise(marque.sites, site)) return "Ce site est déjà présent.";
            modifier((actuel) => ({ ...actuel, sites: [...actuel.sites, site] }));
            return undefined;
          }}><Champ label="Domaine du site"><Input name="site" className="min-h-11" placeholder="exemple.fr" required maxLength={200} autoComplete="url" /></Champ></FormulaireLocal>
          <FormulaireLocal titre="Ajouter un alias" onAjouter={(donnees) => {
            const alias = String(donnees.get("alias") ?? "").trim();
            if (contientNormalise(marque.alias, alias)) return "Cet alias est déjà présent.";
            modifier((actuel) => ({ ...actuel, alias: [...actuel.alias, alias] }));
            return undefined;
          }}><Champ label="Autre nom de la marque"><Input name="alias" className="min-h-11" required maxLength={120} /></Champ></FormulaireLocal>
          <FormulaireLocal titre="Ajouter un profil social" onAjouter={(donnees) => {
            const reseau = String(donnees.get("reseau") ?? "");
            const handle = String(donnees.get("handle") ?? "").trim();
            if (marque.profils.some((x) => x.reseau === reseau && cleNormalisee(x.handle) === cleNormalisee(handle))) return "Ce profil est déjà présent.";
            modifier((actuel) => ({ ...actuel, profils: [...actuel.profils, { reseau, handle }] }));
            return undefined;
          }}><div className="grid gap-4 sm:grid-cols-2"><Champ label="Réseau"><select name="reseau" className={classeChamp}>{["Instagram", "TikTok", "Facebook", "YouTube", "Google"].map((reseau) => <option key={reseau}>{reseau}</option>)}</select></Champ><Champ label="Identifiant ou nom du profil"><Input name="handle" className="min-h-11" required maxLength={120} /></Champ></div></FormulaireLocal>
        </div>
      </Section>
    </TabsContent>

    <TabsContent value="concurrents">
      <Section titre="Concurrents">
        {concurrents.map((concurrent) => {
          const local = ajouts.concurrents.some((x) => x.nom === concurrent.nom);
          return <div key={concurrent.nom} className={classeLigne}><span className="flex items-center gap-2.5"><LogoMarque nom={concurrent.nom} /><span>{concurrent.nom}{local && <span className="ml-2"><MarqueLocale /></span>}</span></span><span className="flex items-center gap-2 text-muted-foreground">{concurrent.categorie}{local && <Retirer label={concurrent.nom} onRetirer={() => modifier((actuel) => ({ ...actuel, concurrents: actuel.concurrents.filter((x) => x.nom !== concurrent.nom) }))} />}</span></div>;
        })}
        <div className="mt-6"><FormulaireLocal titre="Ajouter un concurrent" onAjouter={(donnees) => {
          const nom = String(donnees.get("nom") ?? "").trim();
          const categorie = String(donnees.get("categorie") ?? "").trim();
          if (contientNormalise(concurrents.map((x) => x.nom), nom)) return "Ce concurrent est déjà présent.";
          modifier((actuel) => ({ ...actuel, concurrents: [...actuel.concurrents, { nom, categorie }] }));
          return undefined;
        }}><div className="grid gap-4 sm:grid-cols-2"><Champ label="Nom du concurrent"><Input name="nom" className="min-h-11" required maxLength={120} /></Champ><Champ label="Catégorie"><Input name="categorie" className="min-h-11" placeholder="Atelier indépendant" required maxLength={120} /></Champ></div></FormulaireLocal></div>
      </Section>
    </TabsContent>

    <TabsContent value="questions">
      <div className="grid gap-6">
        <p className="text-xs text-tertiary">Une nouvelle question ou un nouveau prompt reste non mesurable tant qu’aucune réponse n’a été collectée.</p>
        <Section titre="Panel par famille">
          {[...new Set(questions.filter((q) => !q.marque).map((q) => q.famille))].map((famille) => <div key={famille} className="mb-4"><h3 className="mb-1 text-xs text-tertiary">{famille}</h3>{questions.filter((q) => q.famille === famille && !q.marque).map((question) => {
            const local = ajouts.questions.some((x) => x.id === question.id);
            return <div key={question.id} className={classeLigne}><span className="min-w-0 flex-1">{question.q}{local && <span className="ml-2"><MarqueLocale /></span>}</span><span className="flex items-center gap-2 text-xs uppercase text-tertiary">{question.langue}{local && <Retirer label={question.q} onRetirer={() => modifier((actuel) => ({ ...actuel, questions: actuel.questions.filter((x) => x.id !== question.id) }))} />}</span></div>;
          })}</div>)}
        </Section>
        <Section titre="Questions marquées « votre marque »">
          {questions.filter((q) => q.marque).map((question) => {
            const local = ajouts.questions.some((x) => x.id === question.id);
            return <div key={question.id} className={classeLigne}><span className="min-w-0 flex-1">{question.q}{local && <span className="ml-2"><MarqueLocale /></span>}</span><span className="flex items-center gap-2 text-xs uppercase text-tertiary">{question.langue}{local && <Retirer label={question.q} onRetirer={() => modifier((actuel) => ({ ...actuel, questions: actuel.questions.filter((x) => x.id !== question.id) }))} />}</span></div>;
          })}
        </Section>
        <FormulaireLocal titre="Ajouter une question ou un prompt de recherche" onAjouter={(donnees) => {
          const q = String(donnees.get("question") ?? "").trim();
          const famille = String(donnees.get("famille") ?? "");
          const langue = String(donnees.get("langue") ?? "fr");
          if (contientNormalise(questions.map((x) => x.q), q)) return "Cette question est déjà présente.";
          modifier((actuel) => ({ ...actuel, questions: [...actuel.questions, { id: `q-local-${crypto.randomUUID()}`, q, famille, langue, marque: famille === "Votre marque" }] }));
          return undefined;
        }}><Champ label="Question ou prompt"><Textarea name="question" className="min-h-24" required maxLength={500} placeholder="Quelle question vos clients posent-ils aux assistants ?" /></Champ><div className="grid gap-4 sm:grid-cols-2"><Champ label="Famille"><select name="famille" className={classeChamp}>{familles.map((famille) => <option key={famille}>{famille}</option>)}</select></Champ><Champ label="Langue"><select name="langue" className={classeChamp}>{[["fr", "Français"], ["en", "Anglais"], ["es", "Espagnol"], ["de", "Allemand"], ["it", "Italien"], ["nl", "Néerlandais"]].map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Champ></div></FormulaireLocal>
      </div>
    </TabsContent>

    <TabsContent value="moteurs"><VueMoteurs /></TabsContent>
  </Tabs>;
}
