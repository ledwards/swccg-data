const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const ONLY_RUN_MATCHER = null;

const ROUND_NAMES = [
  "Day 1",
  "Day 2",
  "Day 3",
  "Top 4",
  "Top 8",
  "Top 16",
  "Elite 8",
  "Quarterfinals",
  "Semifinals", // TODO: Disambiguate from "Semi-Finals"
  "Semi-Finals",
  "Finals",
  "Tiebreaker",
  "Round 1",
  "Round 2",
];

const titleCase = (title) =>
  title.replace(/[^\s]+/g, (word) =>
    word.replace(/^./, (first) => first.toUpperCase()),
  );

const DECKLIST_TXT_DIR = "./output/decklists/txt";
const DECKLIST_HTML_DIR = "./output/decklists/html";
const DECKLIST_JSON_DIR = "./output/decklists/json";

let tournamentLookupTable = {};
let archetypeLookupTable = {};
let playerLookupTable = {};

const blankedObjectives = () => {
  let rops = allCards.find((c) => c.gempId == "7_300");
  let ropsV = structuredClone(rops);
  ropsV.front.title = "Ralltiir Operations / In The Hands Of The Empire (V)";
  ropsV.abbr = rops.abbr.map((a) => a + " V");
  ropsV.gempId = "7_300v"; // fake, obviously
  return [ropsV];
};

let allCards = [];
let cardTypes = [];
let allTournaments = [];
let allArchetypes = [];
let allPlayers = [];

const main = async () => {
  let players = [];

  console.log(`(Step 1) Loading cards and txt decklists`);
  const darkCardData = await JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "output", "cards", "Dark.json"),
      "utf8",
    ),
  );
  const lightCardData = await JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "output", "cards", "Light.json"),
      "utf8",
    ),
  );
  allCards = [...darkCardData.cards, ...lightCardData.cards];
  allCards.push(...blankedObjectives()); // blanked Obj still used in decklists
  cardTypes = [
    ...new Set(
      allCards.map((c) => c.front.type.replace(/Jedi Test.*/, "Jedi Test")),
    ),
  ];

  allTournaments = await JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "public", "tournaments.json"),
      "utf8",
    ),
  );

  allTournaments.forEach((tournament) => {
    tournament.decklistUrls.forEach((url) => {
      tournamentLookupTable[url] = tournament;
    });
  });

  allArchetypes = await JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "public", "archetypes.json"),
      "utf8",
    ),
  );

  allArchetypes.forEach((archetype) => {
    archetype.decklistUrls.forEach((url) => {
      archetypeLookupTable[url] = archetype;
    });
  });

  allPlayers = await JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "public", "players.json"), "utf8"),
  );

  allPlayers.forEach((player) => {
    player.decklistUrls.forEach((url) => {
      playerLookupTable[url] = player;
    });
  });

  const filenames = fs
    .readdirSync(DECKLIST_TXT_DIR)
    .filter((fn) => fn.endsWith(".txt"))
    .filter((f) => {
      const outputFileName = `${DECKLIST_JSON_DIR}/${f.replace(
        ".txt",
        ".json",
      )}`;
      return !fs.existsSync(outputFileName);
    });

  const decklists = filenames

    // DEBUG to test an individual decklist
    .filter((f) => !ONLY_RUN_MATCHER || f.match(ONLY_RUN_MATCHER))

    .map((filename) => {
      let decklist = { slug: filename.split(".")[0], cards: [] };
      const headings = cardTypes
        .map((ct) => ct.toUpperCase() + "S")
        .concat(
          ["STARTING"].map(
            (h) => h.replaceAll("/", " \\/ "), // for regexp
          ),
        );

      const txtContent = fs.readFileSync(
        `${DECKLIST_TXT_DIR}/${filename}`,
        "utf8",
      );
      const lines = txtContent.split(/\r?\n/);
      [decklist.title, decklist.date, decklist.url] = lines.slice(0, 3);
      decklist.plaintext = lines.slice(4).join("\n");

      const tournament = lookupTournament(decklist);
      if (tournament) {
        decklist.tournament = tournament.name;
        decklist.event = tournament.event;
      } else {
        console.log(
          "ERROR: Could not find tournament for decklist",
          decklist.url,
        );
      }

      const archetype = lookupArchetype(decklist);
      if (archetype) {
        decklist.archetype = {
          name: archetype.name,
          shortName: archetype.shortName,
          aliases: archetype.aliases,
        };
        decklist.side = archetype.side;
      } else {
        console.log(
          "ERROR: Could not find archetype for decklist",
          decklist.url,
        );
      }

      const player = lookupPlayer(decklist);
      if (player) {
        decklist.player = {
          name: player.name,
          aliases: player.aliases,
        };
      } else {
        console.log("ERROR: Could not find player for decklist", decklist.url);
      }

      lines.slice(3).forEach((line, i) => {
        if (
          line.trim() == "" ||
          headings.map((h) => h.toUpperCase()).includes(line)
        ) {
          return;
        }

        let qtyStr = "";
        let qty = 1;
        let cardTitle = line.trim();

        const qtyMatch = line.match(/\s?x?(\d{1,2})x?\s?/i);
        if (qtyMatch) {
          qtyStr = qtyMatch[0];
          qty = parseInt(qtyMatch[1]);
          cardTitle = line.replace(qtyStr, "").trim();
        }

        // substitute if card is blanked
        cardTitle = substituteTitleIfNeeded(cardTitle);

        // TODO: Extract into method (and then library?)
        let isEp1Counterpart = false;
        if (cardTitle.includes("(Episode I)")) {
          cardTitle = cardTitle.replace(" (Episode I)", "");
          isEp1Counterpart = true;
        }

        let setToMatch = null;
        const setMatches = cardTitle.match(
          /\((Cloud City|Special Edition)\)/, // right now only needed for Boba Fett?
        );
        const setMapping = { "Cloud City": "5", "Special Edition": "7" };
        if (setMatches) {
          cardTitle = cardTitle.replace(` (${setMatches[0]})`, "");
          setToMatch = setMapping[setMatches[1]];
        }

        if (!decklist.side) {
          console.log("FUCK");
        }

        const matchingCard = allCards.find(
          (c) =>
            (!isEp1Counterpart ||
              (isEp1Counterpart &&
                c.front.icons &&
                c.front.icons.includes("Episode I"))) &&
            (!setToMatch || c.set == setToMatch) &&
            (!decklist.side || decklist.side == c.side) &&
            cleanCardTitle(cardTitle) == cleanCardTitle(c.front.title),
        );

        if (matchingCard) {
          const decklistCard = {
            title: cleanCardTitle(cardTitle),
            id: matchingCard.gempId,
            quantity: qty,
          };

          insertCardIntoDecklist(decklist, decklistCard);
        } else {
          console.log(
            `Could not find card for: ${line} in decklist ${DECKLIST_HTML_DIR}/${decklist.slug}.html`,
          );
        }
      });

      const roundRE = new RegExp(`(${ROUND_NAMES.join("|")})`);
      const matches = decklist.title.match(roundRE);
      if (matches) {
        decklist.round = matches[1];
        decklist.format =
          decklist.round && decklist.round != "Day 1" ? "Match Play" : "Swiss";
      }

      if (!decklist.archetype || !decklist.player) {
        console.log(
          `ERROR: Couldn't find archetype or player for ${decklist.title}`,
        );
        console.log(decklist.url);
        console.log(decklist.archetype);
        console.log(decklist.player);
      }

      // TODO: A few cards are missing a few cards
      decklist.count = decklist.cards.reduce((acc, c) => acc + c.quantity, 0);
      // if (decklist.count != 60) {
      //   console.log(
      //     `(${decklist.count}) Decklist:`,
      //     path.resolve(__dirname, "output/decklists/json", `${decklist.slug}.json`),
      //   );
      // }
      fs.writeFileSync(
        path.resolve(
          __dirname,
          "output/decklists/json",
          `${decklist.slug}.json`,
        ),
        JSON.stringify(decklist, null, 2),
      );

      return decklist;
    });

  fs.writeFileSync(
    path.resolve(__dirname, "public", "decklists.json"),
    JSON.stringify(decklists, null, 2),
  );

  console.log(`Parsed ${decklists.length} decklists.`);
  console.log(
    `${
      decklists.filter((d) => d.player && d.side && d.archetype).length
    } decklists have complete info.`,
  );
  console.log(
    `${
      decklists.filter((d) => d.count == 60).length
    } decklists have complete cardlists.`,
  );
  console.log(
    `${
      decklists.filter((d) => !d.title).length
    } decklists are missing a title.`,
  );
  console.log(
    `${
      decklists.filter((d) => !d.player).length
    } decklists are missing player.`,
  );
  console.log(
    `${decklists.filter((d) => !d.side).length} decklists are missing side.`,
  );
  console.log(
    `${
      decklists.filter((d) => !d.archetype).length
    } decklists are missing archetype.`,
  );

  console.log(
    `${
      decklists.filter((d) => d.count < 60).length
    } decklists are missing cards.`,
  );

  console.log(`${players.length} unique players found.`);
};

