-- 0023 · Visibility : reconstruire un audit IA depuis ses réponses déjà payées (0 $).
--
-- Un audit dont la collecte a abouti mais qui a échoué ensuite (ex. le plan) garde ses réponses dans
-- vis.evidence. Une demande AUDIT_IA avec charge.reprise_de = <demande d'origine> relit ces réponses,
-- les note et produit le plan, sans aucun appel payant.
--
-- Retour arrière : drop function public.vis_moteur_preuves_audit(uuid, uuid).

create or replace function public.vis_moteur_preuves_audit(p_demande uuid, p_de uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d vis.demande;
  o vis.demande;
begin
  perform vis_ui.exiger_moteur();
  select * into d from vis.demande where id = p_demande;
  select * into o from vis.demande where id = p_de;
  if d.id is null or o.id is null or d.type <> 'AUDIT_IA' or o.type <> 'AUDIT_IA' or d.subject_id <> o.subject_id then
    raise exception 'reprise refusée : demandes d''audit différentes' using errcode = '42501';
  end if;
  if vis_ui.statut_demande(p_demande) <> 'RUNNING' then raise exception 'demande non RUNNING' using errcode = '55000'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'moteur', e.engine, 'langue', e.prompt_language, 'texte', e.raw_text, 'citations', e.citations, 'cout_usd', e.cost_usd,
      'question', e.structured #>> '{audit,question}', 'sujet', e.structured #>> '{audit,sujet}',
      'marquee', (e.structured #>> '{audit,marquee}')::boolean, 'question_texte', e.structured #>> '{audit,texte}')
      order by e.prompt_id, e.engine)
    from vis.evidence e where e.subject_id = d.subject_id and e.structured #>> '{audit,demande}' = p_de::text), '[]'::jsonb);
end $$;
revoke all on function public.vis_moteur_preuves_audit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vis_moteur_preuves_audit(uuid, uuid) to service_role;
