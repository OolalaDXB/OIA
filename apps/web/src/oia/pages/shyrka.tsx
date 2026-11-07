"use client";

// Porté du prototype Lovable « OIA Dashoard » (commit c6470e86), route TanStack devenue vue Next.
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shell, Fictif } from "@/components/oia/ui";
import { PresenceShyrka, ConversationShyrka, JournalShyrka, SauvegardeShyrka } from "@/components/oia/shyrka";



export function ShyrkaPage() {
  const [vue, setVue] = useState("conversation");
  return <Shell large><Fictif /><h1 className="mb-3 mt-2 text-3xl">Shyrka</h1><SauvegardeShyrka />
    <Tabs value={vue} onValueChange={setVue}>
    <TabsList aria-label="Vues Shyrka" className="mb-6 grid h-auto w-full grid-cols-3 rounded-none border-b border-border bg-transparent p-0 xl:hidden">{([ ["presence", "Présence"], ["conversation", "Conversation"], ["journal", "Journal"] ] as const).map(([id, label]) => <TabsTrigger key={id} value={id} className="min-h-12 min-w-0 rounded-none border-b-2 border-transparent px-1 text-xs font-normal text-muted-foreground data-[state=active]:border-bar data-[state=active]:bg-transparent data-[state=active]:shadow-none sm:text-sm">{label}</TabsTrigger>)}</TabsList>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(180px,0.8fr)_minmax(300px,1.6fr)_minmax(210px,1fr)]">
      <TabsContent value="presence" forceMount className="mt-0 hidden data-[state=active]:block xl:block"><PresenceShyrka /><p className="mt-4 text-sm text-muted-foreground">Assistante personnelle</p><p className="mt-2 text-xs text-tertiary">Présence et réponses simulées</p></TabsContent>
      <TabsContent value="conversation" forceMount className="shyrka-transcription mt-0 hidden min-w-0 flex-col data-[state=active]:flex xl:flex xl:border-l xl:border-border xl:pl-6"><h2 className="text-lg">Conversation</h2><ConversationShyrka /></TabsContent>
      <TabsContent value="journal" forceMount className="mt-0 hidden data-[state=active]:block xl:block"><JournalShyrka /></TabsContent>
    </div>
    </Tabs>
  </Shell>;
}
