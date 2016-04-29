import _ from 'lodash';
import express from 'express';
import tumblr from 'tumblr.js';
import request from 'superagent';


let env;
try {
  env = require('./env.json');
  _.defaults(process.env, env);
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND'){
    console.log('No env.json found. Assuming production.');
  } else {
    console.log('Error loading env', error);
  }
}

const client = tumblr.createClient({
  consumer_key: process.env.TUMBLR_API_KEY,
  consumer_secret: process.env.TUMBLR_API_SECRET,
});

const router = express.Router();

const cache = {
  posts: {
    time: 0,
    data: [],
  },
  poems: {
    time: 0,
    data: [],
  },
};
// Cache for an hour.
const TTL = 60 * 60 * 1000;

function cached(key) {
  return (req, res, next) => {
    const cacheData = cache[key];
    if (!cacheData) {
      return next();
    }
    const now = new Date().getTime();
    if (now - cacheData.time < TTL) {
      res.send(cacheData.data);
    } else {
      next();
    }
  };
}

router.get('/posts', cached('posts'), (req, res) => {
  const tag = 'essay';
  const limit = 10;
  const filter = 'html';
  client.posts('dbow1234', {tag, limit, filter}, (err, response) => {
    if (err) {
      res.sendStatus(500);
    } else {
      cache.posts = {
        data: response.posts,
        time: new Date().getTime(),
      };
      res.send(response.posts);
    }
  });
});


router.get('/poems', cached('poems'), (req, res) => {
  const tag = 'instapoem';
  const limit = 10;
  const filter = 'html';
  client.posts('dbow1234', {tag, limit, filter}, (err, response) => {
    if (err) {
      res.sendStatus(500);
    } else {
      const poems = response.posts.map((poem) => {
        const url = poem['link_url'] || poem['permalink_url'];
        const oembedUrl = 'http://api.instagram.com/oembed';
        const query = {
          url,
          beta: true,
          omitscript: true,
        };
        return new Promise((resolve, reject) => {
          request
            .get(oembedUrl)
            .query(query)
            .end((error, response) => {
              const content = response && response.body;
              if (error || !content || _.isEmpty(content)) {
                reject(error, content);
              } else {
                resolve({
                  content,
                  url,
                });
              }
            });
        });
      });
      Promise.all(poems)
        .then((results) => {
          cache.poems = {
            data: results,
            time: new Date().getTime(),
          };
          res.send(results);
        })
        .catch((error) => {
          res.sendStatus(500);
        });
    }
  });
});


export default router;
