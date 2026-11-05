#!/usr/bin/env bash
# Vérifie une installation (principale ou de test) après restauration :
#  - nombres de lignes des tables clés (Elmo, CrawlSEO) ;
#  - jetons Google CrawlSEO déchiffrables avec le NEXTAUTH_SECRET de l'installation
#    (AES-256-GCM : un mauvais secret fait échouer le tag d'authentification) ;
#  - secrets Elmo stockés en base, et erreurs de déchiffrement dans les logs worker.
# N'affiche AUCUNE valeur de jeton ou de clé : uniquement OK/ÉCHEC et des comptes.
set -euo pipefail
source "$(dirname "$0")/lib.sh"

rc=0
if want elmo; then
echo "== Elmo ($ELMO_PROJECT)"
elmo_dc exec -T postgres psql -U elmo -d elmo -tA -F ' ' -c "
  select 'brands', count(*) from brands union all
  select 'prompts', count(*) from prompts union all
  select 'competitors', count(*) from competitors union all
  select 'prompt_runs', count(*) from prompt_runs union all
  select 'citations', count(*) from citations union all
  select 'usage_events', count(*) from usage_events union all
  select 'secrets(stockés en base)', count(*) from secrets;"
# Clé de chiffrement : chaque secret stocké est un JWE dont l'en-tête porte
# kid = sha256("elmo-secret-key-id\0" || clé)[:16]. kid identique à celui de
# l'ELMO_ENCRYPTION_KEY de cette installation => même clé => secrets lisibles.
elmo_dc exec -T postgres psql -U elmo -d elmo -tAc "select coalesce(json_agg(encrypted_value),'[]') from secrets" |
elmo_dc exec -T web node -e '
const c=require("crypto");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const key=Buffer.from(process.env.ELMO_ENCRYPTION_KEY||"","base64");
  if(key.length!==32){console.log("Elmo : ÉCHEC — ELMO_ENCRYPTION_KEY absente ou pas 32 octets");process.exit(1);}
  const kid=c.createHash("sha256").update("elmo-secret-key-id\0").update(key).digest("hex").slice(0,16);
  let ok=0,other=0,bad=0;
  for(const p of JSON.parse(s.trim()||"[]")){
    try{const h=JSON.parse(Buffer.from(String(p).split(".")[0],"base64url").toString());h.kid===kid?ok++:other++;}catch{bad++;}
  }
  console.log(`Elmo secrets en base : ${ok} sous la clé courante, ${other} sous une autre clé, ${bad} illisibles`);
  process.exit(other+bad>0?1:0);
});' || rc=1
if elmo_dc logs --no-color worker 2>&1 | grep -qiE 'decrypt|encryption key'; then
  echo "Elmo : ÉCHEC — le worker signale un problème de déchiffrement (voir logs)."; rc=1
else
  echo "Elmo : aucune erreur de déchiffrement dans les logs worker."
fi
fi

if want crawlseo; then
echo "== CrawlSEO ($CRAWLSEO_PROJECT)"
crawlseo_dc exec -T db psql -U crawlseo -d crawlseo -tA -F ' ' -c "
  select 'users', count(*) from \"User\" union all
  select 'users_with_google_tokens', count(*) from \"User\" where \"googleTokens\" is not null union all
  select 'sites', count(*) from \"Site\";"

# googleTokens (JSON) -> conteneur app, qui détient NEXTAUTH_SECRET -> OK/ÉCHEC.
crawlseo_dc exec -T db psql -U crawlseo -d crawlseo -tAc \
  "select coalesce(json_agg(\"googleTokens\"),'[]') from \"User\" where \"googleTokens\" is not null" |
crawlseo_dc exec -T app node -e '
const c=require("crypto");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
  const key=c.createHash("sha256").update(process.env.NEXTAUTH_SECRET||process.env.AUTH_SECRET||"").digest();
  const rows=JSON.parse(s.trim()||"[]");let ok=0,bad=0,plain=0;
  for(const t of rows)for(const f of ["accessToken","refreshToken"]){
    const v=t&&t[f]; if(typeof v!=="string")continue;
    if(!v.startsWith("enc:v1:")){plain++;continue;}
    const [iv,ct,tag]=v.slice(7).split(":").map(x=>Buffer.from(x,"base64"));
    try{const d=c.createDecipheriv("aes-256-gcm",key,iv);d.setAuthTag(tag);d.update(ct);d.final();ok++;}catch{bad++;}
  }
  console.log(`CrawlSEO jetons Google : ${ok} déchiffrables, ${bad} illisibles, ${plain} en clair (ancien format)`);
  process.exit(bad>0||rows.length===0?1:0);
});' || rc=1
echo "Test fonctionnel complémentaire : lancer une synchronisation Search Console depuis l'UI sans se reconnecter à Google."
fi
exit $rc
