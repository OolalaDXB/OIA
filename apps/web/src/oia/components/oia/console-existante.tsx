import { consoleExistante } from "@/data/console-existante";

/**
 * Liens vers les pages existantes de la console. Ce sont des liens simples
 * (rechargement complet) : la console garde sa propre mise en page et ses
 * propres styles.
 */
export function ConsoleExistante({ slug }: { slug: string }) {
  const pages = consoleExistante[slug];
  if (!pages?.length) return null;
  return (
    <section className="mt-2 border-t border-border py-8">
      <h2 className="text-base">Dans la console</h2>
      <ul className="mt-4">
        {pages.map((p) => (
          <li key={p.href} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border py-3 last:border-0">
            <a href={p.href} className="text-sm underline underline-offset-4">{p.label}</a>
            <span className="text-sm text-tertiary">{p.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
