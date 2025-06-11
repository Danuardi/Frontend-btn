require('dotenv').config();
const confidence = require('confidence');

const config = {
    host: process.env.APP_HOST,
    env: process.env.APP_ENV,
    port: process.env.PORT,
    mongo: process.env.MONGODB_URI,
    basicAuthApi: [
        {
            username: process.env.BASIC_USERNAME,
            password: process.env.BASIC_PASSWORD,
        },
    ],
    currencyExchangeApi: {
        url: process.env.API_URL_CURRENCY,
        access_key: process.env.API_ACCESS_KEY_CURRENCY,
    },
    newsDataApi: {
        apiKey: process.env.NEWSDATA_API_KEY
    }
};
const store = new confidence.Store(config);

exports.get = (key) => store.get(key);
