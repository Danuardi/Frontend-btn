const axios = require('axios');
const logger = require('../../bin/helper/logger');
const global_config = require('../../bin/helper/global_config');

const CACHE_DURATION = 3600000; // 1 hour in milliseconds
let newsCache = {
  data: {},
  timestamp: {}
};

async function getCountryNews(countryCode) {
  try {
    // Check cache first
    if (newsCache.data[countryCode] && 
        Date.now() - newsCache.timestamp[countryCode] < CACHE_DURATION) {
      return newsCache.data[countryCode];
    }

    const apiKey = global_config.get('/newsDataApi/apiKey');
    if (!apiKey) {
      throw new Error('News API key is not configured');
    }

    const countryMapping = {
      'US': 'united states',
      'ID': 'indonesia',
      'JP': 'japan',
      'CN': 'china',
      'GB': 'united kingdom',
      'DE': 'germany',
      'IN': 'india',
      'BR': 'brazil',
      'AU': 'australia',
      'KR': 'south korea'
    };

    const country = countryMapping[countryCode];
    if (!country) {
      throw new Error(`Unsupported country code: ${countryCode}`);
    }

    const response = await axios.get('https://newsdata.io/api/1/news', {
      params: {
        apikey: apiKey,
        country: countryCode.toLowerCase(),
        category: 'business,politics',
        language: 'en',
        size: 5
      }
    });

    const formattedNews = response.data.results.map(article => ({
      title: article.title,
      description: article.description,
      url: article.link,
      source: article.source_name,
      publishedAt: article.pubDate,
      imageUrl: article.image_url || null
    }));

    // Update cache
    newsCache.data[countryCode] = formattedNews;
    newsCache.timestamp[countryCode] = Date.now();

    return formattedNews;
  } catch (error) {
    logger.log('news-service', `Error fetching news for ${countryCode}: ${error.message}`, 'error');
    return [];
  }
}

module.exports = {
  getCountryNews
};