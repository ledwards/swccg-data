const fs = require("fs");
const path = require("path");

const main = async () => {
  await fetch(
    "https://raw.githubusercontent.com/swccgpc/swccg-card-json/main/Dark.json",
  )
    .then((res) => res.json())
    .then((json) => {
      fs.writeFileSync(
        path.resolve(__dirname, "Dark.json"),
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
        path.resolve(__dirname, "Light.json"),
        JSON.stringify(json, null, 2),
      );
      console.log("fetched Light.json");
    });

  const darkCardData = await JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "Dark.json"), "utf8"),
  );

  const lightCardData = await JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "Light.json"), "utf8"),
  );

  const cardData = [...darkCardData.cards, ...lightCardData.cards];
  let cardFacts = [];

  cardData.forEach((card) => {
    const title = `${card.front.title}`.replace(/•/g, "").replace(/<>/g, "");
    const frontTitle = `${card.front.title}`
      .replace(/•/g, "")
      .replace(/<>/g, "");
    const backTitle = card.back
      ? `${card.back.title}`.replace(/•/g, "").replace(/<>/g, "")
      : null;

    cardFacts.push(
      `${title} is a ${card.side} Side card from the ${
        card.set
      } expansion set with rarity ${card.rarity || "n/a"}.`,
    ); // TODO: merge set ID

    cardFacts.push(
      `${title} is a(n) ${card.front.type}. ${title} is a(n) ${card.front.subType} ${card.front.type}.`,
    );

    cardFacts.push(
      `${title} has a destiny of ${
        card.front.type == "Location" ? 0 : card.front.destiny
      }.`,
    );

    cardFacts.push(`${title} has a uniqueness of ${card.front.uniqueness}.`); // TODO: explain

    cardFacts.push(
      `${frontTitle} has a card image located at: ${card.front.imageUrl}`,
    );

    if (card.back && card.back.imageUrl) {
      cardFacts.push(
        `${backTitle} has a card image located at: ${card.back.imageUrl}`,
      );
    }

    if (card.abbr) {
      cardFacts.push(
        `${title} is abbreviated as or also known by the nickname(s) and/or acronym(s): ${card.abbr.join(
          ",",
        )}.`,
      );
    }

    [
      "power",
      "ability",
      "armor",
      "maneuver",
      "deploy",
      "forfeit",
      "landspeed",
      "hyperspeed",
      "ferocity",
      "politics",
    ].forEach((stat) => {
      if (card.front[stat]) {
        cardFacts.push(`${title} has a ${stat} of ${card.front[stat]}.`);
      }
    });

    if (card.front.type == "Location") {
      cardFacts.push(
        `${title} has ${card.front.lightSideIcons} Light Side Force icons.`,
      );
      cardFacts.push(
        `${title} has ${card.front.darkSideIcons} Dark Side Force icons.`,
      );
    }

    if (card.front.subType == "System") {
      cardFacts.push(`${title} has a parsec value of ${card.front.parsec}.`);
    }

    if (card.front.characteristics) {
      card.front.characteristics.forEach((characteristic) => {
        cardFacts.push(`${title} is a(n) ${characteristic}.`);
      });
    }

    if (card.front.extraText) {
      card.front.extraText.forEach((extraText) => {
        cardFacts.push(`${title} is a(n) ${extraText}.`);
      });
    }

    if (card.front.icons) {
      card.front.icons.forEach((icon) => {
        cardFacts.push(`${title} has a(n) ${icon} icon.`);
      });
    }

    if (card.front.lore) {
      cardFacts.push(`${title} has lore: ${card.front.lore}.`);
    }

    if (card.front.gametext) {
      cardFacts.push(
        `${frontTitle} has the following gametext: ${card.front.gametext}.`,
      );
    }

    if (
      card.back &&
      card.back.gametext &&
      card.back.gametext != card.front.gametext
    ) {
      cardFacts.push(
        `${backTitle} has the following gametext: ${card.back.gametext}.`,
      );
    }

    if (card.counterpart) {
      cardFacts.push(
        `${title} has a counterpart on the opposite side of the Force ${card.counterpart}.`,
      );
    }

    if (card.pulls) {
      cardFacts.push(
        `${title} pulls (takes into hand or deploys from Reserve Deck) the card(s) ${card.pulls.join(
          ", ",
        )}.`,
      );
    }

    if (card.pulledBy) {
      cardFacts.push(
        `${title} is pulled by (is taken into hand by or deploys from Reserve Deck by) the card(s) ${card.pulledBy.join(
          ", ",
        )}.`,
      );
    }

    if (card.cancels) {
      cardFacts.push(
        `${title} cancels the card(s) ${card.cancels.join(", ")}.`,
      );
    }

    if (card.canceledBy) {
      cardFacts.push(
        `${title} is canceled by the card(s) ${card.canceledBy.join(", ")}.
        }.`,
      );
    }

    if (card.underlyingCardFor) {
      cardFacts.push(
        `${title} is the underlying card for ${card.underlyingCardFor.join(
          ", ",
        )}.`,
      );
    }

    if (card.rulings) {
      card.rulings.forEach((ruling) => {
        cardFacts.push(`${title} has a ruling: ${ruling}`);
      });
    }
  });

  fs.writeFileSync(
    path.resolve(__dirname, "cardFacts.txt"),
    cardFacts.join("\n"),
  );

  console.log(
    `Wrote ${cardFacts.length} card facts for ${cardData.length} cards to cardFacts.txt`,
  );
};

main();
