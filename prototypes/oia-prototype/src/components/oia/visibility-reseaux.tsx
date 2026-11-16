import { Section } from "@/components/oia/ui";
import { LogoReseau } from "@/components/oia/identites";
import { FiltresVisibility, NoteMesure, useFiltres } from "@/components/oia/mesure";
import { useVisibilityDonnees } from "@/lib/donnees/provider";
import { groupesReseaux, separerProfils } from "@/lib/donnees/visibility-v3";
import type { ReseauVisibility } from "@/lib/donnees/visibility";

function TableProfils({ profils }: { profils: ReseauVisibility[] }) {
  const groupes = groupesReseaux(profils);
  if (!groupes.length) return <p className="text-sm text-muted-foreground">Aucun profil dans cette catégorie pour ces filtres.</p>;
  return <div className="grid gap-6">{groupes.map((groupe) => <section key={groupe.reseau} aria-label={groupe.reseau} className="min-w-0">
    <h3 className="mb-3 flex items-center gap-2 text-sm"><LogoReseau nom={groupe.reseau} />{groupe.reseau}<span className="num text-xs font-normal text-tertiary">Top {groupe.profils.length} sur {groupe.total}</span></h3>
    <div className="max-w-full overflow-x-auto"><table className="num w-full min-w-[560px] text-sm"><thead><tr className="border-b border-border text-left text-xs text-tertiary"><th className="py-2 pr-3 font-normal">Profil</th><th className="py-2 pr-3 text-right font-normal">Citations</th><th className="py-2 pr-3 text-right font-normal">Questions</th><th className="py-2 text-right font-normal">Part</th></tr></thead><tbody>{groupe.profils.map((profil) => <tr key={`${profil.reseau}-${profil.handle}`} className="border-b border-border last:border-0"><td className="max-w-0 w-full truncate py-2.5 pr-3 text-xs" title={profil.handle}>{profil.handle.replace(/^https?:\/\/(www\.)?/, "")}</td><td className="py-2.5 pr-3 text-right">{profil.citations}</td><td className="py-2.5 pr-3 text-right">{profil.questions ?? "Non fourni"}</td><td className="whitespace-nowrap py-2.5 text-right text-tertiary">{profil.part !== null && profil.part !== undefined ? `${String(profil.part).replace(".", ",")} %` : "Non fourni"}</td></tr>)}</tbody></table></div>
  </section>)}</div>;
}

export function VueReseauxV3() {
  const donnees = useVisibilityDonnees();
  const f = useFiltres();
  const reseaux = donnees.reseauxParFenetre?.[f.fenetreActive.id]?.[f.assistant] ?? donnees.reseaux;
  const separation = separerProfils(reseaux, donnees.marque);
  return <><FiltresVisibility /><div className="grid gap-6"><Section titre="Profils de la marque" aside={<span className="num text-sm text-tertiary">{separation.marque.length}</span>}><p className="mb-5 text-sm text-muted-foreground">Ces profils correspondent aux domaines ou aux profils déclarés pour le sujet. Contrôlez d'abord leur cohérence avec le site.</p><TableProfils profils={separation.marque} /></Section><Section titre="Autres profils cités" aside={<span className="num text-sm text-tertiary">{separation.autres.length}</span>}><p className="mb-5 text-sm text-muted-foreground">Sans correspondance avec les domaines et profils du sujet, le profil reste ici. Vérifiez ceux qui captent les citations à votre place.</p><TableProfils profils={separation.autres} /></Section></div><NoteMesure /></>;
}
