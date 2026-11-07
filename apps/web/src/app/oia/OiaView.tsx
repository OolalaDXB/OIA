"use client";

import { Shell } from "../Shell";
import { useLang } from "../../lib/lang";
import { IDENTITIES, PHASES, SHYRKA_STEPS, STATE_LABEL } from "../../lib/oiaOverview";

/** Vue d'ensemble OIA : trois identités, phases de la roadmap, piste Shyrka. */
export function OiaView() {
  const { lang } = useLang();
  return (
    <Shell
      active="oia"
      title="OIA"
      note={
        lang === "fr"
          ? "Vue de lecture tirée de la roadmap 3.6 et du cadre de Shyrka. Aucune action, aucun appel à un fournisseur."
          : "Read-only view drawn from roadmap 3.6 and Shyrka's framework. No action, no provider call."
      }
    >
      <section className="oiaSection" data-oia-interface="on">
        <h2>{lang === "fr" ? "Trois identités" : "Three identities"}</h2>
        <div className="oiaGrid">
          {IDENTITIES.map((i) => (
            <div key={i.id} className="kindCard">
              <strong>{i.name}</strong>
              <p className="muted">{i.role[lang]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="oiaSection">
        <h2>{lang === "fr" ? "Phases" : "Phases"}</h2>
        <table className="oiaTable">
          <tbody>
            {PHASES.map((p) => {
              const step = SHYRKA_STEPS.find((s) => s.id === p.shyrka);
              return (
                <tr key={p.id}>
                  <td><strong>{p.id}</strong></td>
                  <td>{p.title[lang]}</td>
                  <td className="muted">{STATE_LABEL[p.state][lang]}</td>
                  <td>{step ? step.name[lang] : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="oiaSection">
        <h2>{lang === "fr" ? "Piste Shyrka" : "Shyrka track"}</h2>
        <div className="oiaGrid">
          {SHYRKA_STEPS.map((s) => (
            <div key={s.id} className="kindCard">
              <strong>{s.name[lang]}</strong> <span className="muted">· {s.phase}</span>
              <p className="muted">{s.scope[lang]}</p>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}
