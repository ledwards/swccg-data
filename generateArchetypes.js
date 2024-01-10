const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const { tournamentSignifiers, roundNames } = require("./lib/constants");

const ONLY_RUN_MATCHER = null;

const DECKLIST_TXT_DIR = "./output/decklists/txt";

const EXCLUDED_STARTING_INTERRUPTS = [
  "Prepared Defenses",
  "Heading For The Medical Frigate",
  "We Must Accelerate Our Plans",
  "We Wish To Board At Once",
  "Twi'lek Advisor",
  "The Signal",
  "Neimoidian Advisor",
  "Mindful Of The Future",
  "Careful Planning", // non-v
  "Combat Readiness", // non-v
];

const LESS_DEFINING_STARTING_INTERRUPTS = [
  "Surface Defense (V)",
  "Don't Tread On Me (V)",
  "Operational As Planned",
];

// cards that can ONLY EVER be SLs
const ALWAYS_STARTING_LOCATIONS = [
  "Yavin 4: Massassi Throne Room",
  "Ajan Kloss: Training Course",
  "Tatooine: Slave Quarters (V)",
];

const blankedObjectives = () => {
  let rops = allCards.find((c) => c.gempId == "7_300");
  let ropsV = structuredClone(rops);
  ropsV.front.title = "Ralltiir Operations / In The Hands Of The Empire (V)";
  ropsV.abbr = rops.abbr.map((a) => a + " V");
  ropsV.abbr = rops.abbr.map((a) => a + " (V)");
  ropsV.gempId = "7_300v"; // fake, obviously
  return [ropsV];
};

let allCards = [];
let allStartingInterrupts = [];
let allDecklists = [];
let allArchetypes = [];

const main = async () => {
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

  allStartingInterrupts = allCards.filter(
    (c) =>
      c.front.type == "Interrupt" &&
      c.front.subType.match("Starting") &&
      !EXCLUDED_STARTING_INTERRUPTS.includes(cleanCardTitle(c.front.title)),
  );

  const filenames = fs
    .readdirSync(DECKLIST_TXT_DIR)
    .filter((fn) => fn.endsWith(".txt"));

  allDecklists = filenames
    // DEBUG to test an individual decklist
    .filter((f) => !ONLY_RUN_MATCHER || f.match(ONLY_RUN_MATCHER))

    .map((filename) => {
      const txtContent = fs.readFileSync(
        `${DECKLIST_TXT_DIR}/${filename}`,
        "utf8",
      );

      let decklist = {};

      const lines = txtContent.split(/\r?\n/);
      [decklist.title, decklist.date, decklist.url] = lines.slice(0, 3);

      const cardTitles = lines
        .map((line) => cardTitleFromLine(line))
        .filter((title) => title);

      // first do with naive side picker, final side determination later
      side = cardTitles.includes("Knowledge And Defense (V)")
        ? "Dark"
        : "Light";
      decklist.cards = cardTitles.map((ct) => findCard(ct)).filter((c) => c);

      decklist.startingCards = determineStartingSectionCards(lines, decklist);
      decklist.objective = decklist.cards.find(
        (c) => c.front.type == "Objective",
      );
      decklist.startingInterrupt = determineStartingInterrupt(decklist);
      decklist.startingLocation = determineStartingLocation(decklist);

      decklist.side = determineSide(decklist);

      return decklist;
    });

  console.log(`(Step 2) Seeding all possible archetypes`);

  const seededArchetypes = seedArchetypes();
  console.log(`> ${seededArchetypes.length} seedable archetypes found.`);

  console.log(
    `(Step 3) creating other archetypes + assigning every decklist to an archetype`,
  );
  const decklistTitleArchetypes = seedDecklistArchetypesFromTitles();
  console.log(
    `> ${decklistTitleArchetypes.length} archetypes created from titles.`,
  );

  manualPostProcessing();

  fs.writeFileSync(
    path.resolve(__dirname, "public", "archetypes.json"),
    JSON.stringify(allArchetypes, null, 2),
  );

  console.log(`Analyzed archetypes from ${filenames.length} decklists.`);
  console.log(`${allArchetypes.length} unique archetypes found.`);

  console.log("---------");
  console.log("Decklists:", allDecklists.length);
  console.log(
    "URLs assigned to archetypes:",
    allArchetypes.map((a) => a.decklistUrls).flat().length,
  );
  console.log(
    "Unique URLs assigned to archetypes:",
    [...new Set(allArchetypes.map((a) => a.decklistUrls).flat())].length,
  );

  // allArchetypes
  //   .sort((a, b) => (a.decklistUrls.length < b.decklistUrls.length ? 1 : -1))
  //   .forEach((a) =>
  //     console.log(a.name, "=>", a.shortName, ":", a.decklistUrls.length),
  //   );
};

