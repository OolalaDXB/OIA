/**
 * Pages existantes de la console OIA (apps/web, avant /oia) que chaque module
 * réutilise. Les liens ouvrent ces pages telles qu'elles sont, avec leurs
 * vraies données ; rien n'est recopié dans le prototype.
 */
export const consoleExistante: Record<string, { label: string; href: string; detail: string }[]> = {
  funding: [
    { label: "Opportunités", href: "/", detail: "Subventions, appels et investisseurs trouvés, à trier." },
    { label: "Argent", href: "/money/", detail: "Montants en jeu et ce qui bloque." },
    { label: "Aujourd'hui", href: "/digest/", detail: "Ce qui demande ton attention maintenant." },
  ],
  tenders: [{ label: "Appels d'offres", href: "/tenders/", detail: "Appels d'offres publics trouvés par la veille." }],
  ventures: [
    { label: "Projets", href: "/projects/", detail: "Le registre des projets et leurs fiches." },
    { label: "Investisseurs", href: "/investors/", detail: "Investisseurs repérés." },
  ],
  signals: [{ label: "Aujourd'hui", href: "/digest/", detail: "Veille du matin et alertes." }],
  crm: [{ label: "Espace de travail", href: "/workspace/", detail: "Tâches, notes et contacts." }],
};
