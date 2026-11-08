import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { demonstrationElevenLabs, interrompre, jouerEchantillon, lireVoix, type EchantillonVoix } from "@/lib/shyrka-locale";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shell, Fictif } from "@/components/oia/ui";
import { PresenceShyrka, ConversationShyrka, JournalShyrka, SauvegardeShyrka, useShyrka } from "@/components/oia/shyrka";
import { BarreContexte, ContexteVue, SourcesVue, PermissionsVue, CadreVue, IdentiteVue, ApplicationsVue } from "@/components/oia/shyrka-zone";
import { CorpusVue } from "@/components/oia/shyrka-corpus";

export const Route = createFileRoute("/shyrka")({
  head: () => ({ meta: [
    { title: "Shyrka, OIA" },
    { name: "description", content: "Conversation, contexte, sources, permissions, cadre et journal de Shyrka, l’assistante simulée d’OIA." },
    { property: "og:title", content: "Shyrka, OIA" },
    { property: "og:description", content: "Maîtriser ce que Shyrka sait et peut faire." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ShyrkaPage,
});

const zones = [["conversation", "Conversation"], ["corpus", "Corpus"], ["contexte", "Contexte"], ["sources", "Sources"], ["permissions", "Permissions"], ["cadre", "Cadre"], ["identite", "Identité"], ["applications", "Applications"], ["journal", "Journal"]] as const;
const tab = "min-h-12 shrink-0 rounded-none border-b-2 border-transparent px-2 text-sm font-normal text-muted-foreground data-[state=active]:border-bar data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";

function ShyrkaPage() {
  const [zone, setZone] = useState("conversation");
  const [vue, setVue] = useState("conversation");
  return <Shell large><Fictif /><h1 className="mb-3 mt-2 text-3xl">Shyrka</h1><BarreContexte />
    <Tabs value={zone} onValueChange={setZone}>
      <TabsList aria-label="Zones Shyrka" className="mb-6 flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">{zones.map(([id, l]) => <TabsTrigger key={id} value={id} className={tab}>{l}</TabsTrigger>)}</TabsList>
      <TabsContent value="conversation" className="mt-0"><SauvegardeShyrka />
        <Tabs value={vue} onValueChange={setVue}>
          <TabsList aria-label="Vues de la conversation" className="mb-6 grid h-auto w-full grid-cols-3 rounded-none border-b border-border bg-transparent p-0 xl:hidden">{([["presence", "Présence"], ["conversation", "Conversation"], ["journal", "Journal"]] as const).map(([id, label]) => <TabsTrigger key={id} value={id} className={`${tab} min-w-0 px-1 text-xs sm:text-sm`}>{label}</TabsTrigger>)}</TabsList>
          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(180px,0.8fr)_minmax(300px,1.6fr)_minmax(210px,1fr)]">
            <TabsContent value="presence" forceMount className="mt-0 hidden data-[state=active]:block xl:block"><PresenceShyrka /><p className="mt-4 text-sm text-muted-foreground">Assistante personnelle</p><OriginePresence /></TabsContent>
            <TabsContent value="conversation" forceMount className="shyrka-transcription mt-0 hidden min-w-0 flex-col data-[state=active]:flex xl:flex xl:border-l xl:border-border xl:pl-6"><h2 className="text-lg">Conversation</h2><ConversationShyrka /></TabsContent>
            <TabsContent value="journal" forceMount className="mt-0 hidden data-[state=active]:block xl:block"><JournalShyrka /></TabsContent>
          </div>
        </Tabs>
      </TabsContent>
      <TabsContent value="corpus"><CorpusVue /></TabsContent>
      <TabsContent value="contexte"><ContexteVue /></TabsContent>
      <TabsContent value="sources"><SourcesVue /></TabsContent>
      <TabsContent value="permissions"><PermissionsVue /></TabsContent>
      <TabsContent value="cadre"><CadreVue /></TabsContent>
      <TabsContent value="identite"><IdentiteVue /></TabsContent>
      <TabsContent value="applications"><ApplicationsVue /></TabsContent>
      <TabsContent value="journal"><div className="max-w-2xl"><JournalShyrka /></div></TabsContent>
    </Tabs>
  </Shell>;
}

/** D'où viennent la présence et les réponses : le Mac (passerelle locale) ou la démonstration. */
function OriginePresence() {
  const { locale } = useShyrka();
  return <><p className="mt-2 text-xs text-tertiary">{locale ? "Présence pilotée par l’état réel du Mac Studio" : "Présence et réponses simulées"}</p>{locale && <EssaisVoix />}</>;
}

/**
 * Essais de voix (mandat Shyrka English Voice V1) : chaque bouton joue un fichier local sur le Mac, sur un clic
 * seulement ; « Arrêter » coupe tout de suite. Le moteur est toujours nommé ; aucun appel à ElevenLabs.
 */
function EssaisVoix() {
  const [voix, setVoix] = useState<Awaited<ReturnType<typeof lireVoix>> | null>(null);
  const [joue, setJoue] = useState<EchantillonVoix | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  useEffect(() => { void lireVoix().then(setVoix, () => undefined); }, [joue]);
  useEffect(() => {
    if (!joue) return;
    const t = setInterval(() => void lireVoix().then((v) => { if (!v.joue) setJoue(null); }, () => undefined), 700);
    return () => clearInterval(t);
  }, [joue]);
  if (!voix) return null;
  const jouer = (e: EchantillonVoix) => { setErreur(null); void jouerEchantillon(e.id).then(() => setJoue(e), (x: unknown) => setErreur(x instanceof Error ? x.message : "Lecture impossible.")); };
  return <div className="mt-4 border-t border-border pt-3 text-xs">
    <p className="text-tertiary">Voix des réponses : {voix.reponses}{voix.voix ? ` · ${voix.voix} en français` : ""}</p>
    {voix.echantillons.length > 0 && <div className="mt-2 flex flex-wrap gap-1">
      {voix.echantillons.map((e) => <Button key={e.id} size="sm" variant={joue?.id === e.id ? "default" : "outline"} className="min-h-9 font-normal" title={`${e.moteurLibelle} · ${e.texte}`} onClick={() => jouer(e)}>{e.libelle}</Button>)}
      {joue && <Button size="sm" variant="ghost" className="min-h-9 font-normal" onClick={() => { void interrompre().finally(() => setJoue(null)); }}>Arrêter</Button>}
    </div>}
    <p className="mt-1 text-tertiary" aria-live="polite">{joue ? `Lecture sur le Mac · moteur : ${joue.moteurLibelle}` : "Moteur indiqué à chaque lecture. Les fichiers sont joués depuis le Mac, sans appel à ElevenLabs."}</p>
    <p className="mt-1 text-tertiary">API ElevenLabs : {voix.elevenlabs}.</p>
    {voix.elevenlabs.startsWith("clé") && (confirmer
      ? <div className="mt-1 flex flex-wrap items-center gap-1"><span>La phrase de démonstration part chez ElevenLabs (elle quitte le Mac) et consomme des crédits.</span><Button size="sm" variant="outline" className="min-h-9 font-normal" onClick={() => { setConfirmer(false); void demonstrationElevenLabs().then((r) => setErreur(`Généré par ElevenLabs en ${r.ms} ms.`), (x: unknown) => setErreur(x instanceof Error ? x.message : "Échec.")); }}>Envoyer</Button><Button size="sm" variant="ghost" className="min-h-9 font-normal" onClick={() => setConfirmer(false)}>Annuler</Button></div>
      : <Button size="sm" variant="ghost" className="mt-1 min-h-9 font-normal" onClick={() => setConfirmer(true)}>Nouvelle phrase par l'API ElevenLabs…</Button>)}
    {erreur && <p role="alert" className="mt-1">{erreur}</p>}
  </div>;
}
