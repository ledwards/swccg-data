const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const ONLY_RUN_MATCHER = null;

const { roundNames } = require("./lib/constants");

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

      const roundRE = new RegExp(`(${roundNames.join("|")})`);
      const matches = decklist.title.match(roundRE);
      if (matches) {
        decklist.round = matches[1];
        decklist.format =
          decklist.round && decklist.round != "Day 1" ? "Match Play" : "Swiss";
      }
      decklist.cards = []; // for modifier checking, we need to know the actual cards

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
            cardData: matchingCard,
          };

          insertCardIntoDecklist(decklist, decklistCard);
        } else {
          console.log(
            `Could not find card for: ${line} in decklist ${DECKLIST_HTML_DIR}/${decklist.slug}.html`,
          );
        }
      });

      decklist.archetype.modifiers = determineModifiers(decklist);

      if (!decklist.archetype || !decklist.player) {
        console.log(
          `ERROR: Couldn't find archetype or player for ${decklist.title}`,
        );
        console.log(decklist.url);
        console.log(decklist.archetype);
        console.log(decklist.player);
      }

      decklist = {
        slug: decklist.slug,
        title: decklist.title,
        date: decklist.date,
        url: decklist.url,
        tournament: decklist.tournament,
        event: decklist.event,
        round: decklist.round,
        format: decklist.format,
        archetype: decklist.archetype,
        player: decklist.player,
        side: decklist.side,
        cards: decklist.cards.map((c) => {
          return {
            title: c.title,
            id: c.id,
            quantity: c.quantity,
          };
        }),
        plaintext: decklist.plaintext,
        count: decklist.cards.reduce((acc, c) => acc + c.quantity, 0),
      };

      // TODO: A few cards are missing a few cards

      if (decklist.count != 60) {
        console.log(`(${decklist.count}) Decklist:`, decklist.url);
      }

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
  if (["Luke Skywalker, The Emperor's Prize"].includes(card.title)) {
    return;
  }

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

const lookupTournament = (decklist) => tournamentLookupTable[decklist.url];
const lookupArchetype = (decklist) => archetypeLookupTable[decklist.url];
const lookupPlayer = (decklist) => playerLookupTable[decklist.url];

