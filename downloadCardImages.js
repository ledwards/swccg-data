const fs = require("fs");
const path = require("path");
const https = require("https");
const { pipeline } = require("stream/promises");

const main = async () => {
  await fetch(
    "https://raw.githubusercontent.com/swccgpc/swccg-card-json/main/Dark.json",
  )
    .then((res) => res.json())
    .then((json) => {
      fs.writeFileSync(
        path.resolve(__dirname, "output", "cards", "Dark.json"),
        JSON.stringify(json, null, 2),
      );
      console.log("fetched Dark.json");
    });

  await fetch(
    "https://raw.githubusercontent.com/swccgpc/swccg-card-json/main/Light.json",
  )
    .then((res) => res.json())
    .then((json) => {
      fs.writeFileSync(
        path.resolve(__dirname, "output", "cards", "Light.json"),
        JSON.stringify(json, null, 2),
      );
      console.log("fetched Light.json");
    });

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

  const cardData = [...darkCardData.cards, ...lightCardData.cards];

  cardData.forEach((card, i) => {
    const urls = [card.front.imageUrl];

    setTimeout(() => {
      if (card.back && card.back.imageUrl) {
        urls.push(card.back.imageUrl);
      }

      urls.forEach((url) => {
        let filename = `${card.gempId}_${url.split("/").pop()}`;
        if (!fs.existsSync(`./output/images/${filename}`)) {
          https.get(url, async (res) => {
            const fileWriteStream = fs.createWriteStream(
              path.join(__dirname, "output", "images", filename),
              {
                autoClose: true,
                flags: "w",
              },
            );
            pipeline(res, fileWriteStream);
          });
        }
      });
    }, 500 * i);
  });

  console.log(
    `Downloading images for ${cardData.length} cards to images directory...`,
  );
};

main();
