# QuestioneerTelegramBot
A Telegram bot that only asks you the tough questions you ask yourself

## Setup

1. Clone this respository
2. `cd` into the repository and run `npm install`
3. Create a [Telegram Bot](https://t.me/botfather)
4. Once you have created a bot, copy its API key and either set the `BOT_TOKEN` environment variable or replace `process.env.BOT_TOKEN` in [index.js](https://github.com/jassler/QuestioneerTelegramBot/blob/main/index.js#L10) with this token
5. Run `npm start` and start your bot in Telegram

## Data Persistence

Progress is saved through json files. git does not track changes in `playerstatus.json` - if changes are supposed to be made in there, run `git update-index --no-assume-unchanged playerstatus.json`.

# Get images

Send a image to the bot. The image id should be saved in `newimages.txt` - copy that into the answer of your question.
