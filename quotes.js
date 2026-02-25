// Clavicular's own quotes remixed back at him
const CLAVICULAR_QUOTES = [
  `"You guys are a bunch of fucking clown retards" — yeah and we're up 🤡`,
  `Remember when you said Bitcoin is "dog shit"? $RETARDS disagrees 🚀`,
  `"Don't trust this fucking garbage" — bro we ARE the garbage and we're thriving`,
  `"Horrible investment" he said. Meanwhile $RETARDS holders are cryptomaxxing 🤡`,
  `The bunch of fucking clown retards send their regards ser`,
  `Thanks for the coin name 🫡 $RETARDS on Solana`,
  `Half of us are on suicide watch. The other half are buying more $RETARDS`,
  `"A bunch of fucking numbers on a blockchain" — yeah, and they're going UP`,
  `The clown retards are still here. Still buying. Still cryptomaxxing. 🤡`,
  `Every time you tweet, another retard buys $RETARDS. Keep going king`,
  `We turned your rant into a coin. You turned us into millionaires. Fair trade? 🤝`,
  `Cryptomaxxing 101: buy $RETARDS every time Clavicular posts`,
  `The founding father of $RETARDS has spoken again. Bullish. 🔥`,
  `Ser the bunch of fucking clown retards are requesting your acknowledgement`,
  `Another day another Clavicular post another $RETARDS pump 🤡🚀`,
  `You can't stop the clown retards. We are inevitable.`,
  `Imagine hating crypto so hard you accidentally create the best meme coin on Solana`,
  `$RETARDS — for the bunch of fucking clown retards who won't stop buying crypto 🤡`,
  `Our founding father speaks! The cryptomaxxing community thanks you ser`,
  `Quick someone clip this and overlay "cryptomaxxing" on it again`,
  `The IRL stream tracker is almost ready btw 📍 see you soon king`,
  `Phase 2 of the $RETARDS roadmap: troll Clavicular on every platform. Phase 2 is going well.`,
  `"It's a bunch of fucking numbers on a blockchain" — the numbers are going up tho`,
  `The anti-crypto rant that launched a thousand wallets. Legend. 🫡`,
  `Clavicular: hates crypto. Also Clavicular: creates a top Solana meme coin. You can't make this up.`,
];

// Shill lines (shorter, more direct)
const SHILLS = [
  `$RETARDS on Solana — by the clown retards, for the clown retards 🤡\ncryptomaxxing.io`,
  `The bunch of fucking clown retards are cryptomaxxing\n$RETARDS | cryptomaxxing.io`,
  `$RETARDS 🤡 Solana's finest clown retard community\ncryptomaxxing.io`,
];

function getRandomQuote() {
  return CLAVICULAR_QUOTES[Math.floor(Math.random() * CLAVICULAR_QUOTES.length)];
}

function getRandomShill() {
  return SHILLS[Math.floor(Math.random() * SHILLS.length)];
}

// Make sure we don't repeat quotes too soon
class QuoteRotator {
  constructor(quotes) {
    this.quotes = [...quotes];
    this.used = [];
  }

  next() {
    if (this.quotes.length === 0) {
      this.quotes = [...this.used];
      this.used = [];
    }
    const idx = Math.floor(Math.random() * this.quotes.length);
    const quote = this.quotes.splice(idx, 1)[0];
    this.used.push(quote);
    return quote;
  }
}

module.exports = { CLAVICULAR_QUOTES, SHILLS, getRandomQuote, getRandomShill, QuoteRotator };
