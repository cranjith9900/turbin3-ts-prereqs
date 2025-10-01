// scripts/generate-client.ts
import fs from "fs";
import path from "path";
import { createFromRoot } from "codama";
import { rootNodeFromAnchor, type AnchorIdl } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js";

const projectRoot = process.cwd();
// adjust the filename here if your IDL has a different name
const idlPath = path.join(projectRoot, "programs", "Turbin3_prereq.json");

if (!fs.existsSync(idlPath)) {
  console.error("IDL file not found at:", idlPath);
  process.exit(1);
}

const raw = fs.readFileSync(idlPath, "utf8");
const anchorIdl = JSON.parse(raw) as AnchorIdl;

// create Codama root from Anchor IDL
const codama = createFromRoot(rootNodeFromAnchor(anchorIdl));

// output directory for generated client
const outDir = path.join(projectRoot, "clients", "js", "src", "generated");
fs.mkdirSync(outDir, { recursive: true });

// generate the JavaScript client into outDir
codama.accept(renderJavaScriptVisitor(outDir));
console.log("✅ Client generated to:", outDir);