const seedArchetypes = () => {
  const archetypes = allDecklists.map((decklist) => {
    const archetypeName = determineArchetypeName(decklist);
    const shortName = mapLongNameToShortName(archetypeName);
    let aliases;

    if (decklist.objective) {
      aliases = [
        ...new Set([
          archetypeName,
          shortName,
          ...decklist.objective.abbr,
          ...decklist.objective.abbr.map(
            (a) =>
              `${a.split("/")[0]}${
                a.match("(V)") && !a.split("/")[0].endsWith("(V)") ? " (V)" : ""
              }`,
          ),
        ]),
      ];
      matchers = aliases;
    } else {
      aliases = [archetypeName, shortName];
      matchers = [archetypeName, shortName];
    }

    const archetype = {
      name: archetypeName,
      side: decklist.side,
      decklistUrls: [],
      shortName,
      aliases,
      matchers,
    };

    const returnedArchetype = createOrUpdateArchetype(archetype);

    return returnedArchetype;
  });
  return archetypes.filter((a) => a);
};

const seedDecklistArchetypesFromTitles = () => {
  // this also updates existing archetypes with new aliases AND urls
  let updatedArchetypes = [];
  let createdArchetypes = [];

  allDecklists.forEach((decklist) => {
    const rawArchetypeName = rawArchetypeNameFromDecklistTitle(decklist.title);
    const archetypeName = determineArchetypeName(decklist);
    const foundArchetype =
      findArchetypeByNameOrAlias(rawArchetypeName) ||
      findArchetypeByNameOrAlias(archetypeName);

    let archetype = {
      name: archetypeName || rawArchetypeName, // TODO: this used to be null, should we have left it?
      side: decklist.side,
      decklistUrls: [decklist.url],
      matchers: [rawArchetypeName],
    };

    if (foundArchetype) {
      archetype.name = foundArchetype.name;
      updatedArchetypes.push(archetype);
    } else {
      createdArchetypes.push(archetype);
    }
    archetype = createOrUpdateArchetype(archetype);
  });
  return [createdArchetypes, updatedArchetypes];
};

const manualPostProcessing = () => {
  const amd = allArchetypes.find(
    (a) => a.name == "Death Star II: Throne Room According To My Design",
  );
  if (amd) {
    amd.side = "Dark";
  }
};

const determineStartingSectionCards = (lines, decklist) => {
  const startingSectionHeaderIndex = lines.indexOf("STARTING");
  let startingSectionCards = [];

  if (startingSectionHeaderIndex > -1) {
    const startingSectionBeginningIndex = startingSectionHeaderIndex + 1;
    const startingSectionEndIndex = lines.indexOf(
      "",
      startingSectionHeaderIndex,
    );
    const startingSectionLines = lines.slice(
      startingSectionBeginningIndex,
      startingSectionEndIndex,
    );

    const startingSectionCardTitles = startingSectionLines.map((line) =>
      cardTitleFromLine(line),
    );

    startingSectionCards = startingSectionCardTitles
      .map((title) => findCard(title))
      .filter((c) => c);
  } else {
    startingSectionCards = [];
  }

  return startingSectionCards;
};

const determineSide = (decklist) => {
  const sidefromTitle =
    (decklist.title.includes(" DS ") ? "Dark" : null) ||
    (decklist.title.includes(" LS ") ? "Light" : null);

  const cardTitles = decklist.cards.map((c) => cleanCardTitle(c.front.title));
  const sideFromCards =
    (cardTitles.includes("Knowledge And Defense (V)") ? "Dark" : null) ||
    (cardTitles.includes("Anger, Fear, Aggression (V)") ? "Light" : null);

  return sidefromTitle || sideFromCards;
};

const determineStartingInterrupt = (decklist) => {
  const startingSectionStartingInterrupt = decklist.startingCards.find(
    (si) => si.front.type == "Interrupt",
  );

  const allStartingInterruptIds = allStartingInterrupts.map((si) => si.gempId);
  const possibleDecklistStartingInterrupts = decklist.cards.filter((c) =>
    allStartingInterruptIds.includes(c.gempId),
  );

  const decklistStartingInterrupt = possibleDecklistStartingInterrupts.find(
    (si) =>
      // if there is more than 1 SI, exclude the less likely ones
      possibleDecklistStartingInterrupts.length == 1 ||
      !LESS_DEFINING_STARTING_INTERRUPTS.includes(
        cleanCardTitle(si.front.title),
      ),
  );

  return startingSectionStartingInterrupt || decklistStartingInterrupt;
};

