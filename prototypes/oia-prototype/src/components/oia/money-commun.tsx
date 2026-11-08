import type { ReactNode } from "react";
import { useOiaAuth, ConnexionOia } from "@/lib/oia-auth";
import { useAccesMoney } from "@/lib/donnees/money";
import { Button } from "@/components/ui/button";
import type { Json } from "@/integrations/supabase/types";
export const selectMoney = "min-h-11 max-w-full rounded-md border border-border bg-background px-2 text-sm text-muted-foreground";
export function EtatMoney({ loading, error, empty = false, message = "Aucune donnée dans cet espace.", retry, children }: { loading: boolean; error?: Error | null; empty?: boolean; message?: string; retry: () => unknown; children: ReactNode }) {
  if (loading) return <div role="status" className="space-y-3 py-6"><span className="sr-only">Chargement…</span>{[0, 1, 2].map((v) => <div key={v} className="h-8 animate-pulse rounded bg-muted motion-reduce:animate-none" />)}</div>;
  if (error) return <div role="alert" className="py-6"><p className="text-sm text-block">{"code" in error && error.code === "42501" ? "Accès non accordé. " : ""}{error.message}</p><Button variant="outline" className="mt-4" onClick={() => retry()}>Réessayer</Button></div>;
  if (empty) return <p role="status" className="py-6 text-sm text-muted-foreground">{message}</p>;
  return children;
}
export function AccesMoney({ children }: { children: ReactNode }) {
  const auth = useOiaAuth(); const access = useAccesMoney();
  if (auth.loading) return <EtatMoney loading retry={() => {}}>{null}</EtatMoney>;
  if (!auth.user) return <ConnexionOia />;
  if (access.isPending || access.isFetching || access.error) return <EtatMoney loading={access.isPending || access.isFetching} error={access.error} retry={access.refetch}>{null}</EtatMoney>;
  if (!access.data) return <p role="alert" className="text-sm">Accès non accordé à cet espace.</p>;
  return children;
}
export function VerifMoney({ value }: { value: boolean | null }) { return <span className="inline-flex items-center gap-1.5 text-xs"><span aria-hidden className={`size-1.5 rounded-full ${value ? "bg-ok" : "bg-warn"}`} />{value ? "Vérifié par un humain" : "Non vérifié"}</span>; }
export function ResultatJson({ value }: { value: Json | undefined | null }) { return <pre className="my-3 max-w-full overflow-auto whitespace-pre-wrap break-words border-l border-border pl-3 text-xs">{JSON.stringify(value, null, 2)}</pre>; }
export function telechargerMoney(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}