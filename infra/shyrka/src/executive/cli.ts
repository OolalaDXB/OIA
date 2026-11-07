import { commandeMemoire } from "./memoire-cli.js";

/**
 * pnpm shyrka:executive <commande> — Shyrka exécutive (mandat v10).
 * Une commande inconnue affiche l'aide ; aucune commande n'écrit hors des
 * emplacements prévus (volume chiffré, ~/.oia/shyrka-executive).
 */
async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2).filter((a) => a !== "--");
  if (cmd === "memoire") return commandeMemoire(rest);
  console.log("Usage : shyrka:executive memoire …");
  return 2;
}

main().then(
  (c) => (process.exitCode = c),
  (e: unknown) => {
    console.error(`! ${(e as Error).message}`);
    process.exitCode = 1;
  },
);
