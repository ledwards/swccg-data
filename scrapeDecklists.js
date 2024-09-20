const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const REQUEST_DELAY = 1000;
const YEAR = 2019;

const slugFromUrl = (url) => url.split("/")[3].replaceAll(/\//g, "");

const main = async () => {
  console.log("(Step 1) Loading tournament and cards data.");
  const allTournaments = await JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "public", "tournaments.json"),
      "utf8",
    ),
  );

  const tournaments = allTournaments.filter((t) => parseInt(t.year) >= YEAR);
  console.log(
    `(Step 2) Fetching the decklists from ${tournaments.length} tournaments`,
  );

  let delay = 0;
  const fetchDecklistPagePromises = tournaments.map((tournament) =>
    tournament.decklistUrls.map((decklistUrl) => {
      const decklistSlug = slugFromUrl(decklistUrl);
      const htmlFilename = `./output/decklists/html/${decklistSlug}.html`;

      if (fs.existsSync(htmlFilename)) {
        const plaintext = fs.readFileSync(htmlFilename, "utf8").toString();
        return new Promise((resolve) => {
          resolve({
            url: decklistUrl,
            filename: decklistSlug,
            plaintext: plaintext,
          });
        });
      } else {
        delay += REQUEST_DELAY;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve(
                fetch(decklistUrl, { signal: AbortSignal.timeout(REQUEST_DELAY) })
                  .then((res) => res.text())
                  .then((html) => {
                    let decklist;
                    const decklistPageDoc = new jsdom.JSDOM(html).window
                      .document;
                    const h1Text = decklistPageDoc
                      .querySelector("h1")
                      .textContent.trim();

                    if (h1Text.includes("Error")) {
                      console.log("ERROR: Rate limit exceeded.");
                      return resolve({
                        url: decklistUrl,
                        filename: decklistSlug,
                        error: "Rate limit exceeded.",
                      });
                    }

                    let rawContent = [
                      ...decklistPageDoc.querySelectorAll(
                        ".fl-module-content.fl-node-content",
                      ),
                    ].filter(
                      // it's a deck, not some other content
                      (e) =>
                        (e.textContent &&
                          e.textContent.toLowerCase().includes("effect")) ||
                        e.textContent.toLowerCase().includes("1x") ||
                        e.textContent.toLowerCase().includes("2x") ||
                        e.textContent.toLowerCase().includes("x2") ||
                        e.textContent.toLowerCase().includes("(v)"),
                    )[0];

                    if (!rawContent) {
                      console.log(
                        `ERROR (Step 2) Decklist not found at url: ${decklistUrl}`,
                      );
                      return resolve({
                        url: decklistUrl,
                        filename: decklistSlug,
                        error: "Decklist not found.",
                      });
                    }

                    decklist = {
                      url: decklistUrl,
                      slug: decklistSlug,
                      html,
                    };

                    return decklist;
                  })
                  .then((decklist) => {
                    if (!decklist.error) {
                      fs.writeFileSync(
                        path.resolve(
                          __dirname,
                          "output",
                          "decklists",
                          "html",
                          `${decklistSlug}.html`,
                        ),
                        decklist.html,
                      );
                    }
                    return decklist;
                  })
                  .catch((e) => {
                    console.log(
                      `ERROR (Step 2) Fetching decklist: ${decklistUrl}`,
                    );
                    console.log(e);
                    return {
                      url: decklistUrl,
                      slug: decklistSlug,
                      plaintext: `Could not find decklist: ${decklistUrl}`,
                    };
                  }),
              ),
            delay,
          ),
        );
      }
    }),
  );

  const decklists = (
    await Promise.all(fetchDecklistPagePromises.flat())
  ).flat();

  console.log(`(Finished) Scraped ${decklists.length} decklists to html.`);
};

main();
