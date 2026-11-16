/**
 * Alertes de l'ordonnanceur (mandat v15, bloc C) : échec, jour manquant, plafond atteint,
 * coût illisible, rapport prêt, remesure proposée.
 *
 * Un seul canal concret : le journal local `<data>/alertes.jsonl`, en ajout seul. L'e-mail
 * et la notification sur téléphone viendront avec le bloc F (choix de Mickaël) : ils
 * implémenteront `AlertSink`, rien d'autre ne change. Une alerte ne porte que des
 * identifiants (sujet, fenêtre, jour) et un message court : ni réponse, ni fait, ni clé.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AlertKind = "echec" | "jour-manquant" | "plafond" | "cout-illisible" | "rapport-pret" | "remesure-proposee";
export const ALERT_KINDS: AlertKind[] = ["echec", "jour-manquant", "plafond", "cout-illisible", "rapport-pret", "remesure-proposee"];

export interface Alert {
  kind: AlertKind;
  /** Sujet concerné ; null pour une alerte de tout l'ordonnanceur (plafond global, verrou). */
  subjectId: string | null;
  windowId: string | null;
  /** Jour UTC concerné (AAAA-MM-JJ). */
  day: string | null;
  message: string;
  at: string;
}

export interface AlertSink {
  readonly name: string;
  send(alert: Alert): void;
}

export const alertsPath = (dataDir: string) => join(dataDir, "alertes.jsonl");

/** Journal local, en ajout seul. */
export function journalSink(dataDir: string): AlertSink {
  const file = alertsPath(dataDir);
  return {
    name: "journal",
    send(alert) {
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, `${JSON.stringify(alert)}\n`);
    },
  };
}

/** Plusieurs canaux à la fois ; un canal en échec n'empêche pas les autres. */
export function fanOut(sinks: AlertSink[]): AlertSink {
  return {
    name: sinks.map((s) => s.name).join("+"),
    send(alert) {
      const errors: string[] = [];
      for (const s of sinks) {
        try {
          s.send(alert);
        } catch (err) {
          errors.push(`${s.name} : ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      if (errors.length === sinks.length && sinks.length) throw new Error(`alerte non envoyée (${errors.join(" ; ")})`);
    },
  };
}

export function readAlerts(dataDir: string): Alert[] {
  const file = alertsPath(dataDir);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as Alert);
}
