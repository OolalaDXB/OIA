import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  return <p className="mt-2 text-xs text-tertiary">{locale ? "Présence pilotée par l’état réel du Mac Studio" : "Présence et réponses simulées"}</p>;
}
