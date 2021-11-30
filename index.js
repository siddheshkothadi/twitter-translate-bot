const express = require("express");
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const axios = require("axios").default;
let qs = require("qs");
const Twit = require("twit");

const lastIdProcessedSchema = new Schema({
  sinceId: {
    type: String,
    required: true,
  },
});

const LastIdProcessed = mongoose.model(
  "lastIdProcessed",
  lastIdProcessedSchema
);

const app = express();
app.use(express.json());
require("dotenv").config();

app.get('/', (req, res) => {
  res.send('I\'m alive');
});

const ATLAS_URI = process.env.ATLAS_URI;
const port = process.env.PORT || 3000;
const ID = process.env.ID;
const USERNAME = process.env.USERNAME;
const BEARER_TOKEN = process.env.BEARER_TOKEN;
const RAPID_API_HOST = process.env.RAPID_API_HOST;
const RAPID_API_KEY = process.env.RAPID_API_KEY;
const API_KEY = process.env.API_KEY;
const API_KEY_SECRET = process.env.API_KEY_SECRET;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET;

const T = new Twit({
  consumer_key: API_KEY,
  consumer_secret: API_KEY_SECRET,
  access_token: ACCESS_TOKEN,
  access_token_secret: ACCESS_TOKEN_SECRET,
});

function replyToTweet(tweetId, text, username, lastProcessedId) {
  const finalTweetText = `@${username} ${text}`;
  T.post(
    "statuses/update",
    {
      status: finalTweetText,
      in_reply_to_status_id: tweetId,
    },
    function (err, data, response) {
      if (err) {
        console.log(err);
      } else {
        console.log(data);
        // Update the last processed id
        lastProcessedId.sinceId = tweetId;
        console.log("updating last processed id to", tweetId);
        lastProcessedId
          .save()
          .then(() => {
            console.log("updated last processed id");
          })
          .catch((err) => {
            console.log(err);
          });
      }
    }
  );
}

async function translateText(text) {
  var options = {
    method: "POST",
    url: `https://${RAPID_API_HOST}/goo/translate/`,
    headers: {
      'content-type': 'application/json',
      "x-rapidapi-host": RAPID_API_HOST,
      "x-rapidapi-key": RAPID_API_KEY,
    },
    data: {fromLang: 'auto-detect', text: text.replace(/(?:https?|ftp):\/\/[\n\S]+/g, ''), to: 'mr'}
  };
  console.log("options");
  console.log(options);

  const response = await axios(options);

  return response.data.translatedText;
}

async function fetchMentions() {
  try {
    const lastProcessedId = await LastIdProcessed.findOne({});
    const sinceId = lastProcessedId.sinceId;
    console.log("last processed id is", sinceId);

    let tweetMentionURL = `https://api.twitter.com/2/users/${ID}/mentions?expansions=referenced_tweets.id,referenced_tweets.id.author_id`;
    if (sinceId && sinceId.length > 0) {
      tweetMentionURL += `&since_id=${sinceId}`;
    }

    console.log("Fetching mentions...", tweetMentionURL);

    const response = await axios.get(tweetMentionURL, {
      headers: {
        Authorization: `Bearer ${BEARER_TOKEN}`,
      },
    });

    const { data, includes } = response.data;

    if (data) {
      const tweetsToReplyTo = data
        .map((tweet) => {
          if (tweet.referenced_tweets && tweet.referenced_tweets.length > 0) {
            // It's a reply to a tweet above
            // So translate the tweet id to the tweet it's a reply to
            console.log("reply");
            const tweetId = tweet.referenced_tweets[0].id;
            const tweetText = includes.tweets
              .find((tweet) => tweet.id === tweetId)
              .text.replace(/\n/g, " ");
            const username = includes.users.find(
              (user) => user.id === tweet.author_id
            ).username;

            return {
              id: tweet.id,
              text: tweetText,
              username: username,
            };
          } else {
            // It's a tweet itself which is to be translated
            console.log("normal tweet");

            const username = includes.users.find(
              (user) => user.id === tweet.author_id
            ).username;

            return {
              id: tweet.id,
              text: tweet.text.replace(/\n/g, " ").replace(USERNAME, ""),
              username: username,
            };
          }
        })
        .sort((a, b) => {
          return a.id - b.id;
        });

      console.log("following tweets are to be replied to");
      console.log(tweetsToReplyTo);

      // Translate all tweets and reply them one by one
      for (const tweet of tweetsToReplyTo) {
        const translatedText = await translateText(tweet.text.trim());
        console.log("translated text is", translatedText);
        replyToTweet(tweet.id, translatedText, tweet.username, lastProcessedId);
      }
    } else {
      console.log("no tweets to reply to");
    }

    setTimeout(fetchMentions, 30000);
  } catch (err) {
    console.log(err);
    setTimeout(fetchMentions, 30000);
  }
}

mongoose
  .connect(ATLAS_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Database connection successful");
    fetchMentions();
  })
  .catch((error) => console.log(error));

app.listen(port, () => console.log(`Server started on port ${port}`));
