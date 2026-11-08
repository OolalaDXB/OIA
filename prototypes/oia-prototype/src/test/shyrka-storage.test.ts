import { describe, expect, it } from "vitest";
import { lireShyrka, sauverShyrka, SHYRKA_STORAGE_KEY, type SavedShyrka } from "@/lib/shyrka-storage";
function memory() { const values = new Map<string,string>(); return { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string, value:string) => { values.set(key,value); }, removeItem: (key:string) => { values.delete(key); } }; }
const saved: SavedShyrka = { version:1, messages:[{id:1,auteur:"Vous",texte:"Préparer une mission"},{id:2,auteur:"Shyrka",texte:"Mission fictive"}],actions:[{id:3,texte:"Relire la mission",faite:true}],decisions:[{id:4,texte:"Attendre la validation",faite:false}] };
describe("Sauvegarde locale Shyrka", () => {
 it("restaure la conversation après une nouvelle lecture", () => { const storage=memory(); sauverShyrka(storage,saved); expect(lireShyrka(storage)?.messages).toEqual(saved.messages); });
 it("restaure le journal et les cases cochées", () => { const storage=memory(); sauverShyrka(storage,saved); expect(lireShyrka(storage)?.actions).toEqual(saved.actions); expect(lireShyrka(storage)?.decisions).toEqual(saved.decisions); });
 it("efface toutes les données locales", () => { const storage=memory(); sauverShyrka(storage,saved); sauverShyrka(storage,{version:1,messages:[],actions:[],decisions:[]}); expect(storage.getItem(SHYRKA_STORAGE_KEY)).toBeNull(); });
 it("ignore les données corrompues", () => { const storage=memory(); storage.setItem(SHYRKA_STORAGE_KEY,'{"version":1,"messages":[{}]}'); expect(lireShyrka(storage)).toBeNull(); });
 it("signale une sauvegarde refusée", () => { expect(sauverShyrka({setItem:()=>{throw new Error("quota");},removeItem:()=>{}},saved)).toBe(false); });
});
