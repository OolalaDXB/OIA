import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSubjectsDir, loadSubject, loadSubjects, listSubjectDirs } from "./load";
import { renderElmoBrief, renderReview } from "./render";

/**
 * Usage (from infra/visibility):
 *   tsx src/cli.ts validate              validate every subject
 *   tsx src/cli.ts list                  one subject id per line
 *   tsx src/cli.ts urls [<id>]           primary + confirmed URLs (all subjects if no id), "id<TAB>url"
 *   tsx src/cli.ts review <id> [--write] review sheet (Markdown); --write saves REVIEW.md in the subject folder
 *   tsx src/cli.ts elmo-brief <id>       JSON sheet to configure the brand in Elmo
 * The subjects folder is OIA_VIS_SUBJECTS_DIR or infra/visibility/subjects.
 */
const [cmd, arg, flag] = process.argv.slice(2);
const root = defaultSubjectsDir();
const byId = (id: string | undefined) => {
  if (!id) throw new Error("subject id required");
  const dir = listSubjectDirs(root).find((d) => d.endsWith(`/${id}`) || d.endsWith(`\\${id}`));
  if (!dir) throw new Error(`no subject "${id}" in ${root}`);
  return loadSubject(dir);
};

switch (cmd) {
  case "validate": {
    const all = loadSubjects(root);
    for (const b of all)
      console.log(`ok  ${b.subject.id}  (panel v${b.panel.panelVersion} ${b.panel.status}, ${b.panel.prompts.filter((p) => p.status === "active").length} questions actives)`);
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
  case "elmo-brief":
    process.stdout.write(renderElmoBrief(byId(arg)));
    break;
  default:
    console.error("usage: cli.ts validate | list | urls [<id>] | review <id> [--write] | elmo-brief <id>");
    process.exit(2);
}
