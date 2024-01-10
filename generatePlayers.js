const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const { tournamentSignifiers, roundNames } = require("./lib/constants");
const { titleCase } = require("./lib/utils");

const DECKLIST_TXT_DIR = "./output/decklists/txt";
const SAVED_PLAYERS_PATH = "./public/players.json";
let archetypeLookupTable = {};

let allArchetypes = [];

const main = async () => {
  let players = [];
  let noMatchTheFirstTime = [];

  console.log(`(Step 1) Loading archetypes`);

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

  console.log(`(Step 2) Matching players to decklists from titles`);

  const filenames = fs
    .readdirSync(DECKLIST_TXT_DIR)
    .filter((fn) => fn.endsWith(".txt"));

  filenames.forEach((filename) => {
    const txtContent = fs.readFileSync(
      `${DECKLIST_TXT_DIR}/${filename}`,
      "utf8",
    );
    const lines = txtContent.split(/\r?\n/);
    let [decklistTitle, _decklistDate, decklistUrl] = lines.slice(0, 3);
    const decklistArchetype = archetypeLookupTable[decklistUrl];
    const decklistSide = decklistArchetype.side;

    decklistTitle = fixSpecificDecklistTitles(decklistTitle, decklistSide);

    // Step 1: Use Regex to parse out tournament name, date, side, and deck archetype
    const playerRE = playerRegex(decklistArchetype);
    const matchableTitle = matchableDecklistTitle(decklistTitle);
    const matches = matchableTitle.match(playerRE);

    if (matches) {
      const rawName = getPlayerNameFromMatches(matches);
      const cleanName = cleanPlayerName(rawName);
      const playerName = normalizePlayerName(cleanName);

      const existingPlayer = players.find((p) => p.name == playerName);

      if (!existingPlayer) {
        players.push({
          name: playerName,
          decklistUrls: [decklistUrl],
          aliases: [playerName, cleanName],
          matchers: [playerName, cleanName, rawName],
        });
      } else {
        existingPlayer.decklistUrls.push(decklistUrl);
        existingPlayer.aliases = [
          ...new Set(existingPlayer.aliases.concat([cleanName])),
        ];
        existingPlayer.matchers = [
          ...new Set(existingPlayer.matchers.concat([cleanName, rawName])),
        ];
      }

      if (!playerName) {
        console.log(
          `ERROR: Matched, but could not parse player from title for ${matchableTitle}`,
        );
        console.log(decklistUrl);
        console.log(playerRE);
        console.log(matches);
      }
    } else {
      // console.log(`ERROR: No Matches for ${matchableTitle}`);
      // console.log(decklistUrl);
      // console.log(playerRE);
      // console.log(matches);

      // come back to these on a second pass
      noMatchTheFirstTime.push({
        matchableTitle,
        decklistUrl,
      });
    }
  });

  console.log(
    `(Step 3) Doing a second pass for any decklists that didn't match the first time`,
  );
  noMatchTheFirstTime.forEach(({ matchableTitle, decklistUrl }) => {
    const matchedPlayer = players.find(
      (player) =>
        matchableTitle.includes(player.name) ||
        player.matchers.some((alias) => matchableTitle.includes(alias)),
    );
    if (matchedPlayer) {
      matchedPlayer.decklistUrls.push(decklistUrl);
    } else {
      console.log(`ERROR: No Matches for ${matchableTitle} (second pass)`);
      console.log(decklistUrl);
    }
  });

  console.log(`${players.length} unique players found.`);

  // TODO do something with this: each record has decklists maybe
  const sortedPlayers = players.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(
    path.resolve(__dirname, SAVED_PLAYERS_PATH),
    JSON.stringify(sortedPlayers, null, 2),
  );
};

const normalizePlayerName = (playerName) => {
  // for names that are valid, but aliases/nicknames

  playerName = playerName
    .replace("Andy Davies", "Andrew Davies")
    .replace("Bobby Birrer", "Bob Birrer")
    .replace("Clay Atkin", "Clayton Atkin")
    .replace("Fernando Castanon", "Fernando Castañón")
    .replace("Jeffrey Lavigne", "Jeff Lavigne")
    .replace("Jeff Johns", "Jeffrey Johns")
    .replace(/^Jonas Hagen$/, "Jonas Hagen Nørregaard")
    .replace("Jonas Hagen Noerregaard", "Jonas Hagen Nørregaard")
    .replace("Jonas Hagen Norregaard", "Jonas Hagen Nørregaard")
    .replace("Julian-Andres Smolarek", "Julian Smolarek")
    .replace("Matthew Carulli", "Matt Carulli")
    .replace("Matthew Lutz", "Matt Lutz")
    .replace("Matthew Sokol", "Matt Sokol")
    .replace(/Miguel Tarin$/, "Miguel Tarrin Vegas")
    .replace("Mike Pistone", "Michael Pistone")
    .replace("Mike Turner", "Michael Turner")
    .replace("Nick Abbondanzo", "Nicholas Abbondanzo")
    .replace("Patrick Johnson", "Pat Johnson")
    .replace("Quirin Furgut", "Quirin Fürgut")
    .replace("Quirin Fürgut", "Quirin Fürgut") // yes, really
    .replace("Stephan DeVos", "Stephan de Vos")
    .replace("Stephen Baroni", "Steve Baroni")
    .replace("Stephen Cellucci", "Steve Cellucci")
    .replace("Steve Squirlock", "Stephen Squirlock")
    .replace("Steve Yaeger", "Steven Yaeger")
    .replace("Stew Yoo", "Stewart Yoo")
    .replace("Tamas Papp", "Tamás Papp")
    .replace("Tamás Papp", "Tamás Papp") // yes, really
    .replace("Tommy Santosuosso", "Thomas Santosuosso")
    .replace("Tommy Santosuosso Jr", "Thomas Santosuosso")
    .replace("Vincent Rossi", "Vinny Rossi")
    .replace("William Scinocca", "Will Scinocca");

  return playerName;
};