const determineStartingLocation = (decklist) => {
  // always used as starting location
  const alwaysStartingLocation = decklist.cards.find((c) =>
    ALWAYS_STARTING_LOCATIONS.includes(cleanCardTitle(c.front.title)),
  );

  // first listed location in STARTING section
  const startingSectionLocations = decklist.startingCards.filter(
    (si) => si.front.type == "Location",
  );

  const startingSectionFirstLocation =
    startingSectionLocations.length > 0 ? startingSectionLocations[0] : null;

  // CR (V) and CP (V): find the system with the most related locations
  let cpOrCRSystem = null;
  if (
    (decklist.startingInterrupt &&
      findCardInDecklist("Careful Planning (V)", decklist)) ||
    findCardInDecklist("Combat Readiness (V)", decklist)
  ) {
    const deckLocations = decklist.cards.filter(
      (c) => c.front.type == "Location",
    );
    const locationsToSearch =
      startingSectionLocations.length > 0
        ? startingSectionLocations
        : deckLocations;
    const systemNames = locationsToSearch.map(
      (l) =>
        cleanCardTitle(l.front.title)
          .replace(" (V)", "")
          .replace("Xizor's Palace:", "Coruscant:")
          .replace("Jabba's Palace:", "Tatooine:")
          .replace("Maz's Castle:", "Takodana:")
          .replace("Cloud City:", "Bespin:")
          .split(":")[0],
    );
    const mostCommonSystemName = mode(systemNames);

    cpOrCRSystem =
      findCardInDecklist(mostCommonSystemName, decklist) ||
      findCardInDecklist(mostCommonSystemName + " (V)", decklist) ||
      findCardInDecklist(mostCommonSystemName + "(Episode I)", decklist) ||
      findCardInDecklist(mostCommonSystemName + "(Episode I) (V)", decklist);
  }

  // guess from decklist title E.G. "JCC Mains" => Cor: JCC
  let locationFromTitle;
  if (decklist.title.toLowerCase().match("jcc")) {
    locationFromTitle = findCardInDecklist(
      "Coruscant: Jedi Council Chamber",
      decklist,
    );
  }

  if (decklist.title.toLowerCase().match(/home one.*war room/i)) {
    locationFromTitle = findCardInDecklist("Home One: War Room", decklist);
  }

  if (
    decklist.title.toLowerCase().match("cch") ||
    decklist.title.toLowerCase().match("chirpa")
  ) {
    locationFromTitle = findCardInDecklist(
      "Endor: Chief Chirpa's Hut",
      decklist,
    );
  }

  if (
    decklist.title.toLowerCase().match("dwell") ||
    decklist.title.toLowerCase().match("slave quarters")
  ) {
    locationFromTitle =
      findCardInDecklist("Tatooine: Slave Quarters (V)", decklist) ||
      findCardInDecklist("Tatooine: Slave Quarters", decklist) ||
      null;
  }

  if (decklist.title.toLowerCase().match("pyre")) {
    locationFromTitle = findCardInDecklist(
      "Endor: Anakin's Funeral Pyre",
      decklist,
    );
  }

  if (
    decklist.title.toLowerCase().match("dls") ||
    decklist.title.toLowerCase().match("desert landing site")
  ) {
    locationFromTitle = findCardInDecklist(
      "Tatooine: Desert Landing Site",
      decklist,
    );
  }

  if (decklist.title.match(/Dagobah.*Cave/i)) {
    locationFromTitle = findCardInDecklist("Dagobah: Cave", decklist);
  }

  if (decklist.title.match(/Maul.*Chambers/i)) {
    locationFromTitle = findCardInDecklist(
      "Dathomir: Maul's Chambers",
      decklist,
    );
  }

  if (decklist.title.match(/5.*Marker/i)) {
    locationFromTitle = findCardInDecklist(
      "Hoth: Ice Plains (5th Marker) (V)",
      decklist,
    );
  }

  if (decklist.title.match(/D.*S.*(II|2).*Throne Room/i)) {
    locationFromTitle = findCardInDecklist(
      "Death Star II: Throne Room",
      decklist,
    );
  }

  if (decklist.title.match(/Coruscant SSA/i)) {
    locationFromTitle = findCardInDecklist(
      "Coruscant: The Works", // this deck is errataed, but it exists
      decklist,
    );
  }

  if (decklist.title.match(/SSA.*Nines/i)) {
    locationFromTitle = findCardInDecklist(
      "Tatooine: Desert Landing Site", // this deck is errataed, but it exists
      decklist,
    );
  }

  // Common starting locations that can be inferred from the rest of the decklist
  let contextBasedStartingLocation;
  if (
    findCardInDecklist("Coruscant: Jedi Council Chamber", decklist) &&
    !findCardInDecklist("Speak With The Jedi Council", decklist) &&
    !findCardInDecklist("Take A Seat, Young Skywalker", decklist)
  ) {
    contextBasedStartingLocation = findCardInDecklist(
      "Coruscant: Jedi Council Chamber",
      decklist,
    );
  }

  if (
    findCardInDecklist("Naboo: Boss Nass' Chambers", decklist) &&
    !findCardInDecklist("Wesa Gotta Grand Army", decklist)
  ) {
    contextBasedStartingLocation = findCardInDecklist(
      "Naboo: Boss Nass' Chambers",
      decklist,
    );
  }

  let possibleSystemNameFromTitle;
  const possibleSystemNameFromTitleMatch =
    decklist.title.match(/(LS|DS) (\w+).*$/);
  if (possibleSystemNameFromTitleMatch) {
    possibleSystemNameFromTitle =
      findCardInDecklist(possibleSystemNameFromTitleMatch[2], decklist) ||
      findCardInDecklist(
        possibleSystemNameFromTitleMatch[2] + " (Episode I)",
        decklist,
      ) ||
      findCardInDecklist(
        possibleSystemNameFromTitleMatch[2] + " (V)",
        decklist,
      );
  }

  let processOfEliminationStartingLocation;
  // startingSectionLocations previously declared
  const allLocations = decklist.cards.filter((c) => c.front.type == "Location");
  let possibleProcessOfEliminationStartingLocations =
    startingSectionLocations.length > 0
      ? startingSectionLocations
      : allLocations;

  possibleProcessOfEliminationStartingLocations =
    possibleProcessOfEliminationStartingLocations.filter(
      (c) =>
        c.front.lightSideIcons > 1 ||
        c.front.darkSideIcons > 1 ||
        c.front.title.includes("Hoth: Main Power Generators"),
    );

  if (
    findCardInDecklist("Speak With The Jedi Council", decklist) ||
    findCardInDecklist("Take A Seat, Young Skywalker", decklist)
  ) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) =>
          cleanCardTitle(l.front.title) != "Coruscant: Jedi Council Chamber",
      );
  }

  if (findCardInDecklist("Wesa Gotta Grand Army", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) =>
          cleanCardTitle(l.front.title) != "Naboo: Boss Nass' Chambers" &&
          cleanCardTitle(l.front.title) != "Naboo: Battle Plains",
      );
  }

  if (findCardInDecklist("Our Only Hope (V)", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) =>
          !l.front.title.includes("Yoda's Hut") &&
          !l.front.title.includes("Death Star II"),
      );
  }

  if (findCardInDecklist("We Must Accelerate Our Plans", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) => cleanCardTitle(l.front.title) != "Blockade Flagship: Bridge",
      );
  }

  if (findCardInDecklist("Sonic Bombardment", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) =>
          cleanCardTitle(l.front.title) != "Cloud City: Security Tower (V)",
      );
  }

  if (findCardInDecklist("Vader's Obsession (V)", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) => cleanCardTitle(l.front.title) != "Courscant: The Works",
      );
  }

  if (findCardInDecklist("Jedi Business", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) =>
          cleanCardTitle(l.front.title) != "Coruscant: Night Club" &&
          cleanCardTitle(l.front.title) != "Malastare" &&
          cleanCardTitle(l.front.title) != "Tatooine: Mos Espa",
      );
  }

  if (findCardInDecklist("Now, This Is Podracing!", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) =>
          cleanCardTitle(l.front.title) != "Coruscant: Night Club" &&
          cleanCardTitle(l.front.title) != "Tatooine: Skywalker Hut",
      );
  }

  if (findCardInDecklist("Kamino", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) => !l.front.title.includes("Kamino: "),
      );
  }

  if (
    findCardInDecklist("Dagobah", decklist) ||
    findCardInDecklist("Dagobah (V)", decklist)
  ) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) => !l.front.title.includes("Dagobah: "),
      );
  }

  if (findCardInDecklist("A New Secret Base", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) =>
          !(
            l.front.subType == "System" &&
            l.front.darkSideIcons > 1 &&
            l.front.lightSideIcons > 1
          ),
      );
  }

  if (findCardInDecklist("Let The Wookiee Win (V)", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) => !l.front.title.includes("Kashyyyk"),
      );
  }

  if (findCardInDecklist("I Must Be Allowed To Speak (V)", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter(
        (l) => !l.front.title.includes("Farm"),
      );
  }

  if (findCardInDecklist("Like My Father Before Me", decklist)) {
    possibleProcessOfEliminationStartingLocations =
      possibleProcessOfEliminationStartingLocations.filter((l) =>
        l.front.title.includes("Endor"),
      );
  }

  possibleProcessOfEliminationStartingLocations =
    possibleProcessOfEliminationStartingLocations.filter(
      (c) => !c.front.title.includes("Docking Bay"),
    );

  if (possibleProcessOfEliminationStartingLocations.length == 1) {
    processOfEliminationStartingLocation =
      possibleProcessOfEliminationStartingLocations[0];
  } else {
    let twixes = possibleProcessOfEliminationStartingLocations.filter(
      (c) => c.front.darkSideIcons == 0 || c.front.lightSideIcons == 0,
    );

    if (
      twixes.length > 1 &&
      findCardInDecklist("Return Of A Jedi (V)", decklist)
    ) {
      twixes = twixes.filter((c) => !c.front.title.match("Obi-Wan's Hut"));
    }
    if (twixes.length == 1) {
      processOfEliminationStartingLocation = twixes[0];
    }
  }

  const startingLocation =
    alwaysStartingLocation ||
    cpOrCRSystem ||
    contextBasedStartingLocation ||
    locationFromTitle ||
    possibleSystemNameFromTitle ||
    processOfEliminationStartingLocation ||
    startingSectionFirstLocation;

  return startingLocation;
};

