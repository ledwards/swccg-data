const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");
require('dotenv').config();

const ANTIBOT_QUERY = process.env.ANTIBOT_QUERY;
const DECKLISTS_URL = `https://www.starwarsccg.org/tournaments${ANTIBOT_QUERY}/#decklists`;
const REQUEST_DELAY = 5_000;

const { tournamentSignifiers } = require("./lib/constants");
const { titleCase } = require("./lib/utils");

const main = async () => {
  let tournaments = [];

  console.log(`(Step 1) Fetching: ${DECKLISTS_URL}`);
  const tournamentPageUrls = await fetch(DECKLISTS_URL, { signal: AbortSignal.timeout(REQUEST_DELAY) })
    .then((res) => {
      if (res.status === 403) {
        console.log(`ERROR: 403 Forbidden for URL: ${DECKLISTS_URL}`);
        return Promise.reject(new Error("403 Forbidden"));
      }
      return res.text();
    })
    .then((html) => {
      const page = new jsdom.JSDOM(html).window.document;
      const tournamentsDiv = page.querySelector(
        ".fl-builder-content .fl-builder-template",
      ); // get the first content box
      const urls = [...tournamentsDiv.querySelectorAll(".pp-post-link")]
        .map((e) => e.getAttribute("href"))
        .filter((url) => !url.includes("retro")) // no retro events for now
        .filter((url) => !url.includes("jawa")); // no jawa events for now
      return urls;
    });

  console.log(`(Step 2) Fetching: ${tournamentPageUrls.length} tournaments`);
  const fetchTournamentPagePromises = tournamentPageUrls.map((url, i) =>
    new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY * i)).then(() =>
      fetch(url + ANTIBOT_QUERY)
        .then((res) => {
          if (res.status === 403) {
            console.log(`ERROR: 403 Forbidden for URL: ${url + ANTIBOT_QUERY}`);
            return Promise.reject(new Error("403 Forbidden"));
          }
          return res.text();
        })
        .then((html) => {
          const tournamentPageDoc = new jsdom.JSDOM(html).window.document;

          if (tournamentPageDoc.querySelector("#error-page")) {
            throw new Error(`Error fetching ${url}`);
          }

          // TODO: Remove? We can do this later
          const dateNode =
            tournamentPageDoc.querySelector(".fl-post-info-date");
          const date = dateNode ? dateNode.textContent : "";
          const year = date.split(", ")[1];

          const urls = [
            ...tournamentPageDoc.querySelectorAll(
              ".fl-module-content.fl-node-content a",
            ),
          ]
            .filter(
              (node) =>
                !node.textContent.includes("←") &&
                !node.textContent.includes("→"),
            )
            .map((e) => e.getAttribute("href").replace(/^.*:\/\//, "https://"))
            .filter(
              (e) =>
                e.match(/www.*org\/(\d{4}|pc\-?20|champions-league|euro).*\//), // only get decklist links
            )
            .filter((url) => url.split("-").length > 5) // all decks have way more dashes than this
            .filter((url) => !url.includes("retro")) // this has to be done here again
            .filter((url) => !url.includes("jawa"));
          return {
            url: url,
            slug: url.split("/")[3].replaceAll(/\//g, ""),
            date: date,
            year: year,
            decklistUrls: urls.map((u) => u.trim()),
          };
        })
        .catch((err) => {
          if (err.message === "403 Forbidden") {
            console.log(`ERROR: 403 Forbidden response for tournament page: ${url}`);
          } else {
            console.log(err);
          }
        }),
    ),
  );

  tournaments = (await Promise.all(fetchTournamentPagePromises)).flat();

  tournaments.forEach((tournament) => {
    if (tournament.decklistUrls.length === 0) {
      console.log(`No decklists found for ${tournament.url}`);
    }
  });

  // break out regionals by regions
  const regionalSeasons = tournaments.filter((t) => t.url.includes("regional"));

  regionalSeasons.forEach((regionalSeason) => {
    let regionalsByRegion = {};
    regionalSeason.decklistUrls.forEach((decklistUrl) => {
      const regionMatches = decklistUrl.match(/[\d\-]+-([a-z].+)-regional/);
      if (regionMatches) {
        const region = titleCase(regionMatches[1].replace("-", " "));
        if (!regionalsByRegion[region]) {
          regionalsByRegion[region] = [decklistUrl];
        } else {
          regionalsByRegion[region].push(decklistUrl);
        }
      }
    });

    // erase old all-regional entries
    tournaments = tournaments.filter((t) => t.url !== regionalSeason.url);

    for (let [region, urls] of Object.entries(regionalsByRegion)) {
      tournaments.push({
        url: regionalSeason.url,
        slug: regionalSeason.slug,
        // date: null,
        year: regionalSeason.year,
        decklistUrls: urls,
        // event: `${region} Regionals`,
        // name: `${regionalSeason.year} ${region} Regionals`,
        // shortName: `${regionalSeason.year} ${region}`,
      });
    }
  });

  console.log(
    `(Step 3) Fetching: first deck of each tournament to get tournament metadata`,
  );

  const tournamentsFirstDecklistPromises = tournaments.map((tournament, i) =>
    new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY * i)).then(() =>
      fetch(tournament.decklistUrls[0] + ANTIBOT_QUERY)
        .then((res) => {
          if (res.status === 403) {
            console.log(`ERROR: 403 Forbidden for URL: ${tournament.decklistUrls[0] + ANTIBOT_QUERY}`);
            return Promise.reject(new Error("403 Forbidden"));
          }
          return res.text();
        })
        .then((html) => {
          const decklistPageDoc = new jsdom.JSDOM(html).window.document;
          let decklistFullTitle = decklistPageDoc
            .querySelector("h1")
            .textContent.trim();

          let date, year;
          const dateNode = decklistPageDoc.querySelector(".fl-post-info-date");
          if (dateNode) {
            date = dateNode ? dateNode.textContent : "";
            year = date.split(", ")[1];
          }

          if (decklistFullTitle) {
            // normalize data
            decklistFullTitle = decklistFullTitle
              .replace("Day 1", "")
              .replace("US ", "U.S. ")
              .replace("Championships", "Championship")
              .replace("Playoff ", "Playoffs")
              .replace(/Playoff$/gi, "Playoffs")
              .replace("Regional ", "Regionals")
              .replace(/Regional$/gi, "Regionals")
              .replace(" MPC", "Match Play Championship ")
              .replace("TMW ", "Texas Mini Worlds ")
              .replace("EGP ", "Endor Grand Prix ")
              .replace("EC ", "European Championship ")
              .replace("PC20", "PC 20th Anniversary Tournament")
              .replace(
                "EUROPEAN CHAMPIONSHIP TOP 8",
                "European Championship Top 8",
              )
              .replace("NAC ", "North American Continentals ")
              .replace("Euros ", "European Championship ")
              .replace("SSS ", "Supreme Southern Showdown ")

              .replace("2024-01", "2024")

              .replace(/\d+(st|nd|rd|th) Place /i, "")
              .replace(" (-|–) ", " ");

            // fix data entry errors : might have this covered already
            decklistFullTitle = decklistFullTitle.replace(
              "2017 Endor",
              "2017 Endor Grand Prix",
            );

            decklistFullTitle = decklistFullTitle.replace("6th Annual ", "");

            const tournamentSignifiersExpression = `(${tournamentSignifiers.join(
              "|",
            )})`;
            const tournamentRE = new RegExp(
              // to make this tell between player and archetype either need to put DS/LS back in, or assume player is always 2 wordsm or pull from list of players or archetypes
              `(\\d{0,4})\\s?(.*${tournamentSignifiersExpression}).*`,
              "i",
            );

            const matches = decklistFullTitle.match(tournamentRE);

            if (matches) {
              let [_, year, event, _player, _side, _archetype] = matches;

              event = titleCase(event.trim())
                // recapitlize
                .replace("Ocs", "OCS")
                .replace("Mpc", "MPC")
                .replace("Gempc", "GEMPC")
                .replace("Pc", "PC")
                .replace("U.s.", "U.S.")
                .replace("Mini-worlds", "Mini-Worlds");

              const name = [year || "", event].join(" ").trim();
              tournament.date = date;
              tournament.year = year;
              tournament.name = name;
              tournament.shortName = shortName(name);
              tournament.event = event.trim();
            } else {
              console.log(
                `ERROR: Could not parse metadata for ${decklistFullTitle} from ${tournament.url}`,
              );
              return {
                url: tournament.url,
                name: null,
                shortName: null,
                event: null,
                year: null,
                date: null,
              };
            }
          } else {
            console.log(`ERROR: Could not parse page for ${tournament.url}`);
            return {
              url: tournament.url,
              name: null,
              shortName: null,
              event: null,
              year: null,
              date: null,
            };
          }
        })
        .catch((err) => {
          if (err.message === "403 Forbidden") {
            console.log(`ERROR: 403 Forbidden response for tournament metadata: ${tournament.decklistUrls[0]}`);
          } else {
            console.log(`ERROR: ${err} with ${tournament.url}`);
          }
        }),
    ),
  );

  await Promise.all(tournamentsFirstDecklistPromises).catch((err) => {
    console.log(`ERROR: ${err}`);
  });

  fs.writeFileSync(
    path.resolve(__dirname, "public", "tournaments.json"),
    JSON.stringify(tournaments, null, 2),
  );
};

const shortName = (name) => {
  return name
    .replace("OCS Playoffs", "OCS")
    .replace("Endor Grand Prix", "EGP")
    .replace("Morristown Melee", "MM")
    .replace("European Championship", "Euros")
    .replace("U.S. Nationals", "USNats")
    .replace(" Regionals", "")
    .replace("San Diego Super Open", "SDSO")
    .replace("North American Continentals", "NAC")
    .replace("World Championship", "Worlds")
    .replace("PC 20th Anniversary Tournament", "PC20")
    .replace(/\dth Annual /, "")
    .replace("Outrider Cup", "Outrider")
    .replace("Texas Mini Worlds", "TMW")
    .replace("Texas Mini-Worlds", "TMW")
    .replace("Match Play Championship", "MPC")
    .replace("Euromatch Play Championship", "EuroMPC")
    .replace("Champions League", "CL")
    .replace("Supreme Southern Showdown", "SSS");
};

main();