const cleanPlayerName = (playerName) => {
  // for names that need to be fixed for typos, case, etc.

  if (playerName.toUpperCase() == playerName) {
    playerName = titleCase(playerName); // only do this if the player name is all-caps
  }

  playerName = playerName
    .replace(/\s*–\s*/, "")
    .replace("’", "'")
    .replace(/\s*(DS|LS)\s*$/, "")
    .replace(/\s+/, " ")
    .trim();

  playerName = playerName
    .replace("Cedric Vanderhaegen", "Cedrik Vanderhaegen")
    .replace("Cedrik Vanderhawgen", "Cedrik Vanderhaegen")
    .replace("Chris Goglen", "Chris Gogolen")
    .replace("Chris Terwiliger", "Chris Terwilliger")
    .replace("Connor Britain", "Conor Britain")
    .replace("Corey Lauer", "Cory Lauer")
    .replace("Issac Story", "Isaac Story")
    .replace("Jason Reindeau", "Jason Riendeau")
    .replace("Jeremie Jensen", "Jeramie Jensen")
    .replace("Jon Mcfarland", "Jon McFarland")
    .replace("Jonathon Murray", "Jonathan Murray")
    .replace("Kendal Halman", "Kendall Halman")
    .replace("Martin Den Boef", "Martin den Boef")
    .replace("Matthew Harrison-trainor", "Matthew Harrison-Trainor")
    .replace("Nicholas Abbonzando", "Nicholas Abbondanzo")
    .replace("Quirin FÜRGUT", "Quirin Fürgut")
    .replace("Stephan De Vos", "Stephan de Vos")
    .replace("Tommy Santosusso", "Thomas Santosuosso")
    .replace("Thomas Santosusso.", "Thomas Santosuosso")
    .replace("Zack Stenerson", "Zach Stenerson");

  return playerName;
};

const matchableDecklistTitle = (title) => {
  const roundMatcher = new RegExp(`(${roundNames.join("|")})`, "i");

  // TODO: is this redundant? Try to merge these functions
  let fixedTitle = title
    .replace(roundMatcher, "")
    .replace("  ", " ")
    .replace("EUROPEAN CHAMPIONSHIPS", "European Championship")
    .replace("TMW", "Texas Mini-Worlds")
    .replace("EGP", "Endor Grand Prix")
    .replace(" EC ", " European Championship ")
    .replace(" NAC ", "North American Continentals ")
    // .replace(" MPC ", " Match Play Championship ") // not sure if we want to do this
    .replace("Regional ", "Regionals ")
    .replace("Playoff ", "Playoffs ")
    .replace("Championships", "Championship")
    .replace("Ryloth", "Ryloth Regionals");

  fixedTitle = fixedTitle
    .replace(" EUR ", " ")
    .replace(" USA ", " ")
    .replace("(TOP 8)", "Top 8")
    .replace(/\s+–\s+/, " ")
    .replace(/\s+/, " ");

  return fixedTitle;
};

const fixSpecificDecklistTitles = (title, side) => {
  // TODO: This should go into the text file step?
  switch (title) {
    case "2020 Day 1 Wayne Cullen DS ASM":
      return "2020 MPC Day 1 Wayne Cullen DS ASM";
  }

  const sideAbbr = side === "Dark" ? "DS" : "LS";
  const allArchetypeNamesAndMatchers = allArchetypes
    .map((a) => [...a.matchers, a.name, a.shortName])
    .flat();

  const archetypeClause = `${allArchetypeNamesAndMatchers
    .join("|")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("...", `\\.\\.\\.`)
    .replaceAll("?", "\\?")}`;
  const archetypeRE = archetypeClause ? new RegExp(`(${archetypeClause})`) : "";

  if (!title.includes("DS") && !title.includes("LS")) {
    const matches = title.match(archetypeRE);
    if (matches) {
      const archetypeName = matches[1];
      title = title.replace(archetypeName, `${sideAbbr} ${archetypeName}`);
    }
  }

  // this is only necessary because some decks fail to match the regex since DS/LS is used as a delimiter
  if (title.includes("DS Combat")) {
    title = title.replace("DS Combat", "DS Dark Combat");
  }

  if (title.includes("LS Combat")) {
    title = title.replace("LS Combat", "LS Light Combat");
  }

  if (title.includes("DS Senate")) {
    title = title.replace("DS Senate", "DS Dark Senate");
  }

  if (title.includes("LS Senate")) {
    title = title.replace("LS Senate", "LS Light Senate");
  }

  return title;
};

const playerRegex = (archetype) => {
  const tournamentClause = `${tournamentSignifiers.join(" | ")}`;

  const archetypeClause = archetype
    ? `${archetype.matchers
        .join("|")
        .replaceAll("(", "\\(")
        .replaceAll(")", "\\)")
        .replaceAll("...", `\\.\\.\\.`)
        .replaceAll("?", "\\?")}`
    : ".+";

  const roundClause = `${roundNames.join("|")}`;

  const tournamentRE = new RegExp(
    `(\\d{0,4})\\s?(.+(${tournamentClause}))\\s?(${roundClause})?\\s?(.+)(${roundClause})?\\s(DS|LS)\\s?(${archetypeClause})`,
    "i",
  );
  return tournamentRE;
};

const getPlayerNameFromMatches = (matches) => {
  const [
    _,
    _year,
    _tournamentName,
    _signifier,
    _round,
    playerName,
    _roundAgain,
    _side,
    _archetypeName,
  ] = matches.map((m) => m?.trim());

  return playerName;
};

main();