const determineRepSpecies = (decklist) => {
  const THRESHOLD = 3;
  const characters = decklist.cards.filter((c) => c.front.type == "Character");
  const species = ["Gungan", "Mandalorian", "Wookiee"]; // should do more of these...
  let speciesCounts = {};

  species.forEach((sp) => {
    const count = characters.filter(
      (c) =>
        c.front.lore.match(sp) ||
        c.front.title.match(sp) ||
        c.front.extraText?.join(" ").includes(sp),
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

// TODO: Modifiers only useful for generating decklist.json, we need to extract this
const determineArchetypeName = (decklist) => {
  const cardTitles = decklist.cards.map((c) => cleanCardTitle(c.front.title));
  let canonicalName;

  const startingInterruptName = cleanCardTitle(
    decklist.startingInterrupt?.front.title,
  );

  const startingLocationName = cleanCardTitle(
    decklist.startingLocation?.front.title,
  );

  if (decklist.objective) {
    const objectiveName = cleanCardTitle(decklist.objective.front.title);
    canonicalName = objectiveName;

    switch (objectiveName) {
      case "Carbon Chamber Testing":
        if (!cardTitles.includes("Boba Fett's Blaster Rifle (V)")) {
          canonicalName += " No-Flip";
        }
        break;

      case "Set Your Course For Alderaan":
        if (
          cardTitles.includes("Commence Primary Ignition") ||
          cardTitles.includes("Commence Primary Ignition (V)")
        ) {
          canonicalName += " Flip";
        } else {
          canonicalName += " No-Flip";
        }
        break;

      case "Agents In The Court":
        const repSpecies = determineRepSpecies(decklist);
        if (repSpecies) {
          canonicalName += " " + repSpecies + "s";
          if (
            decklist.cards.filter(
              (c) =>
                c.front.subtype == "Alien" &&
                (c.front.lore.match(repSpecies) ||
                  c.front.title.match(repSpecies)) &&
                c.front.uniqueness != "*",
            ).length == 0
          ) {
            canonicalName += " No-Flip";
          }
        }
        break;

      case "Hidden Base":
        const systems = decklist.cards.filter(
          (c) => c.front.subType == "System",
        );
        const battlegroundSystems = systems.filter(
          (c) => c.front.darkSideIcons > 0 && c.front.lightSideIcons > 0,
        );

        if (battlegroundSystems.length < 5) {
          canonicalName += " No-Flip";
        }
        break;

      case "Mind What You Have Learned":
        const jediTestCount = decklist.cards.filter((c) =>
          c.front.type.includes("Jedi Test"),
        ).length;

        if (jediTestCount < 5) {
          canonicalName += " No-Flip";
        }
        break;

      case "Yavin 4 Base Operations":
        if (cardTitles.includes("Jedi Business")) {
          canonicalName += " Jedi Business";
        }
        break;
    }
  } else if (
    decklist.startingLocation &&
    decklist.startingInterrupt &&
    (cleanCardTitle(decklist.startingInterrupt.front.title) ==
      "Don't Tread On Me (V)" ||
      cleanCardTitle(decklist.startingInterrupt.front.title) ==
        "Surface Defense (V)")
  ) {
    canonicalName =
      cleanCardTitle(decklist.startingLocation.front.title) + " 12-Card";
  } else if (
    ["Careful Planning (V)", "Combat Readiness (V)"].includes(
      startingInterruptName,
    )
  ) {
    const system = (
      decklist.startingLocation
        ? cleanCardTitle(decklist.startingLocation.front.title)
        : ""
    )
      .split(":")[0]
      .replace(" (V)", "");
    canonicalName = `${system} ${decklist.side == "Dark" ? "CR(V)" : "CP(V)"}`;
  } else if (startingInterruptName == "Let The Wookiee Win (V)") {
    let canonicalNameModifier, frontModifier;
    if (findCardInDecklist("Rendezvous Point", decklist)) {
      canonicalNameModifier = "Space";
    } else if (determineRepSpecies(decklist) == "Wookiee") {
      canonicalNameModifier = "Wookiees";
    } else if (decklist.startingLocation) {
      canonicalNameModifier = cleanCardTitle(
        decklist.startingLocation.front.title,
      );
      frontModifier = true;
    } else {
      canonicalNameModifier = "Mains";
    }
    canonicalName = frontModifier
      ? `${canonicalNameModifier} Let The Wookiee Win (V)`
      : `Let The Wookiee Win (V) ${canonicalNameModifier}`;
    canonicalName = frontModifier
      ? `${canonicalNameModifier} LTWW(V)`
      : `LTWW(V) ${canonicalNameModifier}`;
  } else if (startingInterruptName == "Slip Sliding Away (V)") {
    const startingLocationPrefix = decklist.startingLocation
      ? startingLocationName.replace("(V)", "")
      : "";
    canonicalName = `${startingLocationPrefix} Slip Sliding Away (V)`.trim();
  } else if (startingInterruptName == "According To My Design") {
    const startingLocationPrefix = decklist.startingLocation
      ? startingLocationName.replace("(V)", "")
      : "";
    canonicalName = `${startingLocationPrefix} According To My Design`.trim();
  } else if (startingLocationName) {
    canonicalName = startingLocationName;
  } else {
    canonicalName = "Unknown";
  }

  // these cards trump the entire archetype
  if ((c = findCardInDecklist("Echo Base Operations", decklist))) {
    canonicalName = "Echo Base Operations";
  }

  if ((c = findCardInDecklist("Walker Garrison", decklist))) {
    canonicalName = "Hoth Walkers";
  }

  if ((c = findCardInDecklist("That Thing's Operational", decklist))) {
    canonicalName = "That Thing's Operational";
  }

  if ((c = findCardInDecklist("Emperor's Orders", decklist))) {
    canonicalName = "Emperor's Orders";
  }

  if (
    findCardInDecklist("Steady, Steady", decklist) &&
    (!decklist.startingLocation ||
      decklist.startingLocation.front.title != "Yavin 4: Massassi Throne Room")
  ) {
    canonicalName = "Naboo Gungans";
  }

  if (
    decklist.cards.filter(
      (c) =>
        !c.front.title.uniqueness &&
        c.front.subType &&
        c.front.subType.startsWith("Starfighter: TIE"),
    ).length >= 6
  ) {
    canonicalName = "TIEs";
  }

  if ((c = findCardInDecklist("Asteroid Sanctuary", decklist))) {
    canonicalName = "Asteroid Sanctuary";
  }

  if ((c = findCardInDecklist("Master Kenobi", decklist))) {
    canonicalName = "Communing (Obi-Wan)";
  }

  if ((c = findCardInDecklist("Master Yoda", decklist))) {
    canonicalName = "Communing (Yoda)";
  }

  if (
    (c = findCardInDecklist("Master Qui-Gon Jinn, An Old Friend", decklist))
  ) {
    canonicalName = "Communing (Qui-Gon)";
  }

  if ((c = findCardInDecklist("The Force Is Strong In My Family", decklist))) {
    if (
      findCardInDecklist("Tatooine: Slave Quarters (V)", decklist) ||
      findCardInDecklist("Tatooine: Slave Quarters", decklist)
    ) {
      chosenSkywalker = "Anakin";
    }
    if (findCardInDecklist("Endor: Funeral Pyre", decklist)) {
      chosenSkywalker = "Luke";
    }
    if (findCardInDecklist("Ajan Kloss: Training Course", decklist)) {
      chosenSkywalker = "Rey";
    }

    canonicalName = `Skywalker Saga (${chosenSkywalker})`;
  }

  if ((c = findCardInDecklist("Rise Of The Sith", decklist))) {
    let chosenApprentice;
    ["Maul", "Dooku", "Tyranus", "Vader"].forEach((apprentice) => {
      if (
        decklist.cards.find(
          (card) =>
            card.front.type == "Character" &&
            card.front.title.match(apprentice),
        )
      ) {
        chosenApprentice = apprentice;
      }
    });
    if (chosenApprentice) {
      canonicalName = `Revenge Of The Sith (${chosenApprentice})`
        .replace("Tyranus", "Dooku")
        .trim();
    } else {
      canonicalName = "Revenge Of The Sith";
    }
  }

  return canonicalName || "none";
};

const findCardInDecklist = (cardTitle, decklist) => {
  const card = findCard(cardTitle, decklist.side);
  if (card) {
    return decklist.cards.find((dc) => dc.gempId == card.gempId);
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

const findArchetypeByNameOrAlias = (archetypeNameOrAlias) => {
  if (!archetypeNameOrAlias) {
    return null;
  }

  const matchingArchetypes = allArchetypes.filter((arch) => {
    return [arch.name, ...arch.aliases, ...arch.matchers]
      .filter((a) => a) // why do i have to do this
      .find(
        (alias) =>
          comparableString(alias) == comparableString(archetypeNameOrAlias),
      );
  });

  if (matchingArchetypes.length > 0) {
    return matchingArchetypes[0];
  } else {
    return null;
  }
};

// WARNING: This mutates the array
const createArchetype = (archetype) => {
  let archetypeToCreate = {
    name: archetype.name,
    side: archetype.side,
    decklistUrls: archetype.decklistUrls || [],
    shortName: archetype.shortName,
    aliases: archetype.aliases || [],
    matchers: archetype.matchers || [],
  };
  allArchetypes.push(archetypeToCreate);
  return archetypeToCreate;
};

// WARNING: This mutates the array
const updateArchetype = (archetypeNameOrAlias, archetype) => {
  if (!archetypeNameOrAlias) {
    return null;
  }

  let foundArchetype = findArchetypeByNameOrAlias(
    archetypeNameOrAlias,
    archetype.side,
  );

  if (foundArchetype) {
    foundArchetype.side = archetype.side;
    foundArchetype.shortName = archetype.shortName || foundArchetype.shortName;

    if (archetype.decklistUrls && archetype.decklistUrls.length > 0) {
      foundArchetype.decklistUrls = [
        ...new Set([...foundArchetype.decklistUrls, ...archetype.decklistUrls]),
      ].filter((a) => a);
    }

    if (archetype.aliases) {
      foundArchetype.aliases = [
        ...new Set([...foundArchetype.aliases, ...archetype.aliases]),
      ].filter((a) => a);
    }

    if (archetype.matchers) {
      foundArchetype.matchers = [
        ...new Set([...foundArchetype.matchers, ...archetype.matchers]),
      ].filter((m) => m);
    }

    return null;
  }

  return foundArchetype;
};

const cardTitleFromLine = (line) => {
  const segments = line.split(/\d{1,2}x\s/);
  return segments.length > 1 ? cleanCardTitle(segments[1]) : line;
};

const rawArchetypeNameFromDecklistTitle = (title) => {
  const tournamentDelimiter = `(${tournamentSignifiers
    .concat(roundNames)
    .join("|")})`;
  const tournamentRE = new RegExp(
    `\\d{0,4}\\s?.+${tournamentDelimiter}\\s?.+\\s(DS|LS)\\s(.+)`,
    "i",
  );
  const matchableTitle = title;
  const matches = matchableTitle.match(tournamentRE);

  if (matches) {
    let [_, _delimiter, side, archetypeName] = matches.map((m) => m.trim());

    if (archetypeName == "Senate" || archetypeName == "Combat") {
      archetypeName = `${side} ${archetypeName}`;
    }

    return archetypeName;
  }
};

const createOrUpdateArchetype = (archetype) => {
  if (!archetype) {
    return null;
  }

  let foundArchetype = findArchetypeByNameOrAlias(archetype.name);

  if (foundArchetype) {
    foundArchetype = updateArchetype(foundArchetype.name, archetype);
  } else {
    foundArchetype = createArchetype(archetype);
  }

  return foundArchetype;
};

const cleanCardTitle = (title) =>
  title
    ? title
        .replaceAll(/[<>•]/g, "")
        .replaceAll(/ \/ .*\(V\)/g, " (V)")
        .replaceAll(/ \/.*()/g, "")
    : null;

const comparableString = (str) => str.toLowerCase().replaceAll(/[^a-z]/g, "");

const mode = (arr) => {
  const counts = {};
  let maxCount = 0;
  let maxKey;
  for (let i = 0; i < arr.length; i++) {
    const key = arr[i];
    const count = (counts[key] = (counts[key] || 0) + 1);
    if (count > maxCount) {
      maxCount = count;
      maxKey = key;
    }
  }
  return maxKey;
};

const mapLongNameToShortName = (archetype) => {
  const map = {
    "A Great Tactician Creates Plans": "Thrawn",
    "A Stunning Move": "ASM",
    "Agents In The Court": "AITC",
    "Agents In The Court Mandalorians": "AITC Mandalorians",
    "Agents In The Court Mandalorians No-Flip": "AITC Mandalorians",
    "Agents Of Black Sun": "AOBS",
    "Bring Him Before Me": "BHBM",
    "Carbon Chamber Testing": "CCT",
    "Carbon Chamber Testing Flip": "CCT",
    "Carbon Chamber Testing No-Flip": "CCT No-Flip",
    "City In The Clouds": "City In The Clouds",
    "Court Of The Vile Gangster": "Court",
    "Dantooine Base Operations": "DBO",
    "Diplomatic Mission To Alderaan": "Diplo",
    "Don't Tread On Me (V)": "12-Card",
    "Endor (V)": "Endor",
    "Endor Operations": "Endor Ops",
    "He Is The Chosen One": "HITCO",
    "Hidden Base": "HB",
    "Hidden Base Flip": "HB",
    "Hidden Base No-Flip": "HB No-Flip",
    "Hunt Down And Destroy The Jedi (V)": "Hunt Down (V)",
    "Hunt Down And Destroy The Jedi": "Hunt Down",
    "Hunt For The Droid General": "Clones",
    "I Want That Map": "Map",
    "ISB Operations": "ISB",
    "Imperial Entanglements": "IE",
    "Imperial Occupation": "DS Operatives",
    Invasion: "Invasion",
    "Let Them Make The First Move": "DS Combat",
    "Local Uprising": "LS Operatives",
    "Massassi Base Operations": "MBO",
    "Mind What You Have Learned": "MWYHL",
    "Mind What You Have Learned Flip": "MWYHL Flip",
    "Mind What You Have Learned No-Flip": "MWYHL No-Flip",
    "My Kind Of Scum": "MKOS",
    "My Lord, Is That Legal?": "DS Senate",
    "No Money, No Parts, No Deal!": "Watto",
    "Old Allies": "OA",
    "On The Verge Of Greatness": "Verge",
    "Plead My Case To The Senate": "LS Senate",
    "Quiet Mining Colony": "QMC",
    "Ralltiir Operations (V)": "ROps(V)",
    "Ralltiir Operations": "ROps",
    "Rebel Strike Team": "RST",
    "Rescue The Princess: (V)": "RTP (V)",
    "Rescue The Princess": "RTP",
    "Set Your Course For Alderaan": "SYCFA",
    "Set Your Course For Alderaan Flip": "SYCFA Flip",
    "Set Your Course For Alderaan No-Flip": "SYCFA No-Flip",
    "Shadow Collective": "SC",
    "The Empire Knows We're Here": "Hoth Speeders",
    "The Galaxy May Need A Legend": "Legend",
    "The Hyperdrive Generator's Gone (V)": "Hyperdrive (V)",
    "The Hyperdrive Generator's Gone": "Hyperdrive",
    "The Shield Will Be Down In Moments": "Walkers Objective",
    "There Is Good In Him": "TIGIH",
    "They Have No Idea We're Coming": "No Idea",
    "This Deal Is Getting Worse All The Time": "TDIGWATT",
    "Twin Suns Of Tatooine": "Twin Suns",
    "Watch Your Step": "WYS",
    "We Have A Plan": "WHAP",
    "We'll Handle This": "LS Combat",
    "Yavin 4 Base Operations": "Y4O",
    "Yavin 4 Base Operations Jedi Business": "Y4O Jedi Business",
    "Yavin 4: Massassi Throne Room": "TRM",
    "You Can Either Profit By This...": "Profit",
    "Zero Hour": "Zero Hour",
    "Echo Base Operations": "EBO",
    "That Thing's Operational": "TTO",
    "Hoth Walker": "Walkers",
    "Naboo Gungans": "Gungans",
    "Communing (Obi-Wan)": "Obimuning",
    "Communing (Qui-Gon)": "Quimuning",
    "Communing (Yoda)": "Yodamuning",
    "Skywalker Saga (Anakin)": "Anakin Saga",
    "Skywalker Saga (Luke)": "Luke Saga",
    "Skywalker Saga (Rey)": "Rey Saga",
    "Revenge Of The Sith (Vader)": "ROTS Vader",
    "Revenge Of The Sith (Dooku)": "ROTS Dooku",
    "Revenge Of The Sith (Maul)": "ROTS Maul",
    "Rise Of The Sith": "ROTS",
  };

  archetype = archetype
    .replace("Combat Readiness (V)", "CR(V)")
    .replace("Careful Planning (V)", "CP(V)")
    .replace("Coruscant: Jedi Council Chamber", "JCC")
    .replace("Dathomir: Maul's Chambers", "Maul's Chambers")
    .replace("Dagobah: Cave", "Dagobah Cave")
    .replace("Slip Sliding Away (V)", "SSA(V)")
    .replace("Surface Defense (V)", "12-Card")
    .replace("Death Star II: Throne Room", "DSII Throne Room")
    .replace("According To My Design", "ATMD")
    .replace("Endor: Chief Chirpa's Hut", "Chirpa's Hut")
    .replace("Endor: Anakin's Funeral Pyre", "Pyre")
    .replace("Hoth: Ice Plains (5th Marker)", "Ice Plains")
    .replace("Let The Wookiee Win (V)", "LTWW(V)")
    .replace("Naboo: Boss Nass' Chambers", "Boss Nass Chambers")
    .replace("Podrace Prep", "Podracing")
    .replace("Tatooine: Desert Landing Site", "DLS")
    .replace("Tatooine: Hutt Trade Route (Desert)", "Hutt Trade Route")
    .replace("Tatooine: Slave Quarters", "Slave Quarters")
    .replace("Hoth: Defensive Perimeter (3rd Marker)", "3rd Marker")
    .replace("Ajan Kloss: Training Course", "Ajan Kloss")
    .replace("Coruscant: The Works", "Coruscant")
    .replace("Invisible Hand: Bridge", "Invisible Hand")
    .replace("Hoth: Main Power Generators (1st Marker)", "Hoth MPG")
    .replace("Hoth MPG (V)", "Hoth MPG")
    .replace("Home One: War Room", "Home One War Room")
    .replace("Tatooine: Slave Quarters", "Slave Quarters")
    .replace("Slave Quarters (V)", "Slave Quarters")
    .replace("Tatooine: Skywalker Hut", "Skywalker Hut")
    .replace("According To My Design", "ATMD")
    .replace("Yavin 4: Massassi Throne Room", "TRM");

  return map[archetype] || archetype;
};

main();
