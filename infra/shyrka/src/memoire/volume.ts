import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { RefusMemoire } from "@oia/shyrka-noyau";

/**
 * Garde du volume chiffré `Shyrka-corpus` (mandat v10, A2 ; ADR 0004, § 1).
 *
 * Un chemin sous /Volumes ou un numéro de device différent ne prouve pas le
 * chiffrement : on demande à `hdiutil info` quelle image disque est montée à
 * ce point et si elle est chiffrée. Toute réponse incertaine vaut refus.
 * Aucun dossier n'est jamais créé à la place du volume.
 */
export const VOLUME_SHYRKA = "/Volumes/Shyrka-corpus";

export interface EtatVolume {
  point: string;
  monte: boolean;
  chiffre: boolean;
  image: string | null;
  inscriptible: boolean;
  detail: string;
}

/** Ce qu'on sait d'un point de montage. Injectable : les tests fournissent la leur. */
export type Sonde = (point: string) => { monte: boolean; chiffre: boolean; image: string | null; inscriptible: boolean };

/** Sonde macOS réelle : `hdiutil info -plist`, converti par `plutil`. Lecture seule. */
export const sondeMacOS: Sonde = (point) => {
  const plist = execFileSync("hdiutil", ["info", "-plist"], { encoding: "utf8", timeout: 15_000 });
  const json = execFileSync("plutil", ["-convert", "json", "-o", "-", "-"], { input: plist, encoding: "utf8", timeout: 15_000 });
  const info = JSON.parse(json) as { images?: { "image-path"?: string; "image-encrypted"?: boolean; writeable?: boolean; "system-entities"?: { "mount-point"?: string }[] }[] };
  for (const im of info.images ?? []) {
    if ((im["system-entities"] ?? []).some((e) => e["mount-point"] === point)) {
      return { monte: true, chiffre: im["image-encrypted"] === true, image: im["image-path"] ?? null, inscriptible: im.writeable === true };
    }
  }
  return { monte: false, chiffre: false, image: null, inscriptible: false };
};

function estLien(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

export function etatVolume(point: string = VOLUME_SHYRKA, sonde: Sonde = sondeMacOS): EtatVolume {
  const base = { point, monte: false, chiffre: false, image: null, inscriptible: false };
  if (estLien(point)) return { ...base, detail: "lien symbolique refusé à la place du volume" };
  if (!existsSync(point)) return { ...base, detail: "volume non monté (aucun dossier à cet emplacement)" };
  const l = lstatSync(point);
  if (l.isSymbolicLink()) return { ...base, detail: "lien symbolique refusé à la place du volume" };
  if (!l.isDirectory()) return { ...base, detail: "ce n'est pas un dossier" };
  if (realpathSync(point) !== point) return { ...base, detail: "chemin réel différent du point de montage attendu" };
  // Un dossier ordinaire a le même device que son parent : ce n'est pas un volume monté.
  if (statSync(point).dev === statSync(dirname(point)).dev) return { ...base, detail: "dossier ordinaire, pas un volume monté : refus" };
  let s: ReturnType<Sonde>;
  try {
    s = sonde(point);
  } catch (e) {
    return { ...base, detail: `vérification du chiffrement impossible (${(e as Error).message.split("\n")[0]}) : refus` };
  }
  if (!s.monte) return { ...base, detail: "aucune image disque montée à ce point : chiffrement non prouvé, refus" };
  if (!s.chiffre) return { ...base, monte: true, image: s.image, detail: "image disque NON chiffrée : refus" };
  return { point, monte: true, chiffre: true, image: s.image, inscriptible: s.inscriptible, detail: `image chiffrée ${s.image ?? "?"}` };
}

/**
 * Dossier de données vérifié, sous le volume. Seule voie pour obtenir un
 * emplacement de base : le volume doit être monté, chiffré, inscriptible, et
 * le sous-dossier ne doit être ni un lien symbolique ni sorti du volume.
 */
export interface DossierVerifie {
  readonly chemin: string;
  readonly volume: EtatVolume;
}

export function dossierVerifie(sousDossier: string, opts: { point?: string; sonde?: Sonde } = {}): DossierVerifie {
  const v = etatVolume(opts.point ?? VOLUME_SHYRKA, opts.sonde ?? sondeMacOS);
  if (!v.chiffre) throw new RefusMemoire(`Mémoire personnelle non activée : ${v.point} — ${v.detail}. Aucune écriture de repli en clair.`, "stockage_indisponible");
  if (!v.inscriptible) throw new RefusMemoire(`Volume ${v.point} monté en lecture seule : aucune écriture.`, "stockage_indisponible");
  if (!/^[a-z0-9][a-z0-9/_-]{0,80}$/.test(sousDossier) || sousDossier.includes("..")) throw new RefusMemoire("sous-dossier invalide", "valeur_refusee");
  const chemin = `${v.point}/${sousDossier}`;
  // Chaque segment existant doit être un vrai dossier, pas un lien.
  let p = v.point;
  for (const seg of sousDossier.split("/")) {
    p = `${p}/${seg}`;
    if (estLien(p)) throw new RefusMemoire(`Lien symbolique refusé dans la mémoire : ${p}`, "stockage_indisponible");
  }
  return { chemin, volume: v };
}
