const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const DECKLISTS_URL = "https://www.starwarsccg.org/tournaments/#decklists";
const CURRENT_META_YEARS = ["2023"];

const main = async () => {
  let decklists = [];

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
    });

  console.log(`(Step 2) Fetching: ${tournamentPageUrls.length} tournaments`);
  const fetchTournamentPagePromises = tournamentPageUrls.map((url) =>
    fetch(url)
      .then((res) => res.text())
      .then((html) => {
        const tournamentPageDoc = new jsdom.JSDOM(html).window.document;
        console.log(
          `(Step 2) Fetching tournament data for ${CURRENT_META_YEARS[0]} - ${
            CURRENT_META_YEARS[CURRENT_META_YEARS.length - 1]
          }: ${url}`,
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
          console.log(
            `(Step 3) Fetching decklist ${i + 1}/${
              decklistPageUrls.length
            }: ${url}`,
          );
          const decklistPageDoc = new jsdom.JSDOM(html).window.document;
          const filename = url.split("/")[3];
          const title = decklistPageDoc.querySelector("h1").textContent.trim();
          let cards = [
            ...decklistPageDoc.querySelectorAll(
              ".fl-module-content.fl-node-content",
            ),
          ].filter(
            (e) =>
              e.textContent &&
              e.textContent.includes("EFFECT") &&
              e.textContent.includes("1x"),
          )[0];

          if (!cards) {
            console.log(`ERROR (Step 3) No cards found for decklist: ${url}`);
            return { url, filename, title: `ERROR`, cards: "", content: "" };
          }

          cards = cards.innerHTML
            .replace(/\n/g, "")
            .replace(/<br>/g, "\n")
            .replace(/<\/p>/g, "\n\n")
            .replace(/<p>/g, "")
            .trim();

          const content = `${title}\n${url}\n\n${cards}`;

          const decklist = {
            url,
            filename,
            title,
            cards,
            content,
          };

          return decklist;
        }),
    ),
  );
  decklists = await Promise.all(fetchDecklistPagePromises);

  // TODO: convert this to gemp deckfiles for awesomeness
  console.log(`(Step 4) Saving ${decklists.length} decklists`);
  writeFilePromises = decklists.map((decklist) =>
    fs.writeFileSync(
      path.resolve(__dirname, "decks", `${decklist.filename}.txt`),
      decklist.content,
    ),
  );
  await Promise.all(writeFilePromises);

  console.log(`(Step 5) Writing allDecks.txt: ${decklists.length} decklists`);
  fs.writeFileSync(
    path.resolve(__dirname, "output", "allDecks.txt"),
    decklists.map((decklist) => decklist.content).join("\n\n\n"),
  );
};

main();
