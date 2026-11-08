/**
 * Abstention en deux étages. Le seuil de proximité seul ne sépare pas les
 * questions plausibles hors corpus (« Quel cabinet d'avocats… ») des vraies.
 * Second étage : le modèle local de Shyrka lit les 3 meilleurs extraits
 * (mode sens-id) et dit s'ils répondent. Mesure : bonnes sources gardées,
 * questions hors corpus refusées. Modèle local seulement ; aucun envoi externe.
 *
 *   bun juge.ts
 */
import { SQL } from "bun";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { plongements } from "./corpus.ts";
import { CACHE, DOSSIER, ROLE } from "./charger.ts";
import { rechercher, retenir } from "./recherche.ts";

const MODELE = "qwen3:30b-a3b-instruct-2507-q4_K_M";
const SEUIL_SENS = 0.516; // calibré sur le jeu de mise au point (banc.ts)

interface Cas { id: string; famille: string; question: string; source?: string }

async function juger(question: string, extraits: string[]): Promise<boolean> {
  const r = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    body: JSON.stringify({
      model: MODELE, stream: false, keep_alive: "30m", options: { temperature: 0, num_predict: 4 },
      messages: [
        { role: "system", content: "Tu juges si des extraits de documents contiennent la réponse à une question. Réponds uniquement OUI ou NON." },
        { role: "user", content: `Question : ${question}\n\n${extraits.map((e, i) => `Extrait ${i + 1} :\n${e}`).join("\n\n")}\n\nL'un de ces extraits contient-il la réponse, ou une information qui y répond directement ?` },
      ],
    }),
  });
  return /^\s*oui/i.test(((await r.json()) as { message: { content: string } }).message.content);
}

async function main() {
  const { jeuMiseAuPoint } = await import("./banc.ts");
  const fichierTenu = join(DOSSIER, "tenu.json");
  const jeux: Record<string, Cas[]> = { mise_au_point: jeuMiseAuPoint(), ...(existsSync(fichierTenu) ? { tenu: JSON.parse(readFileSync(fichierTenu, "utf8")) as Cas[] } : {}) };
  const db = new SQL(ROLE("ke_shyrka"));
  const sortie: Record<string, Record<string, { n: number; garde?: number; refuse?: number }>> = {};
  const durees: number[] = [];
  for (const [nom, cas] of Object.entries(jeux)) {
    const qvs = await plongements(cas.map((c) => c.question), CACHE);
    const f: Record<string, { n: number; garde?: number; refuse?: number }> = (sortie[nom] = {});
    for (const [k, c] of cas.entries()) {
      const r = retenir("sens-id", await rechercher(db, "sens-id", c.question, qvs[k]!), { sens: SEUIL_SENS, mots: 0 }).slice(0, 3);
      let ok = r.length > 0;
      if (ok) {
        const textes: string[] = [];
        for (const d of r) {
          const [e] = await db`select titre, section, texte from ke.extrait where source_id = ${d.source} order by embedding <=> ${`[${qvs[k]!.join(",")}]`}::vector limit 1`;
          textes.push(`${e.titre} › ${e.section}\n${e.texte}`);
        }
        const t0 = performance.now();
        ok = await juger(c.question, textes);
        durees.push(performance.now() - t0);
      }
      const g = (f[c.famille] ??= { n: 0 });
      g.n++;
      if (c.source) g.garde = (g.garde ?? 0) + (ok && r.some((d) => d.source === c.source) ? 1 : 0);
      else g.refuse = (g.refuse ?? 0) + (ok ? 0 : 1);
    }
  }
  await db.close();
  durees.sort((a, b) => a - b);
  console.log(JSON.stringify({ modele: MODELE, seuil_sens: SEUIL_SENS, juge_ms_p50: Math.round(durees[Math.floor(durees.length / 2)] ?? 0), juge_ms_p95: Math.round(durees[Math.floor(durees.length * 0.95)] ?? 0), resultats: sortie }, null, 1));
}

if (import.meta.main) await main();
