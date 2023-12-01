const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const DECKLISTS_URL = "https://www.starwarsccg.org/tournaments/#decklists";
const CURRENT_META_YEARS = ["2023"];

const sanitizeTitle = (title) =>
  title
    .replaceAll(/[<>•]/g, "")
    .replace("Sullustian", "Sullustan")
    .replace(" Of ", " of ")
    .replace(" In ", " in ")
    .replace(" And ", " and ")
    .replace(" The ", " the ")
    .replace("…", "...")
    .replaceAll(/[‘’]/g, "'")
    .replaceAll(/[“”]/g, '"')
    .replaceAll(/"/g, "'")
    .replace("&amp;", "&")
    .replace(" (AI)", "")
    .replace(/ \/ .*\(V\)/g, " (V)")
    .replace(/ \/.*/g, "")
    .trim();

const main = async () => {
  let cardData = [];
  let decklists = [];

  const fs = require("fs");
  const path = require("path");

  console.log("(Step 0): Loading card data.");
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

  console.log(`(Step 1) Fetching: ${DECKLISTS_URL}`);
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
      tournamentPageUrls = tournamentPageUrls.filter((url) =>
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
        console.log(
          `(Step 2) Fetching tournament data for ${CURRENT_META_YEARS.join(
            "-",
          )}: ${url}`,
        );
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
      }),
  );
  const decklistPageUrls = (
    await Promise.all(fetchTournamentPagePromises)
  ).flat();

  console.log(
    `(Step 3) Fetching ${decklistPageUrls.length} decklists from ${tournamentPageUrls.length} tournaments`,
  );
  const delay = 250;
  const fetchDecklistPagePromises = decklistPageUrls.map((url, i) =>
    new Promise((resolve) => setTimeout(resolve, delay * i)).then(() =>
      fetch(url)
        .then((res) => res.text())
        .then((html) => {
          // TODO: If file exists, skip it
          console.log(
            `(Step 3) Fetching decklist ${i + 1}/${
              decklistPageUrls.length
            }: ${url}`,
          );
          const decklistPageDoc = new jsdom.JSDOM(html).window.document;
          const decklistFilename = url.split("/")[3];
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

              const card = cardData.find(
                (c) => sanitizeTitle(title) == sanitizeTitle(c.front.title),
              );

              if (card) {
                jsonContent.push({
                  id: card.gempId,
                  title,
                  qty,
                });
              } else {
                console.log(
                  `couldn't match card: ${title} with sanitized title: ${sanitizeTitle(
                    title,
                  )}`,
                );
              }
            }
          });

          // TODO: Some people have 3 names. Come up with a better way?
          // TODO: Day 2 decks should be a category
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
            gempContent: "",
          };

          return decklist;
        }),
    ),
  );

  decklists = await Promise.all(fetchDecklistPagePromises);

  console.log(`(Step 4a) Saving ${decklists.length} txt decklists`);
  const writeTxtFilePromises = decklists.map((decklist) =>
    fs.writeFileSync(
      path.resolve(
        __dirname,
        "output",
        "decks",
        "txt",
        `${decklist.filename}.txt`,
      ),
      decklist.txtContent,
    ),
  );
  await Promise.all(writeTxtFilePromises);

  console.log(`(Step 4b) Saving json file for ${decklists.length} decklists`);
  fs.writeFileSync(
    path.resolve(
      __dirname,
      "output",
      "decks",
      "json",
      `allDecklists-${CURRENT_META_YEARS}.json`,
    ),
    JSON.stringify(decklists, null, 2),
  );

  console.log(`(Step 4c) Saving gemp files for ${decklists.length} decklists`);
  const writeGempFilePromises = decklists.map((decklist) =>
    fs.writeFileSync(
      path.resolve(
        __dirname,
        "output",
        "decks",
        "txt",
        `${decklist.filename}.txt`,
      ),
      decklist.txtContent,
    ),
  );
  await Promise.all(writeTxtFilePromises);

  console.log(
    `(Step 5) Saving all ${decklists.length} decklists in giant text file`,
  );
  fs.writeFileSync(
    path.resolve(__dirname, "output", `allDecklists-${CURRENT_META_YEARS}.txt`),
    decklists.map((decklist) => decklist.txtContent).join("\n\n\n"),
  );
};

main();
