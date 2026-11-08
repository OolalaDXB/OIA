/**
 * Matrice de confidentialité (version 2), sur la base d'essai chargée.
 * Chaque ligne est un essai réel contre Postgres, avec le rôle concerné :
 * ce que voit chaque rôle, ce qu'il ne peut ni lire ni écrire, les tentatives
 * de contournement, et la révocation d'une source (qui ne doit jamais revenir).
 * La révocation porte sur une note fictive : relancer charger.ts pour la restaurer.
 *
 *   bun acces.ts
 */
import { SQL } from "bun";
import { ADMIN, CACHE, ROLE } from "./charger.ts";
import { plongements } from "./corpus.ts";
import { rechercher } from "./recherche.ts";

type Essai = { essai: string; role: string; attendu: string; obtenu: string; ok: boolean };
const essais: Essai[] = [];
const noter = (essai: string, role: string, attendu: string, obtenu: string) => essais.push({ essai, role, attendu, obtenu, ok: attendu === obtenu });
/** « refusé » si Postgres lève une erreur (droits), sinon le résultat. */
const tenter = async (fn: () => Promise<unknown>): Promise<string> => { try { const r = await fn(); return Array.isArray(r) ? `${r.length} ligne(s)` : "accepté"; } catch (e) { return `refusé (${(e as { errno?: string }).errno ?? "erreur"})`; } };

const admin = new SQL(ADMIN);
const roles = { ke_shyrka: new SQL(ROLE("ke_shyrka")), ke_agent: new SQL(ROLE("ke_agent")), ke_agent_visibility: new SQL(ROLE("ke_agent_visibility")) };
const [qv] = await plongements(["Que contient le dossier ZEPHYRINE ?"], CACHE);

// 1. Visibilité par rôle.
const attenduCompartiments = { ke_shyrka: "interface,oia,personnel,public,shyrka,visibility", ke_agent: "interface,oia,personnel,public,visibility", ke_agent_visibility: "visibility" };
// Attendu : les compartiments accordés qui contiennent au moins un extrait que ce rôle a le droit de lire
// (un agent de modèle externe accordé sur « personnel » n'y voit rien si tout y est « mickael_seulement »).
const parCompartiment = await admin`select compartiment, bool_or(classification = 'interne') as interne from ke.extrait group by 1`;
for (const [r, db] of Object.entries(roles)) {
  const [v] = await db`select string_agg(distinct compartiment, ',' order by compartiment) as c, count(*) filter (where classification = 'mickael_seulement')::int as prives from ke.extrait`;
  const accordes = attenduCompartiments[r as keyof typeof attenduCompartiments].split(",");
  const attendu = parCompartiment.filter((x: { compartiment: string; interne: boolean }) => accordes.includes(x.compartiment) && (x.interne || r === "ke_shyrka")).map((x: { compartiment: string }) => x.compartiment).sort().join(",");
  noter("compartiments visibles", r, attendu, v.c ?? "");
  noter("extraits « mickael_seulement » visibles", r, r === "ke_shyrka" ? "5" : "0", String(v.prives));
  const res = await rechercher(db, "sens-id", "Que contient le dossier ZEPHYRINE ?", qv!);
  noter("recherche ZEPHYRINE : notes privées rendues", r, r === "ke_shyrka" ? "oui" : "non", res.some((x) => x.source.startsWith("fictif/")) ? "oui" : "non");
}

