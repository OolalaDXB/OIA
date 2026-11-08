import type { CSSProperties } from "react";
import { siOpenai, siAnthropic, siMistralai, siGooglegemini, siPerplexity } from "simple-icons";
import { couleurSerie } from "@/components/oia/graphiques";

const assistants = {
  ChatGPT: { icone: siOpenai, couleur: "var(--assistant-chatgpt)" },
  Claude: { icone: siAnthropic, couleur: "var(--assistant-claude)" },
  Gemini: { icone: siGooglegemini, couleur: "var(--assistant-gemini)" },
  "Le Chat": { icone: siMistralai, couleur: "var(--assistant-mistral)" },
  Mistral: { icone: siMistralai, couleur: "var(--assistant-mistral)" },
  Perplexity: { icone: siPerplexity, couleur: "var(--assistant-perplexity)" },
} as const;

export function LogoAssistant({ nom, petite = false }: { nom: string; petite?: boolean }) {
  const assistant = assistants[nom as keyof typeof assistants];
  if (!assistant) return null;
  return (
    <span
      aria-hidden="true"
      className={`logo-identite ${petite ? "logo-identite-petite" : ""}`}
      style={{ "--identite-couleur": assistant.couleur } as CSSProperties}
    >
      <svg viewBox="0 0 24 24" className="size-4 fill-current"><path d={assistant.icone.path} /></svg>
    </span>
  );
}

export function LogoMarque({ nom, couleur }: { nom: string; couleur?: string | undefined }) {
  const mots = nom.split(/\s+/).filter((mot) => !["de", "des", "du", "et", "les"].includes(mot.toLowerCase()));
  const initiales = mots.slice(0, 2).map((mot) => mot[0]).join("").toLocaleUpperCase("fr-FR");
  return (
    <span
      aria-hidden="true"
      className="logo-identite logo-marque"
      style={{ "--identite-couleur": couleur ?? couleurSerie(nom) } as CSSProperties}
    >
      {initiales}
    </span>
  );
}
