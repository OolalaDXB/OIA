// Donnée fictive. Vite + React point d'entrée.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function App() {
  return <h1>Fictive Vite Site</h1>;
}
