const tournamentSignifiers = [
  "Playoffs",
  "Series",
  "Prix",
  "Melee",
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
  "Tournament",
  "GEMPC7",
  "GEMPC",
  "OCS",
  "Mini-Worlds",
  "SSS",
  "Showdown",
  "Major",
  "Classic",
];

const roundNames = [
  "Day 1",
  "Day 2",
  "Day 3",
  "Top 4",
  "Top 8",
  "Top 16",
  "Elite 8",
  "Quarterfinals",
  "Semifinals",
  "Semi-Finals",
  "Finals",
  "Tiebreaker",
  "Round 1",
  "Round 2",
  "Sweet 16",
  "Final Confrontation",
];

// Decklist posts the site renamed while tournament pages still link the old
// (now 403) address.
const decklistUrlFixes = {
  "https://www.starwarsccg.org/2025-coruscant-regionals-greg-shaw-ls-wys/":
    "https://www.starwarsccg.org/2025-coruscant-regionals-greg-shaw-ls-watch-your-step/",
  // The tournament page links a MAP deck; the Top 4 DS deck is First Order Reigns.
  "https://www.starwarsccg.org/2025-european-championship-top-4-justin-branch-ds-map/":
    "https://www.starwarsccg.org/2025-european-championship-top-4-justin-branch-ds-first-order-reigns/",
};

module.exports = {
  tournamentSignifiers,
  roundNames,
  decklistUrlFixes,
};
