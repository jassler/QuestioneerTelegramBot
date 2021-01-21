const { Telegraf, Markup, Context } = require('telegraf')
const fs = require('fs')

const QUESTION_FILE = 'questions.json'
const PLAYER_FILE = 'playerstatus.json'

/**
 * @type {{chatid: {
 *    points: number,
 *    total: number,
 *    history: [number],
 *    q: {
 *      type: ('open'|'image'|'truefalse'|'multiplechoice'|'reply'),
 *      q: string,
 *      a: (string|[string]),
 *      description: (string|undefined)
 *    }
 * }}}
 */
const players = JSON.parse(fs.readFileSync(PLAYER_FILE))

/**
 * @type {[{
 *    type: ('open'|'image'|'truefalse'|'multiplechoice'|'reply'),
 *    q: string,
 *    a: (string|[string]),
 *    description: (string|undefined)}
 * ]}
 */
const questions = JSON.parse(fs.readFileSync(QUESTION_FILE))

const token = process.env.BOT_TOKEN
const bot = new Telegraf(token)

/**
 * Pick a new question, ignore questions that have already come up in the past,
 * New question index is pushed to history!
 * 
 * @param {[number]} history 
 */
function randomQuestion(history) {
  var newQuestionIndex = 0
  var tries = 0
  do {
    newQuestionIndex = Math.floor(Math.random() * questions.length)
  } while(history.indexOf(newQuestionIndex) >= 0 && ++tries < 20)

  history.push(newQuestionIndex)
  if(history.length > 10)
    history.shift()

  return questions[newQuestionIndex]
}

/**
 * Data persistence, save player in cache and json file
 * 
 * @param {number} chatId 
 * @param {Object} p (see above for values)
 */
function updatePlayer(chatId, p) {
  players[chatId] = p
  fs.writeFileSync(PLAYER_FILE, JSON.stringify(players))
}

/**
 * Prepare next question for user
 * @param {Context} ctx 
 */
function nextQuestion(ctx) {
  const chatId = ctx.chat.id
  let p = players[chatId] ?? {
    points: 0,
    total: 0,
    history: []
  }

  if(!p.history)
    p.history = []

  p.q = randomQuestion(p.history)
  
  updatePlayer(chatId, p)
  sendQuestion(ctx, p.q)
}

/**
 * 
 * @param {Context} ctx 
 * @param {{
 *      type: ('open'|'image'|'truefalse'|'multiplechoice'|'reply'),
 *      q: string,
 *      a: (string|[string]),
 *      description: (string|undefined)
 * }} question
 */
function sendQuestion(ctx, question) {
  switch(question.type) {
    case 'open':
      ctx.reply(question.q, Markup.inlineKeyboard([
        Markup.button.callback('Antwort anzeigen', `ans`)
      ]))
      break

    case 'image':
      ctx.reply(question.q, { ...Markup.inlineKeyboard([
        Markup.button.callback('Bild anzeigen', `img`)
      ])})
      break

    case 'truefalse':
      ctx.reply(question.q, { ...Markup.inlineKeyboard([
        Markup.button.callback('Wahr', `true`),
        Markup.button.callback('Falsch', `false`)
      ])})
      break

    case 'multiplechoice':
      ctx.replyWithPoll(question.q, question.a.map(v => v.startsWith('✓') ? v.substring(1) : v), {
        allows_multiple_answers: true,
        is_anonymous: false
      })
      break

    case 'reply':
      ctx.reply(`📝 ${question.q}`)
      break

    default:
      console.log(`Unknown question type ${question.type}`)
  }
}

bot.action(/ans/, ctx => {
  const p = players[ctx.chat.id]
  if(p === undefined || p.q.type !== 'open')
    return
  
  ctx.editMessageText(`${p.q.q}\n${p.q.a}`)
  nextQuestion(ctx)
  return ctx.answerCbQuery(ctx.chosenInlineResult)
})

bot.action(/img/, ctx => {
  const p = players[ctx.chat.id]
  if(p === undefined || p.q.type !== 'image')
    return
  
  ctx.editMessageText(p.q.q)
  ctx.replyWithPhoto(p.q.a)
  nextQuestion(ctx)
  return ctx.answerCbQuery("Einmal Bild prüfen")
})

bot.action(/true|false/, (ctx) => {
  const p = players[ctx.chat.id]
  const answer = ctx.match[0]

  if(p === undefined || p.q.type !== 'truefalse')
    return
  
  if(p.q.a === (answer === 'true')) {
    ctx.editMessageText(`${p.q.q}\n✓`)
  } else {
    ctx.editMessageText(`${p.q.q}\nDie Aussage ist ${p.q.a ? 'richtig' : 'falsch'}: ${p.q.description}`)
  }

  nextQuestion(ctx)
  return ctx.answerCbQuery(ctx.chosenInlineResult)
})

bot.on('message', (ctx, next) => {
  const p = players[ctx.chat.id]
  const answer = ctx.message.text

  if(p === undefined || p.q.type !== 'reply' || answer.startsWith('/')) {
    next()
    return
  }

  if(answer === p.q.a)
    ctx.reply('Richtig!')
  else
    ctx.reply(`Falsch. Die Antwort ist: ${p.q.a}`)
  
  nextQuestion(ctx)
})

bot.on('poll_answer', (ctx, answer) => {

  const chatId = ctx.pollAnswer.user.id
  const p = players[chatId]

  if(p === undefined || p.q.type !== 'multiplechoice')
    return

  const hisAnswers = ctx.pollAnswer.option_ids
  const actual = p.q.a.reduce((a,e,i) => (e.startsWith('✓')) ? a.concat(i) : a, [])

  var correct = true

  if(hisAnswers.length !== actual.length) {
    correct = false
  } else {
    // maybe sort hisAnswers?
    for (let i = 0; i < actual.length; i++) {
      if(actual[i] !== hisAnswers[i]) {
        correct = false
        break
      }
    }
  }

  if(correct)
    bot.telegram.sendMessage(chatId, 'Richtig!\n\n/next')
  else
    bot.telegram.sendMessage(chatId, `Folgende Antworten wären richtig gewesen: ${actual.join(', ')}\n\n/next`)
})

// Middleware: make sure player is in map
bot.use(async (ctx, next) => {
  if(ctx.chat.id in players || ctx.message.text === '/start')
    next()
  else
    ctx.reply('Hi! You may need to type "/start" before you are able to answer any questions.')
})

// just log any errors
bot.catch((err, ctx) => {
  console.log(`Encountered error for ${ctx.updateType}`, err)
})

// /start command: add (or renew) player
bot.start(ctx => {
  nextQuestion(ctx)
})

bot.command('next', ctx => {
  nextQuestion(ctx)
})

// log photo id
bot.on('photo', (msg, meta) => {
  console.log(msg)
  fs.appendFileSync('newimages.txt', '\n' + msg.photo[0].file_id)
})

bot.launch()
