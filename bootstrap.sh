#!/bin/sh

node generateCardFacts.js
# node downloadCardImages.js
node scrapeTournaments.js
node scrapeDecklists.js

node --max-old-space-size=16384 generateDecklistTxt.js
node generateArchetypes.js
node generatePlayers.js
node generateDecklistJson.js
node generateDecklistGemp.js
