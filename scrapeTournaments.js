const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const DECKLISTS_URL = "https://www.starwarsccg.org/tournaments/#decklists";
const CURRENT_META_YEARS = null;
const REQUEST_DELAY = 250;

const TOURNAMENT_SIGNIFIERS = [
  "Playoff",
  "Series",
  "Prix",
  "Championship",
  "Worlds",
  "Regionals",
  "States",
  "Cup",
  "Open",
  "Invitational",
  "Nationals",
  "Continentals",
  "MPC",
  "Event",
  "League",
  "PC20",
];

const EVENT_TAGS = ["Day 2", "Day 3", "Top 8", "Semi-Finals", "Finals"];

const main = async () => {
  let tournaments = [];
  let players = [];
  let archetypes = [];

  console.log(`(Step 1) Fetching: ${DECKLISTS_URL}`);
  const tournamentPageUrls = await fetch(DECKLISTS_URL)
    .then((res) => res.text())
    .then((html) => {
      const page = new jsdom.JSDOM(html).window.document;
      const tournamentsDiv = page.querySelector(
        ".fl-builder-content .fl-builder-template",
      ); // get the first content box
      const urls = [...tournamentsDiv.querySelectorAll(".pp-post-link")]
        .map((e) => e.getAttribute("href"))
        .filter((url) => !url.includes("retro")) // no retro events for now
        .filter((url) => !url.includes("jawa")) // no jawa events for now
        .filter(
          (url) =>
            !CURRENT_META_YEARS || // make constant optional
            CURRENT_META_YEARS.includes(url.split("/")[3].split("-")[0]),
        );
      return urls;
    });

  console.log(`(Step 2) Fetching: ${tournamentPageUrls.length} tournaments`);
  const fetchTournamentPagePromises = tournamentPageUrls.map((url, i) =>
    new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY * i)).then(() =>
      fetch(url)
        .then((res) => res.text())
        .then((html) => {
          const tournamentPageDoc = new jsdom.JSDOM(html).window.document;

          if (tournamentPageDoc.querySelector("#error-page")) {
            throw new Error(`Error fetching ${url}`);
          }

          const dateNode =
            tournamentPageDoc.querySelector(".fl-post-info-date");
          const date = dateNode ? dateNode.textContent : "";
          const year = date.split(", ")[1];

          const urls = [
            ...tournamentPageDoc.querySelectorAll(
              ".fl-module-content.fl-node-content a",
            ),
          ]
            .map((e) => e.getAttribute("href"))
            .filter(
              (e) => e.match(/www.*org\/(\d{4}|pc\-?20|champions-league).*\//), // only get decklist links
            );

          return {
            url: url,
            slug: url.split("/")[3].replaceAll(/\//g, ""),
            date: date,
            year: year,
            decklistUrls: urls,
          };
        })
        .catch((err) => {
          console.log(err);
        }),
    ),
  );

  tournaments = (await Promise.all(fetchTournamentPagePromises)).flat();

  tournaments.forEach((tournament) => {
    if (tournament.decklistUrls.length === 0) {
      console.log(`No decklists found for ${tournament.url}`);
    }
  });

  console.log(
    `(Step 3) Fetching: first deck of each tournament to get tournament metadata`,
  );
  const tournamentsFirstDecklistPromises = tournaments.map((tournament, i) =>
    new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY * i)).then(() =>
      fetch(tournament.decklistUrls[0])
        .then((res) => res.text())
        .then((html) => {
          const decklistPageDoc = new jsdom.JSDOM(html).window.document;
          let decklistFullTitle = decklistPageDoc
            .querySelector("h1")
            .textContent.trim();
          let tags = [];

          if (decklistFullTitle) {
            // normalize data
            decklistFullTitle = decklistFullTitle
              .replace("Day 1", "")
              .replace("US ", "U.S. ")
              .replace("Championships ", "Championship ")
              .replace("Playoffs ", "Playoff ")
              .replace("Regional ", "Regionals ")
              .replace("MPC ", "Match Play Championship ")
              .replace("TMW ", "Texas Mini Worlds ")
              .replace("EGP ", "Endor Grand Prix ")
              .replace("EC ", "European Championship ")
              .replace(
                "EUROPEAN CHAMPIONSHIP TOP 8",
                "European Championship Top 8",
              )
              .replace("NAC ", "North American Continentals ")
              .replace("Euros ", "European Championship ")
              .replace(/\d+(st|nd|rd|th) Place /i, "")
              .replace(" (-|–) ", " ");

            // fix data entry errors : might have this covered already
            decklistFullTitle = decklistFullTitle.replace(
              "2017 Endor",
              "2017 Endor Grand Prix",
            );

            // apply tags
            EVENT_TAGS.forEach((tag) => {
              if (decklistFullTitle.includes(tag)) {
                decklistFullTitle = decklistFullTitle.replace(`${tag} `, "");
                tags.push(tag);
              }
            });

            ["DS", "LS"].forEach((side) => {
              if (decklistFullTitle.includes(` ${side} `)) {
                decklistFullTitle = decklistFullTitle.replace(` ${side} `, " ");
                // would set side here but not used at tournament level
              }
            });

            const tournamentSignifiers = `(${TOURNAMENT_SIGNIFIERS.join("|")})`;
            const tournamentRE = new RegExp(
              // to make this tell between player and archetype either need to put DS/LS back in, or assume player is always 2 wordsm or pull from list of players or archetypes
              `(\\d{0,4})\\s?(.*${tournamentSignifiers}).*`,
              "i",
            );

            const matches = decklistFullTitle.match(tournamentRE);
            if (matches) {
              const [_, year, event, _player, _side, _archetype] = matches;

              return {
                url: tournament.url,
                name: [year || "", event].join(" ").trim(),
                event: event,
                year,
                tags,
              };
            } else {
              console.log(
                `ERROR: Could not parse metadata for ${decklistFullTitle} from ${tournament.url}`,
              );
              return {
                url: tournament.url,
                name: null,
                event: null,
                year: null,
                tags: [],
              };
            }
          } else {
            console.log(`ERROR: Could not parse page for ${tournament.url}`);
            return {
              url: tournament.url,
              name: null,
              event: null,
              year: null,
              tags: [],
            };
          }
        }),
    ),
  );

  await Promise.all(tournamentsFirstDecklistPromises)
    .then((tournamentsMetadata) => {
      tournaments = tournaments.map((t) => {
        return {
          ...t,
          ...(tournamentsMetadata.find((tm) => tm.url === t.url) || {}),
        };
      });
    })
    .catch((err) => {
      console.log(`ERROR: ${err}`);
    });

  fs.writeFileSync(
    path.resolve(__dirname, "output", "public", "tournaments.json"),
    JSON.stringify(tournaments, null, 2),
  );
};

main();
