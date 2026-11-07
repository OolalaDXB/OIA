import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse, stringify as yamlStringify } from "yaml";
import { checkCapture, renderCaptureTemplate } from "./capture";
import { activeFreezes, defaultSubjectsDir, loadSubject, loadSubjects, listSubjectDirs } from "./load";
import { diffPanels, proposePanel, resolveHumanValidator, type HumanIdentity } from "./panel-generator";
import { PanelSchema } from "./schema";
import { renderElmoBrief, renderReview } from "./render";
import { applicableChecks, checksForFamily, checksForTool, flatChecks, loadFamilies, Tool } from "./verification";

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
    case "verifications": {
      // Usage :
      //   tsx src/cli.ts verifications                    tous les contrôles
      //   tsx src/cli.ts verifications --family B         une famille
      //   tsx src/cli.ts verifications --tool crawlie     ciblés par un outil
      //   tsx src/cli.ts verifications --subject <id>     applicables au sujet
      const famIdx = argv.indexOf("--family");
      const toolIdx = argv.indexOf("--tool");
      const subjIdx = argv.indexOf("--subject");
      const families = loadFamilies();
      let checks = flatChecks(families);
      if (famIdx >= 0 && argv[famIdx + 1]) checks = checksForFamily(argv[famIdx + 1]!, families);
      if (toolIdx >= 0 && argv[toolIdx + 1]) {
        const t = Tool.parse(argv[toolIdx + 1]);
        checks = checksForTool(t, checks);
      }
      if (subjIdx >= 0 && argv[subjIdx + 1]) {
        const b = byId(argv[subjIdx + 1]);
        checks = applicableChecks(
          { ownership: b.subject.ownership, languages: b.subject.languages },
          checks,
        );
      }
      console.log(`${checks.length} contrôle(s)`);
      for (const c of checks)
        console.log(`  ${c.id}  ${c.severity.padEnd(13)} ${c.mode.padEnd(7)} ${c.tool.padEnd(9)} ${c.label}`);
      break;
    }
    case "panel": {
      const sub = argv[1];
      const subjectId = argv[2];
      switch (sub) {
        case "propose": {
          const b = byId(subjectId);
          const today = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? new Date().toISOString().slice(0, 10);
          const panel = await proposePanel(b.subject, { today, panelVersion: b.panel.panelVersion + 1 });
          const out = argv.includes("--write")
            ? join(b.dir, `panel.proposal.v${panel.panelVersion}.yaml`)
            : "";
          const yaml = yamlStringify(panel);
          if (out) {
            if (existsSync(out)) throw new Error(`${out} already exists: never overwritten`);
            writeFileSync(out, yaml, { flag: "wx" });
            console.log(`proposition écrite : ${out}  (${panel.prompts.length} questions)`);
          } else {
            process.stdout.write(yaml);
          }
          break;
        }
        case "diff": {
          if (!subjectId) throw new Error("usage: panel diff <id> <proposalFile>");
          const b = byId(subjectId);
          const proposalFile = argv[3];
          if (!proposalFile) throw new Error("usage: panel diff <id> <proposalFile>");
          const proposal = PanelSchema.parse(parse(readFileSync(proposalFile, "utf8")));
          const lines = diffPanels(b.panel, proposal);
          if (lines.length === 0) console.log("aucune différence");
          else process.stdout.write(lines.join("\n") + "\n");
          break;
        }
        case "validate": {
          if (!subjectId) throw new Error("usage: panel validate <id> <proposalFile>");
          const b = byId(subjectId);
          const proposalFile = argv[3];
          if (!proposalFile) throw new Error("usage: panel validate <id> <proposalFile>");
          const humansFile = resolve(dirname(defaultSubjectsDir()), "humans.yaml");
          if (!existsSync(humansFile)) throw new Error(`humans.yaml absent : ${humansFile}`);
          const humans = ((parse(readFileSync(humansFile, "utf8")) as { humans?: HumanIdentity[] })?.humans ?? []);
          const who = resolveHumanValidator(humans, {
            OIA_SEO_HUMAN_IDENTITY: process.env.OIA_SEO_HUMAN_IDENTITY,
            OIA_SEO_IS_AGENT: process.env.OIA_SEO_IS_AGENT,
          });
          const proposal = PanelSchema.parse(parse(readFileSync(proposalFile, "utf8")));
          const today = new Date().toISOString().slice(0, 10);
          const validated = PanelSchema.parse({
            ...proposal,
            status: "validated",
            validatedBy: who.email,
            validatedAt: today,
            prompts: proposal.prompts.map((p) => (p.status === "proposed" ? { ...p, status: "active" as const } : p)),
          });
          const destination = join(b.dir, `panel.validated.v${validated.panelVersion}.yaml`);
          if (existsSync(destination)) throw new Error(`${destination} already exists: never overwritten`);
          writeFileSync(destination, yamlStringify(validated), { flag: "wx" });
          console.log(`panel validé par ${who.email} (${who.id}) écrit : ${destination}`);
          break;
        }
        default:
          throw new Error("usage: panel propose <id> [date] [--write] | panel diff <id> <proposalFile> | panel validate <id> <proposalFile>");
      }
      break;
    }
    default:
      console.error(
        "usage: cli.ts validate | list | urls [<id>] | review <id> [--write] | elmo-brief <id> | freezes [<id>] | capture-template <id> <engine> [date] [--draft] | capture-check <file> | panel propose|diff|validate <id> [args] | verifications [--family X] [--tool T] [--subject <id>]",
      );
      process.exit(2);
  }
} catch (e) {
  console.error(`erreur : ${(e as Error).message}`);
  process.exitCode = 2;
}
