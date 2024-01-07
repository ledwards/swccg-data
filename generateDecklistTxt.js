const jsdom = require("jsdom");
const fs = require("fs");
const path = require("path");

const DECKLIST_HTML_DIR = "./output/decklists/html";
const DECKLIST_URL_BASE = "https://www.starwarsccg.org";

// Run this script with the max-old-space-size flag
// e.g. `node --max-old-space-size=16384 generateDecklistTxt.js`
// to avoid OOM errors

let allCards;
let cardTypes;
let objectiveTitles;

const main = async () => {
  console.log(`(Step 1) Loading cards and html decklists`);
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
  allCards = [...darkCardData.cards, ...lightCardData.cards];
  cardTypes = [
    ...new Set(
      allCards.map((c) => c.front.type.replace(/Jedi Test.*/, "Jedi Test")),
    ),
  ];
  objectiveTitles = [
    ...new Set(
      allCards
        .filter((c) => c.front.type === "Objective")
        .map((c) => c.front.title),
    ),
  ].concat(["Ralltiir Operations / In The Hands Of The Empire (V)"]);

  const filenames = fs
    .readdirSync(DECKLIST_HTML_DIR)
    .filter((fn) => fn.endsWith(".html"));

  console.log(`(Step 2) Converting html decklists to txt`);
  const decklists = filenames
    // DEBUG uncomment to test individual specific decklists
    // .filter((fn) => fn.match(/2023-ralltiir-regionals-chris-menzel-ls-hitco/))
    .map((filename) => {
      const decklistSlug = filename.replace(".html", "");
      const decklistUrl = `${DECKLIST_URL_BASE}/${decklistSlug}/`;
      const html = fs.readFileSync(
        path.resolve(__dirname, DECKLIST_HTML_DIR, filename),
        "utf8",
      );

      let decklist;
      const decklistPageDoc = new jsdom.JSDOM(html).window.document;
      const h1Text = decklistPageDoc.querySelector("h1").textContent.trim();

      const rawContentDivs = [
        ...decklistPageDoc.querySelectorAll(
          ".fl-module-content.fl-node-content",
        ),
      ].filter(
        // it's a deck, not some other content
        (e) =>
          (e.textContent &&
            e.textContent.toLowerCase().includes("knowledge")) ||
          e.textContent
            .replaceAll(",", "")
            .toLowerCase()
            .includes("anger fear") ||
          e.textContent.toLowerCase().includes("2x"),
      );

      const rawContent = rawContentDivs[0];

      if (!rawContent) {
        console.log(`ERROR (Step 2) Decklist not found in file: ${filename}`);
        return {
          url: decklistUrl,
          slug: decklistSlug,
          errors: ["FILE: Could not find decklist"],
        };
      }

      const dateNode = decklistPageDoc.querySelector(".fl-post-info-date");
      const date = dateNode ? dateNode.textContent.trim() : null;

      // console.log("A", rawContent.innerHTML);
      const plaintext = plaintextFromRawContent(
        h1Text,
        date,
        decklistUrl,
        rawContent.innerHTML,
      );
      // console.log("Z", plaintext);
      // console.log(url);

      decklist = {
        url: decklistUrl,
        slug: decklistSlug,
        plaintext,
      };

      // Individual fixes
      switch (decklistSlug) {
        case "2022-us-nationals-day-1-kyle-krueger-ls-old-allies":
          decklist.plaintext +=
            "\nOBJECTIVES\n1x Old Allies / We Need Your Help\n\n";
          break;
      }

      saveTxtFile(decklist);

      return decklist;
    });

  console.log(`(Step 3) Creating txt for ${decklists.length} decklists.`);

  fs.writeFileSync(
    path.resolve(__dirname, "public", "decklists.txt"),
    decklists
      .filter((d) => d && d.plaintext)
      .map((decklist) => decklist.plaintext)
      .join("\n\n\n"),
  );

  console.log(`(Finished) Created ${decklists.length} txt decklists.`);
};

