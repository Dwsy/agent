import { listKnowledge } from "./knowledge.ts";

const list = listKnowledge(null);

console.log("All sources:");
for (const src of list.sources) {
  console.log(`\n[${src.id}] ${src.description} (readonly: ${src.readonly})`);
  for (const cat of src.categories) {
    console.log(`  ${cat.category}/ (${cat.entries.length} entries)`);
    for (const e of cat.entries.slice(0, 3)) {
      console.log(`    - ${e.file}: ${e.title}`);
      console.log(`      tags: [${e.tags.join(", ")}]`);
      console.log(`      desc: ${e.description.slice(0, 80)}...`);
    }
    if (cat.entries.length > 3) {
      console.log(`    ... and ${cat.entries.length - 3} more`);
    }
  }
}

console.log("\n\nTag index sample:");
const tags = Object.keys(list.tagIndex).slice(0, 20);
console.log(tags.join(", "));
