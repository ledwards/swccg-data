#!/bin/sh

node generateCardFacts.js
node downloadCardImages.js
node scrapeTournaments.js
node scrapeDecklists.js

node --max-old-space-size=16384 generateDecklistTxt.js
node generateArchetypesJson.js
node generatePlayersJson.js
node generateDecklistJson.js
