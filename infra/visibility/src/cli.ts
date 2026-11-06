import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse } from "yaml";
import { checkCapture, renderCaptureTemplate } from "./capture";
import { activeFreezes, defaultSubjectsDir, loadSubject, loadSubjects, listSubjectDirs } from "./load";
import { renderElmoBrief, renderReview } from "./render";

/**
 * Usage (from infra/visibility):
 *   tsx src/cli.ts validate              validate every subject
 *   tsx src/cli.ts list                  one subject id per line
 *   tsx src/cli.ts urls [<id>]           primary + confirmed URLs (all subjects if no id), "id<TAB>url"
 *   tsx src/cli.ts review <id> [--write] review sheet (Markdown); --write saves REVIEW.md in the subject folder
 *   tsx src/cli.ts elmo-brief <id>       JSON sheet to configure the brand in Elmo
 *   tsx src/cli.ts freezes [<id>]        freezes in force (exit 1 if any): read before proposing an execution
 *   tsx src/cli.ts capture-template <id> <engine> [YYYY-MM-DD] [--draft]
 *                                        manual-capture file for a consumer-app engine, written to
 *                                        $OIA_VIS_DATA/manual/<date>/<id>/<engine>.md (never overwritten)
 *   tsx src/cli.ts capture-check <file>  validate a filled capture, write <file>.json (raw metrics), exit 1 on problems
 * The subjects folder is OIA_VIS_SUBJECTS_DIR or infra/visibility/subjects.
 */
const argv = process.argv.slice(2);
const [cmd, arg, flag] = argv;
const dataDir = () => resolve(process.env.OIA_VIS_DATA ?? join(homedir(), "oia-visibility-data"));
const root = defaultSubjectsDir();
const byId = (id: string | undefined) => {
  if (!id) throw new Error("subject id required");
  const dir = listSubjectDirs(root).find((d) => d.endsWith(`/${id}`) || d.endsWith(`\\${id}`));
  if (!dir) throw new Error(`no subject "${id}" in ${root}`);
  return loadSubject(dir);
};

try {
  switch (cmd) {
    case "validate": {
      const all = loadSubjects(root);
      for (const b of all)
        console.log(
          `ok  ${b.subject.id}  (panel v${b.panel.panelVersion} ${b.panel.status}, ${b.panel.prompts.filter((p) => p.status === "active").length} questions actives)`,
        );
      console.log(`${all.length} sujet(s) valides dans ${root}`);
      break;
    }
    case "list":
      for (const b of loadSubjects(root)) console.log(b.subject.id);
      break;
    case "urls": {
      const bundles = arg ? [byId(arg)] : loadSubjects(root);
      for (const { subject: s } of bundles) {
        console.log(`${s.id}\t${s.urls.primary}`);
        for (const a of s.urls.additional) if (a.status === "confirmed") console.log(`${s.id}\t${a.url}`);
      }
      break;
    }
    case "review": {
      const b = byId(arg);
      const md = renderReview(b);
      if (flag === "--write") writeFileSync(join(b.dir, "REVIEW.md"), md);
      else process.stdout.write(md);
      break;
    }
    case "freezes": {
      const bundles = arg ? [byId(arg)] : loadSubjects(root);
      let n = 0;
      for (const b of bundles)
        for (const f of activeFreezes(b)) {
          n++;
          console.log(
            `${b.subject.id}\t${f.id}\t${f.scope.join(",")}\tjusqu'à la fin de ${f.untilEndOfWindow}\t${f.rule}`,
          );
        }
      if (n === 0) console.log("aucun gel en vigueur");
      process.exitCode = n > 0 ? 1 : 0;
      break;
    }
    case "capture-template": {
      const b = byId(arg);
      const engine = argv[2];
      if (!engine) throw new Error("usage: capture-template <id> <engine> [YYYY-MM-DD] [--draft]");
      const date = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 10);
      if (b.panel.status !== "validated" && !argv.includes("--draft"))
        throw new Error(
          `panel v${b.panel.panelVersion} of ${b.subject.id} is not validated (use --draft for a rehearsal that will not count)`,
        );
      const file = join(dataDir(), "manual", date, b.subject.id, `${engine}.md`);
      if (existsSync(file)) throw new Error(`${file} already exists: never overwritten`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, renderCaptureTemplate(b, engine, date), { flag: "wx" });
      console.log(file);
      break;
    }
    case "capture-check": {
      if (!arg) throw new Error("usage: capture-check <file>");
      const text = readFileSync(arg, "utf8");
      const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
      const subjectId = fm ? String((parse(fm[1]!) as Record<string, unknown> | null)?.subject ?? "") : "";
      const report = checkCapture(byId(subjectId), text);
      const out = arg.replace(/\.md$/, "") + ".json";
      writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
      const s = report.summary;
      console.log(`${report.subject} · ${report.engine} · ${report.date} · panel v${report.panelVersion}`);
      console.log(
        `questions attendues ${s.expected} · capturées ${s.captured} · non capturées ${s.notCaptured} · non remplies ${s.unfilled}`,
      );
      console.log(
        `marque mentionnée ${s.brandMentioned}/${s.captured} · domaine de la marque cité ${s.brandCited}/${s.captured}`,
      );
      const rivals = Object.entries(s.competitorsMentioned).filter(([, n]) => n > 0);
      console.log(`concurrents mentionnés : ${rivals.map(([k, n]) => `${k} ${n}`).join(", ") || "aucun"}`);
      console.log(`empreinte SHA-256 du fichier : ${report.fileSha256}`);
      console.log(`-> ${out}`);
      if (report.problems.length) {
        console.error(`${report.problems.length} problème(s) :\n  - ${report.problems.join("\n  - ")}`);
        process.exitCode = 1;
      }
      break;
    }
    case "elmo-brief":
      process.stdout.write(renderElmoBrief(byId(arg)));
      break;
    default:
      console.error(
        "usage: cli.ts validate | list | urls [<id>] | review <id> [--write] | elmo-brief <id> | freezes [<id>] | capture-template <id> <engine> [date] [--draft] | capture-check <file>",
      );
      process.exit(2);
  }
} catch (e) {
  console.error(`erreur : ${(e as Error).message}`);
  process.exitCode = 2;
}
