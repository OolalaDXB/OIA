import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ecrireResume, lireStyle, resumeMarkdown, trierLeMatin } from "./agent.js";
import { palierCourrier } from "./palier.js";
import { BoiteFictive, ClasseurFictif, MESSAGES_FICTIFS, RedacteurFictif } from "./fictif.js";
import { BoiteGmail } from "./gmail.js";
import { ClasseurOllama, RedacteurOllama } from "./ollama.js";

/**
 * pnpm --filter @oia/shyrka-mail matin -- --simule   boîte fictive, classeur fictif, résumé affiché
 * pnpm --filter @oia/shyrka-mail matin               Gmail (après connexion OAuth par Mickaël) et Ollama local
 */
const ici = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const env = process.env;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd !== "matin") {
    console.log("Usage : cli.ts matin [--simule]");
    process.exitCode = 2;
    return;
  }
  const simule = rest.includes("--simule");
  const stylePath = ici("../../../docs/shyrka/style.md");
  const style = existsSync(stylePath) ? lireStyle(readFileSync(stylePath, "utf8")) : "";
  const palier = palierCourrier(env.SHYRKA_PERMISSIONS ?? ici("../../../infra/shyrka/permissions.json"));
  const jeton = env.SHYRKA_GMAIL_JETON ?? join(homedir(), "oia-shyrka-data", "gmail-jeton.json");
  if (!simule && !existsSync(jeton)) {
    throw new Error(`Gmail non connecté : jeton absent (${jeton}). Voir docs/shyrka/adr/0001-agent-courrier.md.`);
  }
  const r = await trierLeMatin({
    boite: simule ? new BoiteFictive(MESSAGES_FICTIFS) : new BoiteGmail({ jeton: BoiteGmail.jetonDepuisFichier(jeton) }),
    classeur: simule ? new ClasseurFictif() : new ClasseurOllama({ ...(env.SHYRKA_OLLAMA_MODEL ? { model: env.SHYRKA_OLLAMA_MODEL } : {}) }),
    redacteur: simule ? new RedacteurFictif() : new RedacteurOllama({ ...(env.SHYRKA_OLLAMA_MODEL ? { model: env.SHYRKA_OLLAMA_MODEL } : {}) }),
    style,
    palier,
  });
  if (simule) {
    console.log(resumeMarkdown(r));
    console.log("(simulé : rien n'est écrit)");
    return;
  }
  const chemin = ecrireResume(r, env.SHYRKA_COURRIER_DIR ?? join(homedir(), "oia-shyrka-data", "courrier"));
  console.log(`Résumé du matin : ${chemin}`);
}

main().catch((e: unknown) => {
  console.error(`! ${(e as Error).message}`);
  process.exitCode = 1;
});
