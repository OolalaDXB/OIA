-- 0005 · Réponses reçues sans texte (mandat v14, bloc B).
--
-- Elmo 0.7.7 a laissé 14 réponses de Mistral sans texte extrait à J0 : la réponse a
-- bien eu lieu (run, coût, sortie brute), mais aucun texte n'est lisible. La règle
-- « réponses en base = runs d'Elmo » impose de les garder dans vis.evidence, sans
-- inventer de texte. 0001 exigeait raw_text non vide : on l'accepte vide SEULEMENT si la
-- preuve est marquée non mesurée (structured.non_mesuree = true). Son empreinte reste
-- celle du texte vide, calculée par le trigger, identique à la table des preuves locale.
--
-- Rien d'autre ne change : append-only, trigger d'empreinte, RLS.
--
-- Retour arrière (seulement si aucune preuve non mesurée n'a été importée ; sinon il
-- échoue, ce qui est voulu) :
--   alter table vis.evidence drop constraint evidence_raw_text_ou_non_mesuree;
--   alter table vis.evidence add constraint evidence_raw_text_check check (char_length(raw_text) >= 1);

begin;

alter table vis.evidence drop constraint if exists evidence_raw_text_check;
alter table vis.evidence drop constraint if exists evidence_raw_text_ou_non_mesuree;
alter table vis.evidence add constraint evidence_raw_text_ou_non_mesuree
  check (char_length(raw_text) >= 1 or (structured ->> 'non_mesuree')::boolean is true);

comment on constraint evidence_raw_text_ou_non_mesuree on vis.evidence is
  'Texte non vide, sauf réponse reçue sans texte et marquée structured.non_mesuree = true (0005, mandat v14).';

commit;
