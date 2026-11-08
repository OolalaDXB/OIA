// Lecteur PDF de Shyrka (corpus local) : PDFKit d'Apple, aucune dépendance.
// Lit le PDF sur l'entrée standard (jamais une copie sur disque), écrit sur la
// sortie standard un JSON { "pages": [{ "page": 1, "texte": "…" }], "chiffre": false }.
// Aucune reconnaissance optique : une page sans couche texte rend un texte vide.
import Foundation
import PDFKit

let maxPages = Int(CommandLine.arguments.dropFirst().first ?? "500") ?? 500
let donnees = FileHandle.standardInput.readDataToEndOfFile()
guard let doc = PDFDocument(data: donnees) else {
  FileHandle.standardError.write("pdf illisible\n".data(using: .utf8)!)
  exit(2)
}
if doc.isEncrypted && doc.isLocked {
  print("{\"pages\":[],\"chiffre\":true}")
  exit(0)
}
if doc.pageCount > maxPages {
  FileHandle.standardError.write("trop de pages (\(doc.pageCount))\n".data(using: .utf8)!)
  exit(3)
}
var pages: [[String: Any]] = []
for i in 0..<doc.pageCount {
  pages.append(["page": i + 1, "texte": doc.page(at: i)?.string ?? ""])
}
let sortie = try JSONSerialization.data(withJSONObject: ["pages": pages, "chiffre": false])
FileHandle.standardOutput.write(sortie)
