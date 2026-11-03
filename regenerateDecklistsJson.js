const fs = require("fs");
const path = require("path");

const DECKLIST_JSON_DIR = "./output/decklists/json";

const main = () => {
  console.log("Reading individual decklist JSON files...");

  const filenames = fs
    .readdirSync(DECKLIST_JSON_DIR)
    .filter((fn) => fn.endsWith(".json"));

  console.log(`Found ${filenames.length} decklist files`);

  const decklists = filenames.map((filename) => {
    const content = fs.readFileSync(
      path.resolve(DECKLIST_JSON_DIR, filename),
      "utf8"
    );
    return JSON.parse(content);
  });

  console.log("Writing combined decklists.json...");

  fs.writeFileSync(
    path.resolve(__dirname, "public", "decklists.json"),
    JSON.stringify({ decklists: decklists })
  );

  console.log(`Successfully wrote ${decklists.length} decklists to public/decklists.json`);

  // Log some stats
  console.log(
    `${
      decklists.filter((d) => d.player && d.side && d.archetype).length
    } decklists have complete info.`
  );
  console.log(
    `${
      decklists.filter((d) => d.tournament && d.tournament.name).length
    } decklists have tournament info.`
  );
  console.log(
    `${
      decklists.filter((d) => !d.tournament || !d.tournament.name).length
    } decklists are missing tournament info.`
  );
};

main();