const insertCardIntoDecklist = (decklist, card) => {
  const existingDecklistCard = decklist.cards.find(
    (c) => c.title == card.title,
  );
  if (existingDecklistCard) {
    decklist.cards.find((c) => c.title == card.title).quantity += card.quantity;
  } else {
    decklist.cards.push(card);
  }
};

const cleanCardTitle = (title) =>
  title
    .replaceAll(/[<>•]/g, "")
    .replaceAll(/ \/ .*\(V\)/g, " (V)")
    .replaceAll(/ \/.*/g, "");

const substituteTitleIfNeeded = (title) =>
  title
    // blanked or renamed cards
    .replace("Ralltiir Operations (V)", "Ralltiir Operations")
    .replace("Macroscan (V)", "Death Star Reactor Terminal (V)")
    .replace("Death Star Reactor Terminal (V)", "Death Star Reactor Terminal")
    .replace("Evacuation Control (V)", "I Don't Like Sand")
    .replace("Imperial Justice (V)", "Coarse And Rough And Irritating")
    .replace("Imperial Domination (V)", "Imperial Enforcement")
    .replace(
      "Help Me Obi-Wan Kenobi & Quite A Mercenary",
      "Quite A Mercenary (V)",
    )
    .replace("Ability, Ability, Ability (V)", "Ability, Ability, Ability")
    .replace("Civil Disorder (V)", "Civil Disorder")
    .replace("Strategic Reserves (V)", "Strategic Reserves")
    .replace("Sense (V)", "Sense")
    .replace("Macroscan (V)", "Macroscan");

const inferSide = (decklist) => {
  const title = decklist.title;
  const plaintext = decklist.plaintext;

  const sidefromTitle =
    (title.includes(" DS ") ? "Dark" : null) ||
    (title.includes(" LS ") ? "Light" : null);
  const sideFromPlaintext =
    (plaintext.match(/Knowledge.{1,5}Defense/i) ? "Dark" : null) ||
    (plaintext.match(/Anger,? Fear,? Agg?ression/i) ? "Light" : null);

  return sideFromPlaintext || sidefromTitle;
};

const lookupTournament = (decklist) => tournamentLookupTable[decklist.url];
const lookupArchetype = (decklist) => archetypeLookupTable[decklist.url];
const lookupPlayer = (decklist) => playerLookupTable[decklist.url];

main();
