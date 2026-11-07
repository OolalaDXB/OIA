import { existsSync } from "node:fs";
import type { CommandRunner } from "./runner.js";
import { assertLoopback } from "./adapters/ollama.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

export interface DoctorConfig {
  ffmpeg: string;
  whisperBin: string;
  whisperModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  /** Modèle de comparaison, facultatif : son absence n'est pas bloquante. */
  compareModel?: string;
  voice: string;
}

type FetchJson = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/**
 * Diagnostic du premier essai réel sur le Mac. Lecture seule : ne télécharge
 * rien, n'installe rien, n'enregistre rien. Dit ce qui manque et comment
 * l'obtenir.
 */
export async function diagnose(
  cfg: DoctorConfig,
  deps: { run: CommandRunner; fetchJson?: FetchJson; exists?: (p: string) => boolean; platform?: string },
): Promise<Check[]> {
  const checks: Check[] = [];
  const exists = deps.exists ?? existsSync;
  const platform = deps.platform ?? process.platform;

  checks.push({ name: "macOS", ok: platform === "darwin", detail: platform, fix: "Shyrka 1 vise le Mac Studio (micro avfoundation, voix `say`)." });

  const ff = await deps.run(cfg.ffmpeg, ["-hide_banner", "-version"], { timeoutMs: 10_000 });
  checks.push({ name: "ffmpeg (micro)", ok: ff.code === 0, detail: ff.code === 0 ? (ff.stdout.split("\n")[0] ?? "").trim() : "absent", fix: "brew install ffmpeg" });

  const wh = await deps.run(cfg.whisperBin, ["-h"], { timeoutMs: 10_000 });
  checks.push({ name: "whisper.cpp", ok: wh.code === 0, detail: wh.code === 0 ? cfg.whisperBin : "absent", fix: "brew install whisper-cpp" });

  const hasModel = cfg.whisperModel !== "" && exists(cfg.whisperModel);
  checks.push({
    name: "modèle Whisper",
    ok: hasModel,
    detail: cfg.whisperModel || "SHYRKA_WHISPER_MODEL non défini",
    fix: "Télécharger ggml-large-v3-turbo.bin (dépôt ggerganov/whisper.cpp sur Hugging Face), vérifier son empreinte SHA-256, puis SHYRKA_WHISPER_MODEL=<chemin>",
  });

  let ollamaOk = false;
  let models: string[] = [];
  try {
    const base = assertLoopback(cfg.ollamaUrl);
    const f = deps.fetchJson ?? ((u: string) => globalThis.fetch(u) as unknown as ReturnType<FetchJson>);
    const res = await f(new URL("/api/tags", base).toString());
    if (res.ok) {
      ollamaOk = true;
      const body = (await res.json()) as { models?: { name?: string }[] };
      models = (body.models ?? []).map((m) => m.name ?? "").filter(Boolean);
    }
  } catch {
    ollamaOk = false;
  }
  checks.push({ name: "Ollama (local)", ok: ollamaOk, detail: ollamaOk ? cfg.ollamaUrl : "injoignable", fix: "Ouvrir l'application Ollama, ou `ollama serve`" });
  const installed = (name: string) => name !== "" && models.some((m) => m === name || m === `${name}:latest`);
  const hasModelOllama = installed(cfg.ollamaModel);
  checks.push({
    name: "modèle Ollama",
    ok: hasModelOllama,
    detail: cfg.ollamaModel ? `${cfg.ollamaModel}${models.length ? ` (installés : ${models.join(", ")})` : ""}` : "SHYRKA_OLLAMA_MODEL non défini",
    fix: `\`ollama pull ${cfg.ollamaModel || "<modèle>"}\``,
  });
  if (cfg.compareModel) {
    checks.push({
      name: "modèle de comparaison (facultatif)",
      ok: installed(cfg.compareModel) || models.some((m) => m.startsWith(`${cfg.compareModel}:`)),
      detail: cfg.compareModel,
      fix: `\`ollama pull ${cfg.compareModel}\` (seulement pour \`parle -- --comparer\`)`,
    });
  }

  const voices = await deps.run("say", ["-v", "?"], { timeoutMs: 10_000 });
  const hasVoice = voices.code === 0 && voices.stdout.split("\n").some((l) => l.toLowerCase().startsWith(cfg.voice.toLowerCase()));
  checks.push({
    name: `voix macOS ${cfg.voice}`,
    ok: hasVoice,
    detail: voices.code === 0 ? (hasVoice ? "installée" : "absente de `say -v ?`") : "`say` absent",
    fix: "Réglages Système > Accessibilité > Contenu énoncé > Voix du système > Gérer les voix : ajouter Aurélie (Français)",
  });

  return checks;
}

export function formatChecks(checks: Check[]): string {
  return checks.map((c) => `${c.ok ? "ok  " : "MANQUE"} ${c.name} · ${c.detail}${c.ok || !c.fix ? "" : `\n       → ${c.fix}`}`).join("\n");
}
