import { createHash } from "node:crypto";
import { sourcesForProject, type ProjectEntry, type SourceRegistry } from "@oia/registry";
import { ESPACE_STUDIO } from "./chargeur.js";

/**
 * Projets du registre (registry/projects/*.yaml) vers la table oia_projet
 * (migration 0008, contrat Money Lookup version 2). Le registre reste la
 * référence : la table en est une copie de lecture pour le cockpit, mise à
 * jour seulement quand le contenu change. Un projet sorti du registre est
 * marqué `retire_du_registre_le`, jamais supprimé (des étiquettes peuvent le
 * viser). Idempotent : rejouer le même registre ne change rien.
 */
export interface LigneProjet {
  slug: string;
  nom: string;
  type: string;
  statut: string;
  actif: boolean;
  une_ligne: string;
  url: string | null;
  secteurs: string[];
  geographies: string[];
  types_financement: string[];
  natures_suivies: string[];
  decouverte_active: boolean;
  revue_profil: string;
  mots_cles: string[];
  exclusions: string[];
  /** Entrée complète du registre. */
  profil: ProjectEntry;
  /** Sources prévues pour le projet (registre des sources). */
  sources: { id: string; nom: string; url: string; statut: string; natures: string[]; geographies: string[]; notes: string }[];
  empreinte: string;
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function lignesProjets(projets: ProjectEntry[], registreSources?: SourceRegistry): LigneProjet[] {
  return projets
    .map((p) => {
      const l = {
        slug: p.slug,
        nom: p.name,
        type: p.kind,
        statut: p.status,
        actif: p.active !== false,
        une_ligne: p.oneLiner ?? "",
        url: p.url ?? null,
        secteurs: [...(p.sectors ?? [])],
        geographies: [...(p.geographies ?? [])],
        types_financement: [...(p.fundingTypes ?? [])],
        natures_suivies: [...(p.discovery?.watch ?? [])],
        decouverte_active: p.discovery?.enabled === true,
        revue_profil: p.profileReview.status,
        mots_cles: [...(p.keywords ?? [])],
        exclusions: [...(p.exclusions ?? [])],
        profil: p,
        sources: registreSources
          ? sourcesForProject(registreSources, p.slug).map((x) => ({ id: x.id, nom: x.name, url: x.url, statut: x.status, natures: [...x.kinds], geographies: [...x.geographies], notes: x.notes }))
          : [],
      };
      return { ...l, empreinte: sha256(JSON.stringify(l)) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

const DOLLAR = "$oia_projets$";

/** Script SQL idempotent : insère, met à jour si le contenu a changé, marque les projets sortis du registre. */
export function sqlProjets(projets: ProjectEntry[], opts: { espace?: string; sources?: SourceRegistry } = {}): { sql: string; lignes: number } {
  const espace = opts.espace ?? ESPACE_STUDIO;
  const lignes = lignesProjets(projets, opts.sources);
  const json = JSON.stringify(lignes);
  if (json.includes(DOLLAR)) throw new Error("registre illisible : séparateur réservé présent");
  if (!/^[0-9a-f-]{36}$/.test(espace)) throw new Error("espace invalide");
  const sql = `-- projets du registre · ${lignes.length} projet(s) · espace ${espace}
begin;
with src as (
  select * from jsonb_to_recordset(${DOLLAR}${json}${DOLLAR}::jsonb) as x(
    slug text, nom text, type text, statut text, actif boolean, une_ligne text, url text,
    secteurs text[], geographies text[], types_financement text[], natures_suivies text[],
    decouverte_active boolean, revue_profil text, mots_cles text[], exclusions text[], profil jsonb, sources jsonb, empreinte text)
)
insert into public.oia_projet (espace_id, slug, nom, type, statut, actif, une_ligne, url, secteurs, geographies, types_financement,
                               natures_suivies, decouverte_active, revue_profil, mots_cles, exclusions, profil, sources, empreinte, charge_le, retire_du_registre_le)
select '${espace}', slug, nom, type, statut, actif, une_ligne, url, secteurs, geographies, types_financement,
       natures_suivies, decouverte_active, revue_profil, mots_cles, exclusions, profil, sources, empreinte, now(), null
from src
on conflict (espace_id, slug) do update set
  nom = excluded.nom, type = excluded.type, statut = excluded.statut, actif = excluded.actif, une_ligne = excluded.une_ligne,
  url = excluded.url, secteurs = excluded.secteurs, geographies = excluded.geographies, types_financement = excluded.types_financement,
  natures_suivies = excluded.natures_suivies, decouverte_active = excluded.decouverte_active, revue_profil = excluded.revue_profil,
  mots_cles = excluded.mots_cles, exclusions = excluded.exclusions, profil = excluded.profil, sources = excluded.sources,
  empreinte = excluded.empreinte, charge_le = now(), retire_du_registre_le = null
where public.oia_projet.empreinte is distinct from excluded.empreinte or public.oia_projet.retire_du_registre_le is not null;
update public.oia_projet set retire_du_registre_le = now()
where espace_id = '${espace}' and retire_du_registre_le is null
  and slug not in (select x->>'slug' from jsonb_array_elements(${DOLLAR}${json}${DOLLAR}::jsonb) x);
commit;
`;
  return { sql, lignes: lignes.length };
}
