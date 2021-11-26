const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const axios = require("axios").default;
let qs = require("qs");

const lastIdProcessedSchema = new Schema({
  sinceId: {
    type: String,
    required: true
  }
});

const LastIdProcessed = mongoose.model("lastIdProcessed", lastIdProcessedSchema);

const app = express();
app.use(cors());
app.use(express.json());
require("dotenv").config();

const ATLAS_URI = process.env.ATLAS_URI;
const port = process.env.PORT || 3000;
const ID = process.env.ID;
const USERNAME = process.env.USERNAME;
const BEARER_TOKEN = process.env.BEARER_TOKEN;
const RAPID_API_HOST = process.env.RAPID_API_HOST;
const RAPID_API_KEY = process.env.RAPID_API_KEY;

async function translateText(text) {
  var options = {
    method: 'POST',
    url: 'https://google-translate1.p.rapidapi.com/language/translate/v2',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'accept-encoding': 'application/gzip',
      'x-rapidapi-host': RAPID_API_HOST,
      'x-rapidapi-key': RAPID_API_KEY,
    },
    data: qs.stringify({q: text, target: 'mar'})
  };
  console.log('options');
  console.log(options);

  const response = await axios(options);

  console.log(response.data.data.translations[0].translatedText);

  return response.data.data.translations[0].translatedText;
}

async function replyToTweet(tweetId, text) {
}

async function fetchMentions() {
  try {
    const lastProcessedId = await LastIdProcessed.findOne({});
    const sinceId = lastProcessedId?.sinceId;
    console.log('last processed id is', sinceId);

    let tweetMentionURL = `https://api.twitter.com/2/users/${ID}/mentions?expansions=referenced_tweets.id`;
    if(sinceId && sinceId.length > 0) {
      tweetMentionURL += `&since_id=${sinceId}`;
    }

    console.log("Fetching mentions...", tweetMentionURL);

    const response = await axios.get(tweetMentionURL, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`
      }
    });

    const {data, includes} = response.data;

    const tweetsToReplyTo = data.map(tweet => {
      if(tweet.referenced_tweets && tweet.referenced_tweets.length > 0) {
        // It's a reply to a tweet above
        // So translate the tweet id to the tweet it's a reply to
        console.log('reply')
        const tweetId = tweet.referenced_tweets[0].id;
        const tweetText = includes.tweets.find(tweet => tweet.id === tweetId).text.replace(/\n/g, ' ');

        return {
          id: tweet.id,
          text: tweetText
        };
      } else {
        // It's a tweet itself which is to be translated
        console.log('normal tweet')
        return {
          id: tweet.id, 
          text: tweet.text.replace(/\n/g, ' ').replace(`@${USERNAME}`, '')
        };
      }
    });

    console.log('following tweets are to be replied to');
    console.log(tweetsToReplyTo);

    // Translate all tweets and reply them one by one
    for(const tweet of tweetsToReplyTo) {
      const translatedText = await translateText(tweet.text);
      console.log('translated text is', translatedText);
      await replyToTweet(tweet.id, translatedText);

      // Update the last processed id
      lastProcessedId.sinceId = tweet.id;
      console.log('updating last processed id to', tweet.id);
      await lastProcessedId.save();
    }

    setTimeout(fetchMentions, 30000);

    // axios.get(tweetMentionURL, {
    //   headers: {
    //     Authorization: `Bearer ${BEARER_TOKEN}`
    //   }
    // }).then(response => {
    //   const {data, includes} = response.data;
    //   console.log(data);
    //   console.log(includes);
    // }).catch(error => console.log(error));
  }
  catch(err) {
    console.log(err);
  }
}

mongoose.connect(ATLAS_URI, { 
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("Database connection successful");
    // fetchMentions();
    translateText('hello world!');
}).catch(error => console.log(error));

app.listen(port, () => console.log(`Server started on port ${port}`));