// 2. Écritures et lectures interdites, tentatives de contournement.
for (const [r, db] of Object.entries(roles)) {
  noter("lire ke.droits", r, "refusé (42501)", await tenter(() => db`select * from ke.droits`));
  noter("s'accorder un compartiment", r, "refusé (42501)", await tenter(() => db`update ke.droits set compartiments = '{oia,shyrka,personnel}' where role = session_user`));
  noter("lire ke.revocation", r, "refusé (42501)", await tenter(() => db`select * from ke.revocation`));
  noter("insérer un extrait", r, "refusé (42501)", await tenter(() => db`insert into ke.extrait (source_id, compartiment, classification, titre, section, ligne, texte, embedding, date_source) select source_id, compartiment, classification, titre, section, ligne, texte, embedding, date_source from ke.extrait limit 1`));
  noter("effacer les extraits", r, "refusé (42501)", await tenter(() => db`delete from ke.extrait`));
  noter("désactiver la RLS", r, "refusé (42501)", await tenter(() => db`alter table ke.extrait disable row level security`));
  noter("row_security = off", r, "refusé (42501)", await tenter(() => db.begin(async (tx) => { await tx`set local row_security = off`; return tx`select id from ke.extrait limit 1`; })));
  noter("prendre le rôle de Shyrka", r, r === "ke_shyrka" ? "accepté" : "refusé (42501)", await tenter(() => db.begin(async (tx) => { await tx.unsafe("set local role ke_shyrka"); return undefined; })));
  noter("prendre l'identité de session de Shyrka", r, r === "ke_shyrka" ? "accepté" : "refusé (42501)", await tenter(() => db.begin(async (tx) => { await tx.unsafe("set local session authorization ke_shyrka"); return undefined; })));
}

// 3. Rôle sans droits déclarés : ne voit rien, même avec le privilège select.
await admin.unsafe("do $$ begin if not exists (select 1 from pg_roles where rolname = 'ke_inconnu') then create role ke_inconnu login password 'essai'; end if; end $$; grant usage on schema ke to ke_inconnu; grant select on ke.extrait, ke.source to ke_inconnu; grant execute on function ke.mes_compartiments(), ke.lit_le_prive() to ke_inconnu;");
const inconnu = new SQL(ROLE("ke_inconnu"));
noter("rôle sans ligne dans ke.droits : extraits visibles", "ke_inconnu", "0", String((await inconnu`select count(*)::int as n from ke.extrait`)[0].n));
await inconnu.close();

// 4. Injection : la question est un paramètre, jamais du SQL.
const avant = (await admin`select count(*)::int as n from ke.extrait`)[0].n;
const piege = "x'); drop table ke.extrait; -- ' or 1=1 --";
const [pv] = await plongements([piege], CACHE);
await rechercher(roles.ke_agent_visibility, "sens-id", piege, pv!);
await rechercher(roles.ke_agent_visibility, "combine", piege, pv!);
noter("question piégée (injection SQL)", "ke_agent_visibility", String(avant), String((await admin`select count(*)::int as n from ke.extrait`)[0].n));

// 5. Révocation d'une source fictive privée : disparition pour tous, retour refusé par tout connecteur.
const cible = "fictif/zephyrine-2.md";
const [{ uri }] = await admin`select uri from ke.source where id = ${cible}`;
await admin.begin(async (tx) => {
  await tx`insert into ke.revocation (empreinte, motif) values (encode(sha256(${uri}::bytea), 'hex'), 'essai de révocation')`;
  await tx`delete from ke.source where id = ${cible}`;
});
for (const [r, db] of Object.entries(roles)) noter("source révoquée : extraits encore visibles", r, "0", String((await db`select count(*)::int as n from ke.extrait where source_id = ${cible}`)[0].n));
noter("source révoquée : extraits restants (administrateur)", "postgres", "0", String((await admin`select count(*)::int as n from ke.extrait where source_id = ${cible}`)[0].n));
noter("réindexer la source révoquée", "postgres", "refusé (42501)", await tenter(() => admin`insert into ke.source (id, connecteur, uri, compartiment, classification, version, date_source) values (${cible + "-bis"}, 'fichiers', ${uri}, 'personnel', 'mickael_seulement', 'v2', now())`));
noter("renommer une source vers l'adresse révoquée", "postgres", "refusé (42501)", await tenter(() => admin`update ke.source set uri = ${uri} where id = 'fictif/zephyrine-0.md'`));
noter("la révocation ne garde que l'empreinte, pas l'adresse", "postgres", "0", String((await admin`select count(*)::int as n from ke.revocation where empreinte like ${"%" + cible + "%"} or motif like ${"%" + cible + "%"}`)[0].n));

for (const db of [admin, ...Object.values(roles)]) await db.close();
const echecs = essais.filter((e) => !e.ok);
console.log(JSON.stringify({ essais: essais.length, reussis: essais.length - echecs.length, echecs, matrice: essais.map((e) => `${e.ok ? "ok " : "ÉCHEC"} ${e.role.padEnd(20)} ${e.essai} → ${e.obtenu}`) }, null, 1));