const saveTxtFile = (decklist) => {
  fs.writeFileSync(
    path.resolve(
      __dirname,
      "output",
      "decklists",
      "txt",
      `${decklist.slug}.txt`,
    ),
    decklist.plaintext,
  );
};

const plaintextFromRawContent = (title, date, url, doc) => {
  let body = doc;

  // console.log("0", body);

  body = normalizeHeaders(doc)
    // specific structural fixes which must come before html escaping and line counting
    .replace("<p>VEH</p>", "")
    .replace(
      "2x Sorry About The Mess &amp; Blaster\nProficiency<br>",
      "2x Sorry About The Mess &amp; Blaster Proficiency",
    )
    .replace("2xControl&amp;SetForStun<br>\n", "")
    .replace("1xUhoh!<br>\n", "")
    .replace(
      "4-LOM With Concussion Rifle (V)1x Allegiant General Pryde",
      "4-LOM With Concussion Rifle (V)\n1x Allegiant General Pryde",
    )
    .replace("Where's Han? LOCATIONS", "Where's Han?\n\nLOCATIONS")
    .replace(
      "Officer Evax Captain Khurgee (V)",
      "Officer Evax\nCaptain Khurgee (V)",
    )
    .replaceAll("Darth (V)ader", "Darth Vader")
    .replace("Jakku Spaceport Street", "Jakku\nSpaceport Street")
    .replace("WEAPONSMace", "WEAPONS<br>Mace")
    .replace("2x. ", "2x ");

  // console.log("1", body);

  body = body
    // specific Objective fixes must happen before line-level fixes
    .replaceAll("Yavin 4 Operations", "Yavin 4 Base Operations")
    .replaceAll("Agents of Black Sun Prince", "Agents Of Black Sun")
    .replaceAll("Galaxy Needs", "Galaxy May Need")
    .replaceAll(/We're Gonna Need A New One/gi, "We'll Need A New One")
    .replaceAll(
      /No Money, No Parts, No Deal(\s|$|\/)/gi,
      "No Money, No Parts, No Deal!$1",
    );

  // individual fixes
  if (url.match("2021-endor-regionals-steve-harpster-ds-ropsv")) {
    body = body.replace(
      "Ralltiir Operations / In The Hands Of The Empire",
      "Ralltiir Operations / In The Hands Of The Empire (V)",
    );
  }

  if (url.match("ls-hunt-down")) {
    body = body.replace("LS Hunt Down", "DS Hunt Down");
  }

  if (url.match("2019-nac-day-1-tom-marlin-ls-no-idea")) {
    body = body.replace("Stunning Leader", "Blast The Door, Kid!");
  }

  if (url.match("2023-ralltiir-regionals-chris-menzel-ds-bhbm")) {
    body = body.replace(
      /<p>STARSHIP\/VEHICLE\/WEAPON<br>\s1x Falleen's Fist<br>\s2x Maul's Sith Infiltrator<br>\s1x Blizzard 4<br>\s1x Darth Vader's Lightsaber \(V\)<\/p>/,
      "<p>STARSHIPS<br>\r\n1x Falleen's Fist<br>\r\n2x Maul's Sith Infiltrator<br></p>\r\n<p>VEHICLES<br>\r\n1x Blizzard 4</p>\r\n<p>WEAPONS<br>\r\n1x Darth Vader's Lightsaber (V)</p>",
    );
  }

  if (url.match("2023-ralltiir-regionals-chris-menzel-ls-hitco")) {
    body = body.replace(
      /<p>DEVICE\/WEAPON<br>\s2x Luke's Bionic Hand<br>\s1x Mercenary Armor<br>\s1x Restraining Bolt<br>\s2x Luke's Lightsaber<\/p>/,
      "<p>DEVICES<br>\r\n2x Luke's Bionic Hand<br>\r\n1x Mercenary Armor<br>\r\n1x Restraining Bolt</p>\r\n<p>WEAPONS<br>\r\n2x Luke's Lightsaber</p>",
    );
  }

  if (url.match("2019-nac-day-1-kyle-kallin-ls-wys")) {
    body = body.replace(/<p>CHARACTERS.*/, "<p>CHARACTERS<br>\r\n");
  }

  // console.log("2", body);

  body = removeHtmlTagsAndEscapes(body)
    // fix each line one at a time
    .split("\n")
    .map((line) => normalizeLine(line))
    .join("\n")
    .replaceAll(/\n\n/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n");

  // one deck is repeated twice on the same page
  if (url.match("2023-naboo-regionals-jeroen-wauters-ds-i-want-that-map")) {
    const lines = body.split("\n");
    body = lines.slice(0, lines.length / 2).join("\n");
  }

  // console.log("3", body);

  body = disambiguateCardsWithSameTitles(body);

  // console.log("4", body);

  if (body.length == 0) {
    console.log(`Decklist ${url} has no cards.`);
  }

  return `${title}\n${date}\n${url}\n\n${body}\n`;
};

const removeEuroStyleText = (line) =>
  line
    // .replace(/.*jabba's prize.*/i, "") // I think this card counts toward 60 in CCT?
    .replace(/^(\+|x).*effects?.*/i, "")
    .replace(/^(\+|x).*locations?.*/i, "")
    .replace(/^(\+|x).*sites?/i, "")
    .replace(/.* battlegrounds?$/i, "")
    .replace(/.* battleground site$/i, "")
    .replace(/.* persona$/i, "")
    .replaceAll(/\s?\(?\+\d effects?\)?/gi, "")
    .replace(/\(.* total\)/, "")
    .replace("(non virtual is recommended)", "")
    .replace(/\(.*locations?\)/i, "")
    .replace(/Anger, Fear, Aggression \(V\).*/, "Anger, Fear, Aggression (V)") // dumb stuff after SE name
    .replace(/Knowledge And Defense \(V\).*/, "Knowledge And Defense (V)")
    .replace(/Jabba's Prize \(V\)/, "")
    .replace(/^\d?x?\s?\(.*\)$/, "")
    .replace(/^\d?x?\s?\[.*\]$/, "")
    .replaceAll("()", "");

const normalizeCardTitle = (cardTitle) =>
  fixSpecificLineLevelTyposAndDataEntryErrors(
    cardTitle
      .replaceAll(/•/g, "")
      .replaceAll(/<>/g, "")
      .replaceAll(/[‘’`´]/g, "'")
      .replaceAll(/[“”]/g, `"`)
      .replaceAll(/…/g, "...")
      .replaceAll(/(\w)\//g, "$1 /") // let Objective /'s breathe
      .replaceAll(/\/(\w)/g, "/ $1")
      .replace(" (AI)", "")
      .replace(/\//, " / ")
      .replaceAll(/[ ]{2,}/g, " ")
      .trim(),
  );

const normalizeHeaders = (doc) =>
  doc
    .trim()
    .replaceAll(/[‘’`´]/g, "'")
    .replace("STARSHPIS", "STARSHIPS")
    .replace("STARSHPS", "STARSHIPS")
    .replace("STARHIPS", "STARSHIPS")
    .replace("STARHSIP", "STARSHIPS")
    .replace("STARTSHIPS", "STARSHIPS")
    .replace("VECHIVLE", "VEHICLE")
    .replace("VECHICLE", "VEHICLE")
    .replace("EVEHICLES", "VEHICLES")
    .replace("ADMIRALS", "ADMIRAL'S")
    .replace("INTERUPTS", "INTERRUPTS")
    .replace("INTERTUPTS", "INTERRUPTS")
    .replace("EFECTS", "EFFECTS")
    .replace("EFFETS", "EFFECTS")
    .replace("EFFEECTS", "EFFECTS")
    .replace("EFFFECTS", "EFFECTS")
    .replace("EFFECTTS", "EFFECTS")
    .replace("DEVICESL", "DEVICES");

const removeHtmlTagsAndEscapes = (doc) =>
  doc
    .replaceAll(/\\n/g, "")
    .replaceAll(/(<br\/?>)+/g, "\n")
    .replaceAll(/<\/p>/g, "\n\n")
    .replaceAll(/<.*?>/g, "")
    .replaceAll(/\&amp;/g, "&")
    .replaceAll(/\&nbsp;/g, " ")
    .replaceAll(/\&lt;/g, "<")
    .replaceAll(/\&gt;/g, ">")
    .replaceAll(/(\&quot;|\&\#8220;|\&\#8221;|“|”)/g, '"')
    .replaceAll(/(\&apos;|‘|’|`|´)/g, "'");

const normalizeLine = (line) => {
  let qty = 1;

  // console.log("NL1:", line);

  line = removeEuroStyleText(line).trim();

  // console.log("NL2:", line);

  // superfluous lines
  if (
    line == "" ||
    line.includes(" LS ") ||
    line.includes(" DS ") ||
    line == "Dark:" ||
    line == "Light:" ||
    line == "Deck:" ||
    line.match(/\w+ \d{1,2}, \d{4}/) ||
    line.match(/^\d+$/)
  ) {
    return "";
  }

  // console.log("NL3:", line);

  // normalize card type headers
  const headers = cardTypes.map((ct) => ct.toUpperCase()).concat(["STARTING"]);
  const header = headers.find((header) => {
    const headerRegex = new RegExp(
      `^${header}s?:{0,2}(\\s\\(\\d{1,2}\\))?$`,
      "i",
    );
    return line.match(headerRegex);
  });
  if (header) {
    return `\n${header == "STARTING" ? "STARTING" : header + "S"}`;
  }

  // normalize 2X vs x2
  let cardTitle = line
    .replace(/^\d{1,2}x?\s/i, "")
    .replace(/ x\d{1,2}$/i, "")
    .replace(/^x\d{1,2}\s/i, "");

  // console.log("CT1:", cardTitle, 1);

  const qtyMatch =
    line.match(/^(\d{1,2})x\s/i) ||
    line.match(/\sx(\d{1,2})$/i) ||
    line.match(/^x(\d{1,2})\s/i);

  if (qtyMatch) {
    const qtyStr = qtyMatch[0];
    qty = parseInt(qtyMatch[1]);
    cardTitle = line.replace(qtyStr, "").trim();
  }

  // console.log("CT2:", cardTitle, qty);

  // some fixes that need to happen before Objectives are normalized
  cardTitle = cardTitle
    .replaceAll(/ \/ .*\(V\)/g, " (V)")
    .replaceAll(/\(V$/g, "(V)")
    .replaceAll(/ v$/gi, " (V)")
    .replaceAll(/\(+V\)+$/gi, "(V)")
    .replaceAll(/(\w+)\(V\)/g, "$1 (V)");

  // console.log("CT3:", cardTitle, qty);

  cardTitle = fixSpecificGlobalTyposAndDataEntryErrors(cardTitle);

  // console.log("CT4:", cardTitle, qty);

  // complete Objective titles after qty is split out
  const lineIsVirtual = line.includes("(V)");
  const foundObjectiveTitle = objectiveTitles.find((ot) => {
    // this whole shenanigans covers "Front (V)" vs "Front / Back (V)"
    const otIsVirtual = ot.includes("(V)");
    return (
      otIsVirtual == lineIsVirtual && // Virtual status matches
      cardTitle.replace("(V)", "").split(" ").length > 1 && // Objectives are at least 2 words
      normalizeCardTitle(ot)
        .replaceAll(" (V)", "")
        .toLowerCase()
        .startsWith(
          normalizeCardTitle(cardTitle + " / ")
            .replaceAll(" (V)", "")
            .toLowerCase(),
        )
    );
  });

  if (foundObjectiveTitle) {
    const normalizedObjectiveTitle = `1x ${foundObjectiveTitle.replaceAll(
      " (V)",
      "",
    )}${lineIsVirtual ? " (V)" : ""}`;
    // console.log(
    //   "Found Objective:",
    //   foundObjectiveTitle,
    //   normalizedObjectiveTitle,
    // );
    return normalizedObjectiveTitle;
  }

  // console.log("NL4:", line);

  if (line.trim() == "") {
    return "";
  }

  line = `${qty}x ${normalizeCardTitle(cardTitle)}`;

  // console.log("NL5 FINAL:", line);

  return line;
};

const fixSpecificLineLevelTyposAndDataEntryErrors = (line) =>
  line
    // put back excalamation points!
    .replace("Turn It Off! Turn It Off (V)", "Turn It Off! Turn It Off! (V)")
    .replace("I Can't Shake Him (V)", "I Can't Shake Him! (V)")
    .replace("Alert My Star Destroyer (V)", "Alert My Star Destroyer! (V)")
    .replace("Down With The Emperor (V)", "Down With The Emperor! (V)")
    .replace("Evil Is Everywhere!", "Evil Is Everywhere")
    .replace(/Run Luke, Run$/, "Run Luke, Run!")
    .replaceAll(/Watch Your Back$/g, "Watch Your Back!")
    .replace(/Double Our Efforts$/, "Double Our Efforts!")
    .replace(/Coming Through$/, "Coming Through!")
    .replace(/Cease Fire$/, "Cease Fire!")
    .replace(/It's A Trap$/, "It's A Trap!")
    .replace(/It's A Hit$/, "It's A Hit!")
    .replace(/You'll Be Dead$/, "You'll Be Dead!")

    // apostrophe problems
    .replace("Lukes Bionic Hand", "Luke's Bionic Hand")
    .replace("Beldons Eye", "Beldon's Eye")
    .replace("Boss Nass Chambers", "Boss Nass' Chambers")
    .replace("Mauls", "Maul's")
    .replace("Tarpals Electropole", "Tarpals' Electropole")
    .replace("Lars Moisture Farm", "Lars' Moisture Farm");

const fixSpecificGlobalTyposAndDataEntryErrors = (line) =>
  line
    .replaceAll("w/", "with")
    .replace("Sullustian", "Sullustan")
    .replace("Rebek", "Rebel")
    .replace(/BB-8$/, "BB-8 (Beebee-Ate)")
    .replace("Bala-Tak", "Bala-Tik")
    .replace("Artoo-Deetoo", "Artoo-Detoo")
    .replace("Uhoh", "Uh-oh")
    .replace("Short-Range Fighters &", "Short Range Fighters &")
    .replace("Short Range Fighter &", "Short Range Fighters &")
    .replace(/Short Range Fighters$/, "Short-range Fighters") // this is so dumb, Decipher
    .replace("Coarse, Rough", "Coarse and Rough")
    .replace(/^Morgan Elsbeth/, "Magistrate Morgan Elsbeth")
    .replace("SetForStun", "Set for Stun")
    .replace(/^Blue 1$/, "Blue 11")
    .replace("3P0", "3PO")
    .replace("K-2S0", "K-2SO")
    .replace("Tueesso", "Tuesso")
    .replace(/U-3PO$/, "U-3PO (Yoo-Threepio)")
    .replace("Third Marker", "3rd Marker")
    .replace("Presence Of Te Force", "Presence Of The Force")
    .replace("Persuit", "Pursuit")
    .replace("Tractor Beams", "Tractor Beam")
    .replace("Flare S", "Flare-S")
    .replace("Padmé", "Padme")
    .replace("Agression", "Aggression")
    .replace("Anger Fear Aggression", "Anger, Fear, Aggression")
    .replace("Knowledge & Defense", "Knowledge And Defense")
    .replace("See You Around Kid", "See You Around, Kid")
    .replace(/5D6-RA-7$/, "5D6-RA-7 (Fivedesix)")
    .replace(/5D6-RA-7 \(V\)$/, "5D6-RA-7 (Fivedesix) (V)")
    .replace("Jedi Council Chambers", "Jedi Council Chamber")
    .replace(" with ", " With ")
    .replace(/2-1B$/, "2-1B (Too-Onebee)")
    .replace("I Can Take Care Of Myself", "I Think I Can Handle Myself")
    .replace(
      "I'm Getting Kind Of Good At This",
      "I'm Getting Pretty Good At This",
    )
    .replace("Darth Vader Emperors Enforcer", "Darth Vader, Emperor's Enforcer")
    .replace(
      "Darth Vader Emperor's Enforcer",
      "Darth Vader, Emperor's Enforcer",
    )
    .replace("Storm Trooper", "Stormtrooper")
    .replace("Asssault", "Assault")
    .replace("Ghhk and Those", "Ghhhk & Those")
    .replace("Search & Destroy", "Search And Destroy")
    .replace("Han Chewie, And The Falcon", "Han, Chewie, And The Falcon")
    .replace("Ability Ability Ability", "Ability, Ability, Ability")
    .replace(
      /Qui-Gon's Lightsaber \(ref.*\s?(3|iii)\)/i,
      "Qui-Gon's Lightsaber",
    )
    .replace(
      /Qui-Gon Jinn's Lightsaber \(ep(i|1)\)/i,
      "Qui-Gon Jinn's Lightsaber",
    )
    .replace("'s Saber", "'s Lightsaber")
    .replace("ith Saber", "ith Lightsaber")
    .replace("Obi Wan", "Obi-Wan")
    .replace("Slave 1", "Slave I")
    .replace("Councli", "Council")
    .replace("Chimera", "Chimaera")
    .replace("Chimeara", "Chimaera")
    .replace("Desparate", "Desperate")
    .replace("Baqy", "Bay")
    .replaceAll("Ahch To", "Ahch-To")
    .replace("‚Snap'", "'Snap'")
    .replace("Kinta Strider", "Kintan Strider")
    .replace("Palapatine", "Palpatine")
    .replaceAll("(DB)", "(Docking Bay)")
    .replace(
      /Scarif: (Landing Pad|Docking Bay|Landing Pad Nine)$/,
      "Scarif: Landing Pad Nine (Docking Bay)",
    ) // just so happens it's LS in both real-world cases
    .replace(/Landing Platform$/, "Landing Platform (Docking Bay)")
    .replace(/Platform 327$/, "Platform 327 (Docking Bay)")
    .replace("Eza", "Ezra")
    .replace("Perimiter", "Perimeter")
    .replace("Kurt Drive", "Kuat Drive")
    .replace("X-Wing Laser Cannons", "X-wing Laser Cannon")
    .replace("Run, Luke, Run", "Run Luke, Run")
    .replace("G1", "Gold 1")
    .replace("Yavin :", "Yavin 4:")
    .replace("Yavin IV", "Yavin 4")
    .replace("Yavin 4 Docking Bay", "Yavin 4: Docking Bay")
    .replace("Chandrilla", "Chandrila")
    .replace(/heading to the medical/i, "Heading For The Medical")
    .replace("With Parts Showing", "With His Parts Showing")
    .replace(/^Jedha City/, "Jedha: Jedha City")
    .replace("Peavy", "Peavey")
    .replace("Spacebort", "Spaceport")
    .replace("Owen & Beru Lars", "Owen Lars & Beru Lars")
    .replace("Manuever", "Maneuver")
    .replace(
      "All wings & Darklighter Spin",
      "All Wings Report In & Darklighter Spin",
    )
    .replace(/FN-2199$/, "FN-2199 (Nines)")
    .replace("Blockade Flagship Bridge", "Blockade Flagship: Bridge")
    .replace("Naboo: Hallway", "Naboo: Theed Palace Hallway")
    .replace(/We're in Attack Position$/i, "We're In Attack Position Now")
    .replace("Bith Shuttle", "Bith Shuffle")
    .replace(/^Bith Shuffle/, "The Bith Shuffle")
    .replace("Shuffle ć Desperate", "Shuffle & Desperate")
    .replace("Shuffle and Desperate", "Shuffle & Desperate")
    .replace("EPP Mara", "Mara Jade With Lightsaber")
    .replace(/^Prince$/, "Prince Xizor")
    .replace("I Can Feel The Conflict", "I Feel The Conflict")
    .replace(
      "Darth Vader, Lord of The Sith",
      "Darth Vader, Dark Lord of The Sith",
    )
    .replace("Spaceport Office", "Spaceport Prefect's Office")
    .replace("IG-8 8", "IG-88")
    .replace("Yoda ,", "Yoda,")
    .replace("Master OF", "Master Of")
    .replace("Kal 'Falnl", "Kal'Falnl")
    .replace("Kal Fal'nl", "Kal'Falnl")
    .replace("Uchines", "Urchins")
    .replace("Calrissian Scoundrel", "Calrissian, Scoundrel")
    .replace("Chewie Enraged", "Chewie, Enraged")
    .replace("Cahmbers", "Chambers")
    .replace("Baby.", "Baby,")
    .replace(/Specter of Supreme/i, "Specter Of The Supreme")
    .replace("Ellors", "Ellorrs")
    .replace("Fighter's Coming In", "Fighters Coming In")
    .replace(
      /Hoth: Defensive Perimeter$/,
      "Hoth: Defensive Perimeter (3rd Marker)",
    )
    .replace("Hoth: Ice Plains (V)", "Hoth: Ice Plains (5th Marker) (V)")
    .replace("Ponda Boba", "Ponda Baba")
    .replace("Holotheater", "Holotheatre")
    .replace(/Interrogation Room$/, "Interrogation Room (Prison)")
    .replace("Sefia", "Sefla")
    .replace(/Ahsoka Tano With Lightsaber$/, "Ahsoka Tano With Lightsabers")
    .replace("Escape Pod Combo", "Escape Pod & We're Doomed")
    .replace("Toryn far (V)", "Toryn Farr (V)")
    .replace("Inquistor", "Inquisitor")
    .replace("Hit & Run", "Hit And Run")
    .replace("Hoth: Docking Bay", "Hoth: Echo Docking Bay")
    .replace("Commmander Arden", "Commander Ardan")
    .replace("Assaj", "Asajj")
    .replace(/Cloud City: Upper Plaza$/, "Cloud City: Upper Plaza Corridor")
    .replace(/General Leia$/, "General Leia Organa")
    .replace("Nelsoor", "Nesloor")
    .replace("Sergeant Misik", "Corporal Misik")
    .replace("Shadaa", "Shaddaa")
    .replace("Naboo Blaster (V)", "Naboo Blaster")
    .replace("Masterful Move and Endor", "Masterful Move & Endor")
    .replace(
      /Masterful Move &\s+Occupation/i,
      "Masterful Move & Endor Occupation",
    )
    .replace("Move & Endor Celebration", "Move & Endor Occupation")
    .replace("Director Krennic", "Director Orson Krennic")
    .replace(/Power Generators \(V\)$/, "Power Generators (1st Marker) (V)")
    .replace(/Hoth: North Ridge$/, "Hoth: North Ridge (4th Marker)")
    .replace(/Han With Heavy Blaster$/, "Han With Heavy Blaster Pistol")
    .replace("Vengeace", "Vengeance")
    .replace("Boshek", "BoShek")
    .replace(/Dash In Rogue 10/i, "Dash In Rogue 12")
    .replace('"Snap Wexley', "'Snap' Wexley") // missing right quote
    .replace("Wedge Antilles In Red Squadron 1", "Wedge In Red Squadron 1")
    .replace("Kylo With Lightsaber", "Kylo Ren With Lightsaber")
    .replace("Repairs ć Starship", "Repairs & Starship")

    // Doesn't need (V)
    .replace("Death Squadron Assignment (V)", "Death Squadron Assignment")
    .replace("A Brave Resistance (V)", "A Brave Resistance")
    .replace("Irritating (V)", "Irritating")
    .replace("Like Sand (V)", "Like Sand")
    .replace("Endor Commando Team (V)", "Endor Commando Team")
    .replace(/^Solo \(V\)$/, "Solo")
    .replace("Rogue One (V)", "Rogue One")
    .replace("Scarif: Turbolift Complex (V)", "Scarif: Turbolift Complex")
    .replace("General Airen Cracken (V)", "General Airen Cracken")
    .replace("Captain Hera Syndulla (V)", "Captain Hera Syndulla")
    .replace("Senator Mon Mothma (V)", "Senator Mon Mothma")
    .replace("Leia's Resistance Transport (V)", "Leia's Resistance Transport")
    .replace("Rebel Trooper Reinforcements (V)", "Rebel Trooper Reinforcements")
    .replace("Death Squadron Assignments", "Death Squadron Assignment")

    // correct capitalization for prettiness
    .replaceAll(" in ", " In ")
    .replaceAll(" and ", " And ")
    .replaceAll(" of ", " Of ")
    .replaceAll(" with ", " With ")
    .replaceAll(" the ", " The ")
    .replaceAll(" to ", " To ")
    .replaceAll(" is ", " Is ")
    .replaceAll(" a ", " A ")
    .replaceAll(" an ", " An ")
    .replaceAll(" for ", " For ")
    .replaceAll(" me ", " Me ")
    .replaceAll(" at ", " At ")
    .replaceAll(" the ", " The ")
    .replaceAll(" be ", " Be ")

    // specific capitalization errors
    .replace("Fn-", " FN-")
    .replace("thrawn", "Thrawn")
    .replace("command", "Command")
    .replace("moisture farm", "Moisture Farm")
    .replace("Obi-wan", "Obi-Wan")
    .replace("damage", "Damage")
    .replace("weapon", "Weapon")
    .replace("levitation", "Levitation")
    .replace("Kal'falnl", "Kal'Falnl")
    .replace("Tie Sentry", "TIE Sentry")
    .replace("clouds", "Clouds")
    .replace("dark lord", "Dark Lord")
    .replace("lightsaber", "Lightsaber")
    .replace("leave", "Leave")
    .replace("learner", "Learner")
    .replace("Le-BO2D9", "LE-BO2D9")
    .replace("PEace", "Peace")
    .replace('Temmin "Snap" Wexley', "Temmin 'Snap' Wexley")
    .replace('Ardon "Vapor" Crell', "Ardon 'Vapor' Crell");

const disambiguateCardsWithSameTitles = (body) =>
  body
    .replace(/Sense \(Pre.*\)/i, "Sense")
    .replace(/Alter \(Pre.*\)/i, "Alter")
    .replace(/Control \(Dag.*\)/i, "Control")
    .replace(/Tatooine \(Pre.*\)/i, "Tatooine")
    .replace(/Coruscant \(S.*\)/i, "Coruscant")
    .replace(/Obi-Wan's Lightsaber \(Pre.*\)/i, "Obi-Wan's Lightsaber")
    .replace(/Bib Fortuna \(J.*\)/i, "Bib Fortuna")

    // not the official titles but must be used by downstream matchers to find the right card
    .replace(/Sense \((Ep.*|Cor.*)\)/i, "Sense (Episode I)")
    .replace(/Alter \((Ep.*|Cor.*)\)/i, "Alter (Episode I)")
    .replace(/Control \((Ep.*|Cor.*)\)/i, "Control (Episode I)")
    .replace(/Tatooine \((Ep.*|Cor.*)\)/i, "Tatooine (Episode I)")
    .replace(/Coruscant \((Ep.*|Cor.*)\)/i, "Coruscant (Episode I)")
    .replace(
      /Obi-Wan's Lightsaber \((e.*|r.*)\)/i,
      "Obi-Wan's Lightsaber (Episode I)",
    )
    .replace(/Bib Fortuna \((e.*|r.*)\)/i, "Bib Fortuna (Episode I)")

    .replace("Boba Fett (SE)", "Boba Fett (Special Edition")
    .replace("Boba Fett (CC)", "Boba Fett (Cloud City")

    .replace("Alter (V)", "Alter (Premiere) (V)"); // official title for Premiere (V) only
// .replace("Sense (V)", "Sense (Premiere) (V)") // this cards is blanked

main();
