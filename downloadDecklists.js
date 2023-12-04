const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const DECKLISTS_URL = "https://www.starwarsccg.org/tournaments/#decklists";
const CURRENT_META_YEARS = null;
const REQUEST_DELAY = 500;

const comparableTitle = (title) => {
  const t = title
    // decklist data entry errors
    .replace("Sullustian", "Sullustan")
    .replace("/Vengeance of the Dark", "")
    .replace("Rebek", "Rebel")
    .replace(/^BB-8$/, "BB-8 (Beebee-Ate)")
    .replace("Bala-Tak", "Bala-Tik")
    .replace("Artoo-Deetoo", "Artoo-Detoo")
    .replace("Uhoh", "Uh-oh")
    .replace("Short Range Fighters", "Short-Range Fighters")
    .replace("Coarse, Rough", "Coarse and Rough")
    .replace(/^Morgan Elsbeth$/, "Magistrate Morgan Elsbeth")
    .replace("SetForStun", "Set for Stun")
    .replace("Control&amp;Set For Stun", "Control & Set for Stun")
    .replace("</strong></h1>", "")
    .replace(/^Blue 11$/, "Blue 11")
    .replaceAll(/\.\.\/\./g, "") // Profit
    .replaceAll(/\.\.\./g, "") // Profit
    .replaceAll(/…\//g, "") // Profit
    .replaceAll(/\(V/g, "(V)")
    .replace("Irritating (V)", "Irritating")
    .replace("Like Sand (V)", "Like Sand")
    .replace("Third Marker", "3rd Marker")

    // blanked or renamed cards
    .replace("Ralltiir Operations (V)", "Ralltiir Operations")
    .replace("Macroscan (V)", "Death Star Reactor Terminal (V)")
    .replace("Death Star Reactor Terminal (V)", "Death Star Reactor Terminal")

    // idosyncracies
    .replace("Alter (V)", "Alter (Premiere) (V)")

    // normalize
    .replaceAll(/[‘’“”'"!<>•…+]/g, "")
    .replaceAll(/\&amp\;/g, "&")
    .replaceAll(/\&nbsp\;/g, " ")
    .replace(" (AI)", "")
    .replace(/ \/ .*\(V\)/g, " (V)")
    .replace(/ \/.*/g, "")

    // set, side disambiguations must be done later, keep (Ep I) in here for now

    .toLowerCase()
    .trim();

  return t;
};

const main = async () => {
  let cardData = [];
  let decklists = [];

  // console.log("(Step 0): Loading card data.");
  const darkCardDataPromise = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "output", "cards", "Dark.json"),
      "utf8",
    ),
  );

  const lightCardDataPromise = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "output", "cards", "Light.json"),
      "utf8",
    ),
  );

  const [resolvedPromiseDark, resolvedPromiseLight] = await Promise.all([
    darkCardDataPromise,
    lightCardDataPromise,
  ]);
  cardData = [...resolvedPromiseDark.cards, ...resolvedPromiseLight.cards];

  // console.log(`(Step 1) Fetching: ${DECKLISTS_URL}`);
  let tournamentPageUrls = [];
  await fetch(DECKLISTS_URL)
    .then((res) => res.text())
    .then((html) => {
      const page = new jsdom.JSDOM(html).window.document;
      const tournamentsDiv = page.querySelector(
        ".fl-builder-content .fl-builder-template",
      ); // get the first content box
      tournamentPageUrls = [
        ...tournamentsDiv.querySelectorAll(".pp-post-link"),
      ].map((e) => e.getAttribute("href"));
      tournamentPageUrls = tournamentPageUrls.filter(
        (url) =>
          !CURRENT_META_YEARS || // make constant optional
          CURRENT_META_YEARS.includes(url.split("/")[3].split("-")[0]),
      );
      // .slice(0, 1); // for testing
    });

  console.log(`(Step 2) Fetching: ${tournamentPageUrls.length} tournaments`);
  const fetchTournamentPagePromises = tournamentPageUrls.map((url) =>
    fetch(url)
      .then((res) => res.text())
      .then((html) => {
        const tournamentPageDoc = new jsdom.JSDOM(html).window.document;
        // console.log(
        //   `(Step 2) Fetching tournament data for ${
        //     CURRENT_META_YEARS
        //       ? CURRENT_META_YEARS.join("-")
        //       : "all years"
        //   }: ${url}`,
        // );
        const urls = [
          ...tournamentPageDoc.querySelectorAll(
            ".fl-module-content.fl-node-content a",
          ),
        ]
          .map((e) => e.getAttribute("href"))
          .filter(
            (e) => e.match(/www.*org\/\d{4}.*\//), // only get decklist links
          );
        return urls;
        // return urls.slice(0, 1); // for testing
      }),
  );
  const decklistPageUrls = (
    await Promise.all(fetchTournamentPagePromises)
  ).flat();
  // .slice(0, 1); // for testing

  // console.log(
  //   `(Step 3) Fetching ${decklistPageUrls.length} decklists from ${tournamentPageUrls.length} tournaments`,
  // );
  const fetchDecklistPagePromises = decklistPageUrls.map((url, i) =>
    new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY * i)).then(() =>
      fetch(url)
        .then((res) => res.text())
        .then((html) => {
          // console.log(
          //   `(Step 3a) Fetching decklist ${i + 1}/${
          //     decklistPageUrls.length
          //   }: ${url}`,
          // );
          const decklistPageDoc = new jsdom.JSDOM(html).window.document;
          const decklistFilename = url.split("/")[3].replaceAll(/\//g, "");
          const decklistTitle = decklistPageDoc
            .querySelector("h1")
            .textContent.trim();
          let rawContent = [
            ...decklistPageDoc.querySelectorAll(
              ".fl-module-content.fl-node-content",
            ),
          ].filter(
            (e) =>
              e.textContent &&
              e.textContent.includes("EFFECT") &&
              e.textContent.includes("1x"), // if it has a starting effect, it's a deck, not prose
          )[0];

          if (!rawContent) {
            console.log(`ERROR (Step 3) No cards found for decklist: ${url}`);
            return {
              url,
              filename: decklistFilename,
              title: `ERROR: No cards found for decklist: ${url}`,
              tournament: "",
              player: "",
              side: "",
              archetype: "",
              txtcontent: "",
              jsonContent: [],
              gempContent: "",
            };
          }

          const sanitizedContent = rawContent.innerHTML
            .replace(
              /4-LOM With Concussion Rifle \(V\)1x Allegiant General Pryde/,
              "4-LOM With Concussion Rifle (V)<br>1x Allegiant General Pryde",
            )
            .replace(/\n/g, "")
            .replace(/<br>/g, "\n")
            .replace(/<\/p>/g, "\n\n")
            .replace(/<p>/g, "")
            .trim();

          const txtContent = `${decklistTitle}\n${url}\n\n${sanitizedContent}`;

          let jsonContent = []; //populate cards array with card objects

          const lines = sanitizedContent.split("\n");
          lines.forEach((line) => {
            const lineMatches = line.match(/^(\d{1,2})x(.*)/);

            if (lineMatches) {
              const qty = lineMatches[1].trim();
              const title = lineMatches[2].trim();
              const side =
                decklistTitle.includes(" DS ") ||
                decklistTitle.includes("SSAv") || // data entry error correction
                decklistTitle.includes("Hunt Down") // data entry error correction
                  ? "Dark"
                  : "Light";

              // handle Episode I vs. non-Episode I cards
              const ep1RE = / \(ep\s?\w\)/i;
              const isEp1 = title.match(ep1RE);
              title.replace(ep1RE, "");

              const card = cardData.find(
                (c) =>
                  side == c.side &&
                  comparableTitle(title) == comparableTitle(c.front.title) &&
                  (!isEp1 || isEp1 == c.front.icons.includes("Episode I")),
              );

              if (card) {
                jsonContent.push({
                  gempId: card.gempId,
                  title: card.front.title,
                  qty,
                });
              } else {
                console.log(
                  `ERROR: couldn't match card: ${title}
                    sanitized title: ${comparableTitle(title)}
                    ${side} Side ${isEp1 ? "(Ep I)" : ""}
                    deck: ${decklistTitle}
                    url: ${url}
                    `,
                );
              }
            }
          });

          // TODO: Some people have 3 names. Come up with a better way?
          // TODO: Day 2 decks should be a category/field
          const metadataMatches = decklistTitle.match(
            /(.*) (.+ .+) ([L|D]S) (.*)/,
          );
          if (metadataMatches) {
            tournament = metadataMatches[1];
            player = metadataMatches[2];
            side = metadataMatches[3];
            archetype = metadataMatches[4];
          }

          const decklist = {
            url,
            filename: decklistFilename,
            title: decklistTitle,
            tournament,
            player,
            side,
            archetype,
            txtContent,
            jsonContent,
          };

          // console.log(
          //   `(Step 3b) Saving decklist ${decklistTitle} (txt/json/gemp)`,
          // );

          saveTxtFile(decklist);
          saveGempFile(decklist);
          saveJsonFile(decklist);

          return decklist;
        }),
    ),
  );
  decklists = await Promise.all(fetchDecklistPagePromises);

  // console.log(
  //   `(Step 5) Saving definition file of ${decklists.length} decklists (txt/json)`,
  // );

  fs.writeFileSync(
    path.resolve(
      __dirname,
      "output",
      "decks",
      CURRENT_META_YEARS
        ? `allDecklists-${CURRENT_META_YEARS}.json`
        : "allDecklists.json",
    ),
    JSON.stringify(decklists, null, 2),
  );

  fs.writeFileSync(
    path.resolve(
      __dirname,
      "output",
      "decks",
      CURRENT_META_YEARS
        ? `allDecklists-${CURRENT_META_YEARS}.txt`
        : "allDecklists.txt",
    ),
    decklists.map((decklist) => decklist.txtContent).join("\n\n\n"),
  );
};

main();

const saveGempFile = (decklist) => {
  let gempContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n<deck>\n`;
  decklist.jsonContent.forEach((card) => {
    for (let i = 0; i < card.qty; i++) {
      gempContent += `<card blueprintId="${card.gempId}" title="${card.title}"/>\n`;
    }
  });
  gempContent += `</deck>`;

  const gempFilename =
    `[${decklist.tournament}] ${decklist.archetype} (${decklist.player})]`.replaceAll(
      /\//g,
      "",
    );

  fs.writeFileSync(
    path.resolve(
      __dirname,
      "output",
      "decks",
      "gemp",
      `${gempFilename}.gemp.txt`, // TODO: better name
    ),
    gempContent,
  );
};

const saveTxtFile = (decklist) => {
  fs.writeFileSync(
    path.resolve(
      __dirname,
      "output",
      "decks",
      "txt",
      `${decklist.filename}.txt`,
    ),
    decklist.txtContent,
  );
};

const saveJsonFile = (decklist) => {
  fs.writeFileSync(
    path.resolve(
      __dirname,
      "output",
      "decks",
      "json",
      `${decklist.filename}.json`,
    ),
    JSON.stringify(decklist.jsonContent, null, 2),
  );
};
