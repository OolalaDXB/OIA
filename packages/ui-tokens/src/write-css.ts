import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { genererCss } from "./css.js";

writeFileSync(fileURLToPath(new URL("../tokens.css", import.meta.url)), genererCss(), "utf8");
console.log("tokens.css régénéré.");
