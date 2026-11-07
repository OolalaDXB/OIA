import { oiaInterfaceEnabled, OIA_INTERFACE_FLAG } from "../../lib/oiaFlag";
import { OiaView } from "./OiaView";

/**
 * Interface web OIA, sous /oia. Bascule désactivée par défaut : la route existe
 * dans l'export statique, mais n'affiche qu'un avis et n'apparaît pas dans le
 * rail tant que la bascule n'est pas allumée au build.
 */
export const metadata = {
  title: "OIA",
  robots: { index: false, follow: false },
};

export default function OiaPage() {
  if (!oiaInterfaceEnabled()) {
    return (
      <main className="gate" data-oia-interface="off">
        <div className="gateCard">
          <h1>Interface OIA désactivée</h1>
          <p className="muted">
            Cette page existe mais reste éteinte. Elle s'allume au build avec{" "}
            <code>{OIA_INTERFACE_FLAG}=on</code>, sur décision de Mickaël.
          </p>
        </div>
      </main>
    );
  }
  return <OiaView />;
}
