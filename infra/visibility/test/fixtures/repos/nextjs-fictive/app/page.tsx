// Donnée fictive. Accueil minimaliste.
export default function Home() {
  return (
    <main>
      <h1>Fictive Site</h1>
      <p>Donnée fictive. Prix affiché côté client, qui pose problème pour les IA.</p>
      <PriceClientSide />
    </main>
  );
}

function PriceClientSide() {
  // Donnée fictive : prix rendu uniquement côté client (useEffect fictif).
  return <span id="price">loading...</span>;
}
