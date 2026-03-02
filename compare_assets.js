const fs = require('fs');

const horizonAssets = JSON.parse(fs.readFileSync('horizon_assets.json'));
const dawnAssets = JSON.parse(fs.readFileSync('dawn_assets.json'));

const horizonSections = horizonAssets.filter(a => a.startsWith('sections/'));
const dawnSections = dawnAssets.filter(a => a.startsWith('sections/'));

const customSections = horizonSections.filter(s => !dawnSections.includes(s));

console.log("Custom Horizon Sections mapping candidate (potentially missing in Dawn):");
console.log(customSections);

const horizonSnippets = horizonAssets.filter(a => a.startsWith('snippets/'));
const dawnSnippets = dawnAssets.filter(a => a.startsWith('snippets/'));
const customSnippets = horizonSnippets.filter(s => !dawnSnippets.includes(s));
console.log("\nCustom Horizon Snippets mapping candidate:");
console.log(customSnippets);
