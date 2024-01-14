const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const DECKLIST_JSON_DIR = "./output/decklists/json";

const main = async () => {
  console.log(`(Step 1) Loading cards and json decklists`);
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

  const outsideDeckCards = {
    Dark: darkCardData.cards.filter(
      (card) =>
        card.front.type === "Defensive Shield" ||
        [
          "Dewback", // TODO: check deck contents for this
          "Dreadnaught-Class Heavy Cruiser", // TODO: check deck contents for this
          "Luke Skywalker, The Emperor's Prize",
        ].includes(titleForGemp(card.front.title)),
    ),
    Light: lightCardData.cards.filter(
      (card) =>
        card.front.type === "Defensive Shield" ||
        ["The Falcon, Junkyard Garbage", "The Mythrol"].includes(
          titleForGemp(card.front.title),
        ),
    ),
  };

  console.log(`(Step 2) Saving gemp deck files`);
  const filenames = fs
    .readdirSync(DECKLIST_JSON_DIR)
    .filter((fn) => fn.endsWith(".json"));

  filenames.forEach(async (filename) => {
    let xml = "";

    const decklist = JSON.parse(
      fs.readFileSync(`${DECKLIST_JSON_DIR}/${filename}`, "utf8"),
    );

    xml += `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
    xml += `<!--https://starwarsccg.org/${filename.replace(".json", "/")}-->\n`;
    xml += `<deck>\n`;

    decklist.cards.forEach((decklistCard) => {
      for (let i = 0; i < decklistCard.quantity; i++) {
        xml += `\t<card blueprintId="${decklistCard.id}" title="${gempClean(
          decklistCard.title,
        )}"/>\n`;
      }
    });

    (outsideDeckCards[decklist.side] || []).forEach((card) => {
      xml += `\t<cardOutsideDeck blueprintId="${
        card.gempId
      }" title="${titleForGemp(card.front.title)}"/>\n`;
    });

    xml += "</deck>\n";

    const MAX_FILENAME_LENGTH = 40;
    const tournamentShortName = decklist.tournamentShortName || "Unknown";
    const shortRound = shortRoundName(decklist.round);
    const tournamentName =
      decklist.tournamentShortName || decklist.tournament || "Unknown";
    const lettersUsedBeforePlayerName =
      tournamentName.length +
      decklist.archetype.shortName.length +
      (shortRound || "").length +
      8;
    let playerShortName = cleanPlayerName(decklist.player.name);
    if (lettersUsedBeforePlayerName + playerShortName.length > 40) {
      const nameLimit = MAX_FILENAME_LENGTH - lettersUsedBeforePlayerName - 6;
      const firstName = playerShortName.split(" ")[0];
      const lastName = playerShortName.split(" ").slice(-1);
      const nickname = playerNickname(playerShortName);

      playerShortName =
        [
          nickname,
          `${firstName[0]} ${lastName}`,
          `${firstName[0]}${lastName}`,
          lastName,
        ].find((el) => el && el.length <= nameLimit) ||
        `${firstName[0]} ${lastName.slice(0, nameLimit - 3)}`.trim();
    }

    const gempFilename = `[${tournamentShortName.toUpperCase()}${
      shortRound ? "-" + shortRound : ""
    }] ${decklist.archetype.shortName} (${playerShortName})`;

    fs.writeFileSync(
      path.resolve(
        __dirname,
        "output/decklists/gemp",
        `${gempFilename}.gemp.txt`,
      ),
      xml,
    );
  });
};

const shortRoundName = (roundName) =>
  !roundName
    ? null
    : roundName
        .replace("Day ", "D")
        .replace("Round ", "R")
        .replace("Semifinals", "SF")
        .replace("Semi-Finals", "SF")
        .replace("Quarterfinals", "QF")
        .replace("Finals", "F")
        .replace("Top ", "T")
        .replace("Sweet ", "S");

const cleanPlayerName = (name) =>
  name
    .replace("A.J.", "AJ")
    .replace(/.* \(/, "") // for e.g. Lawrence (Rich) Craft
    .replace(/\) .*/, "");

const playerNickname = (name) =>
  name.replace("Matthew Harrison-Trainor", "MHT").replace("");

const titleForGemp = (title) =>
  title ? title.replaceAll(/[•<>]/g, "").replace(/ \/.*/g, "").trim() : null;

const gempClean = (title) => title.replaceAll(/&/g, "&amp;").trim();

main();