const determineModifiers = (decklist) => {
  const cardTitles = decklist.cards.map((c) => cleanCardTitle(c.title));
  const objective = decklist.cards.find(
    (c) => c.cardData.front.type == "Objective",
  );

  let modifiers = [];
  if (objective) {
    const objectiveCard = objective.cardData;
    const objectiveName = cleanCardTitle(objectiveCard.front.title);

    switch (objectiveName) {
      case "I Want That Map":
        displayName = "Map";
        if (cardTitles.includes("The First Order Was Just The Beginning")) {
          modifiers.push("Zombies");
        }
        break;

      case "Watch Your Step":
        if (cardTitles.includes("Kessel Run")) {
          modifiers.push("Kessel Run");
        } else if (cardTitles.includes("Kessel Run (V)")) {
          modifiers.push("Kessel Run (V)");
        }
        break;

      case "Agents In The Court":
        const repSpecies = determineRepSpecies(decklist);
        if (repSpecies) {
          modifiers.push(repSpecies + "s");
        }
        break;

      case "Hidden Base":
        THRESHOLD = 4;
        const starshipTypes = ["X-Wing", "Mon Calamari Star Cruiser", "TIE"];
        starshipTypes.forEach((type) => {
          if (
            decklist.cards.filter((c) =>
              (c.cardData.front.extraText
                ? c.cardData.front.extraText.join(" ")
                : ""
              ).includes(type),
            ).length >= THRESHOLD
          ) {
            modifiers.push(type + "s");
          }
        });

        if (
          decklist.cards.filter(
            (c) =>
              c.cardData.front.type == "Weapon" &&
              c.cardData.front.subType == "Starship",
          ).length >= THRESHOLD
        ) {
          modifiers.push("Starship Weapons"); // TODO: Investigate what kind of weapons. Quads?
        }
        break;

      case "Mind What You Have Learned":
        const jediTestCount = decklist.cards.filter((c) =>
          c.cardData.front.type.includes("Jedi Test"),
        ).length;
        modifiers.push(`Test #${jediTestCount}`);
        break;

      case "Yavin 4 Base Operations":
        if (cardTitles.includes("Launching The Assault")) {
          modifiers.push("Home One");
        }
        break;

      case "Ralltiir Operations (V)":
        if (
          decklist.cards.filter(
            (c) =>
              c.cardData.front.type == "Character" &&
              c.cardData.front.subType == "First Order",
          ).length >= 4
        ) {
          modifiers.push("First Order");
        }
        break;
    }
  }

  // these cards create a modifier
  if ((c = findCardInDecklist("Epic Duel", decklist))) {
    modifiers.push("Dueling");
  }

  if ((c = findCardInDecklist("Trooper Assault", decklist))) {
    modifiers.push("Troopers");
  }

  if ((c = findCardInDecklist("Speeder Bike", decklist))) {
    modifiers.push("Speeder Bikes");
  }

  if ((c = findCardInDecklist("Destroyer Droid", decklist))) {
    modifiers.push("Destroyer Droids");
  }

  if (
    (c = findCardInDecklist("An Entire Legion Of My Best Troops", decklist))
  ) {
    modifiers.push("9's");
  }

  if (
    (c = findCardInDecklist("They Must Never Again Leave This City", decklist))
  ) {
    modifiers.push("Free Executor");
  }

  if ((c = findCardInDecklist("Clouds", decklist))) {
    modifiers.push("Clouds");
  }

  if ((c = findCardInDecklist("Armored Attack Tank", decklist))) {
    modifiers.push("Tanks");
  }

  if (
    (c =
      decklist.cards.filter((c) =>
        c.title.match("How Did We Get Into This Mess?"),
      ).length >= 3)
  ) {
    modifiers.push("Mess");
  }

  if (
    (c =
      decklist.cards.filter(
        (c) =>
          c.title.match("Celebration") && c.cardData.front.type == "Effect",
      ).length >= 2)
  ) {
    modifiers.push("Celebration");
  }

  if (
    (c =
      decklist.cards.filter(
        (c) => c.title.match("Occupation") && c.cardData.front.type == "Effect",
      ).length >= 2)
  ) {
    modifiers.push("Occupation");
  }

  // modifiers based on some threshold of cards
  // TODO: count quantity per card
  if (
    decklist.cards.filter(
      (c) => c.cardData.front.destiny == 7 || c.cardData.destiny == "0 or 7",
    ).length > 4
  ) {
    modifiers.push("7's");
  }

  if (
    decklist.cards.filter(
      (c) =>
        c.title.match("Docking Bay") &&
        c.cardData.front.darkSideIcons > 0 &&
        c.cardData.front.lightSideIcons > 0,
    ).length > 1 // maybe 2?
  ) {
    modifiers.push("Docking Bays");
  }

  const CHEESE_CARDS = [
    "Beggar",
    "Revolution",
    "Frozen Assets",
    "Goo Nee Tay",
    "Never Tell Me The Odds",
  ];
  if (
    decklist.cards.filter((c) => CHEESE_CARDS.includes(cleanCardTitle(c.title)))
      .length > 1
  ) {
    modifiers.push("Shield Busting");
  }

  return modifiers;
};

const determineRepSpecies = (decklist) => {
  const THRESHOLD = 3;
  const characters = decklist.cards.filter(
    (c) => c.cardData.front.type == "Character",
  );
  const species = ["Gungan", "Mandalorian", "Wookiee"]; // should do more of these...
  let speciesCounts = {};

  species.forEach((sp) => {
    const count = characters.filter(
      (c) =>
        c.cardData.front.lore.match(sp) ||
        c.cardData.front.title.match(sp) ||
        c.cardData.front.extraText?.join(" ").includes(sp),
    ).length;
    speciesCounts[sp] = count;
  });

  if (Object.keys(speciesCounts)) {
    const [maxSpecies, maxCount] = [...Object.entries(speciesCounts)].reduce(
      (a, b) => (b[1] > a[1] ? b : a),
    );

    if (maxCount >= THRESHOLD) {
      return maxSpecies;
    }
  }

  return null;
};

const findCardInDecklist = (cardTitle, decklist) => {
  const card = findCard(cardTitle, decklist.side);
  if (card) {
    return decklist.cards.find((dc) => dc.id == card.gempId);
  }
};

const findCard = (cardTitle, side) => {
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

  const matchingCard = allCards.find(
    (c) =>
      (!isEp1Counterpart ||
        (isEp1Counterpart &&
          c.front.icons &&
          c.front.icons.includes("Episode I"))) &&
      (!setToMatch || c.set == setToMatch) &&
      (!side || side == c.side) &&
      cleanCardTitle(cardTitle) == cleanCardTitle(c.front.title),
  );
  return matchingCard;
};

main();
