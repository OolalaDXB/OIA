import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useOiaAuth } from "@/lib/oia-auth";

export function DefinePassword() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Définir mon mot de passe</Button>;
  if (done) return <p role="status" className="mt-4 text-sm">Votre mot de passe est enregistré.</p>;
  return <form className="mt-4 max-w-sm space-y-4" onSubmit={async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const password = String(form.get("password")); const current_password = String(form.get("current_password"));
    setError(null);
    if (password !== String(form.get("confirmation"))) { setError("Les mots de passe ne correspondent pas."); return; }
    setPending(true);
    try {
      const { error: failure } = await supabase.auth.updateUser({ password, ...(current_password ? { current_password } : {}) });
      if (failure) throw failure;
      setDone(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Modification indisponible. Réessayez."); }
    finally { setPending(false); }
  }}><h3 className="text-base">Définir mon mot de passe</h3><label className="block text-sm">Mot de passe actuel, si vous en avez un<Input name="current_password" type="password" autoComplete="current-password" className="mt-2 min-h-11" /></label><label className="block text-sm">Nouveau mot de passe<Input name="password" type="password" autoComplete="new-password" className="mt-2 min-h-11" required /></label><label className="block text-sm">Confirmer le mot de passe<Input name="confirmation" type="password" autoComplete="new-password" className="mt-2 min-h-11" required /></label>{error && <p role="alert" className="text-sm text-block">{error}</p>}<div className="flex flex-wrap gap-2"><Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le mot de passe"}</Button><Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Annuler</Button><Button asChild variant="ghost"><Link to="/forgot-password">Mot de passe oublié ?</Link></Button></div></form>;
}

export function ForgotPassword() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <div className="max-w-sm space-y-4"><h1 className="text-2xl">Mot de passe oublié</h1>{sent ? <p role="status">Si un compte correspond à cet e-mail, un lien de réinitialisation vous sera envoyé. Consultez aussi les courriers indésirables.</p> : <form className="space-y-4" onSubmit={async (event) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setPending(true); setError(null);
    try {
      const { error: failure } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (failure) throw failure;
      setSent(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Envoi indisponible. Réessayez."); }
    finally { setPending(false); }
  }}><label className="block text-sm">E-mail<Input name="email" type="email" autoComplete="email" className="mt-2 min-h-11" required /></label>{error && <p role="alert" className="text-sm text-block">{error}</p>}<Button disabled={pending} type="submit">{pending ? "Envoi…" : "Recevoir le lien"}</Button></form>}<Button variant="ghost" asChild><Link to="/auth">Retour à la connexion</Link></Button></div>;
}

export function ResetPassword() {
  const auth = useOiaAuth();
  const [hashRecovery, setHashRecovery] = useState(false);
  const [checked, setChecked] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setHashRecovery(params.get("type") === "recovery");
    if (params.has("error")) setError("Ce lien est invalide ou expiré. Demandez un nouveau lien.");
    setChecked(true);
  }, []);
  if (!checked || auth.loading) return <p role="status">Vérification du lien…</p>;
  if (done) return <div className="max-w-sm space-y-4"><h1 className="text-2xl">Mot de passe mis à jour</h1><p role="status">Votre nouveau mot de passe est enregistré.</p><Button asChild><Link to="/money-lookup">Ouvrir Money Lookup</Link></Button></div>;
  if (!auth.user || (!auth.recovery && !hashRecovery)) return <div className="max-w-sm space-y-4"><h1 className="text-2xl">Lien de réinitialisation requis</h1><p role="alert">{error || "Ouvrez le lien reçu par e-mail. S’il a expiré, demandez-en un nouveau."}</p><Button asChild><Link to="/forgot-password">Recevoir un nouveau lien</Link></Button></div>;
  return <form className="max-w-sm space-y-4" onSubmit={async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    setError(null);
    if (password !== String(form.get("confirmation"))) { setError("Les mots de passe ne correspondent pas."); return; }
    setPending(true);
    try {
      const { error: failure } = await supabase.auth.updateUser({ password });
      if (failure) throw failure;
      window.history.replaceState(null, "", window.location.pathname);
      setDone(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Modification indisponible. Réessayez."); }
    finally { setPending(false); }
  }}><h1 className="text-2xl">Nouveau mot de passe</h1><label className="block text-sm">Nouveau mot de passe<Input name="password" type="password" autoComplete="new-password" className="mt-2 min-h-11" required /></label><label className="block text-sm">Confirmer le mot de passe<Input name="confirmation" type="password" autoComplete="new-password" className="mt-2 min-h-11" required /></label>{error && <p role="alert" className="text-sm text-block">{error}</p>}<Button type="submit" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le mot de passe"}</Button></form>;
}