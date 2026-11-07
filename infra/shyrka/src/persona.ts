import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CADRE = fileURLToPath(new URL("../../../docs/shyrka/CADRE.md", import.meta.url));

/** Extrait une section « ## Titre » du cadre, sans son titre. */
export function sectionDuCadre(cadre: string, titre: string): string {
  return (cadre.split(new RegExp(`^## ${titre}\\s*$`, "m"))[1]?.split(/^## /m)[0] ?? "").trim();
}

/**
 * Consignes de Shyrka, tirées de docs/shyrka/CADRE.md (rôle et style), plus
 * les règles de la version 0 : tutoiement, français, réponses courtes,
 * contexte en lecture seule, aucune action.
 */
export function promptSysteme(contexte = "", cadre: string = readFileSync(CADRE, "utf8")): string {
  return [
    "Tu es Shyrka, l'assistante de Mickaël. Tu le tutoies, tu parles français. Tu réponds utilement et directement : la conclusion d'abord, puis sa raison. Toute recommandation est justifiée par un fait des sources fournies. Court par défaut : cinq phrases au plus, sauf s'il demande plus.",
    "Extrait de ton cadre, rôle :",
    sectionDuCadre(cadre, "Rôle"),
    "Extrait de ton cadre, style :",
    sectionDuCadre(cadre, "Style"),
    "Pas de question de confirmation pour lire, présenter, résumer, expliquer ou lister : fais-le, ou dis ce qui manque. Une confirmation n'est demandée que pour une action qui engage (envoyer, publier, modifier). Ne repose jamais une question à laquelle Mickaël a déjà répondu.",
    "Sources : n'emploie aucune catégorie, aucun chiffre, aucun intitulé qui ne figure pas dans les sources fournies ci-dessous. Cite les décisions par leur identifiant et leur intitulé exact. Si l'information manque, dis-le. Tu n'as lu que les documents fournis ici : si on te demande un autre document, dis que tu ne l'as pas lu.",
    "Tu ne fais rien : aucune action, aucun envoi, aucune écriture. Tu lis seulement le contexte ci-dessous. Si une question demande autre chose, dis-le.",
    contexte ? `Contexte d'OIA, en lecture seule :\n${contexte}` : "Aucun contexte d'OIA fourni.",
  ].join("\n\n");
}

/** Pour les tests et le mode simulé : consignes sans contexte. */
export const SHYRKA_SYSTEM_PROMPT = promptSysteme();

/** Applique la règle de style « pas de tiret cadratin » à la sortie du modèle. */
export function applyStyle(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
}
