// Vérifie que chaque morceau du catalogue a bien un extrait Deezer.
// Usage : npm run check:catalog [-- films games …]
import { CATEGORIES } from "../src/lib/catalog";
import { resolveSeed } from "../src/lib/server/tracks";

async function main() {
  let missing = 0;
  const only = process.argv.slice(2);
  for (const cat of CATEGORIES.filter((c) => !only.length || only.includes(c.id))) {
    const results = await Promise.all(
      cat.tracks.map(async (s) => [s, await resolveSeed(s, !!cat.workTitle)] as const),
    );
    const bad = results.filter(([, r]) => !r);
    missing += bad.length;
    console.log(`${cat.label}: ${results.length - bad.length}/${results.length}`);
    for (const [s] of bad) console.log(`   ✗ ${s.artist} — ${s.title}`);
    if (cat.workTitle) for (const [s, r] of results) if (r) console.log(`   · ${s.title} → ${r.artist} — ${r.title}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(missing ? `${missing} morceau(x) introuvable(s)` : "Tout est disponible ✔");
}
main();
