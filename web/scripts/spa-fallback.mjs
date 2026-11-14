// GitHub Pages : renvoie l'application pour toutes les adresses (liens partagés vers /evenement/...).
import fs from "node:fs";
fs.copyFileSync("dist/index.html", "dist/404.html");
console.log("dist/404.html créé");
