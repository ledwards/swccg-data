#!/bin/sh

# Stop at the first failing step instead of publishing partial data.
set -e

node generateCardFacts.js
# node downloadCardImages.js
node scrapeTournaments.js
node scrapeDecklists.js

node --max-old-space-size=16384 generateDecklistTxt.js
node generateArchetypes.js
node generatePlayers.js
node generateDecklistJson.js
# generateDecklistJson.js only parses decklists it has not seen; this rebuilds
# public/decklists.json from all of them.
node regenerateDecklistsJson.js
node generateDecklistGemp.js
