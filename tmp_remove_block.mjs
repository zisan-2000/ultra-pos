import fs from "node:fs";

const file = process.argv[2];
const startLine = Number(process.argv[3]);
const endLine = Number(process.argv[4]);
const replacement = process.argv[5] ? fs.readFileSync(process.argv[5], "utf8") : "";

const text = fs.readFileSync(file, "utf8");
const lines = text.split("\n");
if (startLine < 1 || endLine > lines.length || startLine > endLine) {
  console.error(`Invalid range ${startLine}..${endLine} (file has ${lines.length} lines)`);
  process.exit(1);
}
const before = lines.slice(0, startLine - 1).join("\n");
const after = lines.slice(endLine).join("\n");
const replText = replacement.replace(/\n+$/, "");
const middle = replText ? `${replText}\n` : "";
const joiner = before && (replText || after) ? "\n" : "";
const out = before + joiner + middle + after;
fs.writeFileSync(file, out);
console.log(`removed lines ${startLine}..${endLine} (${endLine - startLine + 1} lines)`);
