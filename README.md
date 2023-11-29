# swccgpt
The AI Star Wars CCG Rules Expert

## Setup
### Card Facts
`node generateCardFacts.js`
This will download the card definition JSON files, card images, and generate the cardFacts.txt file.

### Download Decklists
`node downloadDecklists.js`
This will download all tournament decklists from the PC website from the year defined in the constasnt "CURRENT_META_YEAR"

### Download Card Images
`node downloadCardImages.js`
This will download all images for all cards locally.
