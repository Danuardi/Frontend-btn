const CurrencyExchange = require('../models/CurrencyExchange');
const global_config = require('../../bin/helper/global_config');
const axios = require('axios');
const logger = require('../../bin/helper/logger');
const dataUpdateEmitter = require('../../bin/helper/eventEmitter');
const finalScoreService = require('./finalScoreService');

async function getCurrencyExchange() {
  try {
    // Get configuration
    const url = global_config.get('/currencyExchangeApi/url');
    const access_key = global_config.get('/currencyExchangeApi/access_key');
    
    if (!url || !access_key) {
      throw new Error('Currency API configuration is missing');
    }

    // Get previous rate first
    const previousData = await CurrencyExchange.findOne().sort({ timestamp: -1 });
    const previousRate = previousData ? previousData.short : null;

    // Get new rate
    const response = await axios.get(`${url}?access_key=${access_key}&source=USD&currencies=IDR`);
    const { timestamp, source, quotes } = response.data;
    const currentRate = quotes.USDIDR;

    // Save with proper historical data
    const data = {
      timestamp,
      source,
      quotes,
      short: currentRate.toString(),
      long: previousRate || currentRate.toString(),
      previousRate: previousRate || currentRate.toString()
    };

    // Save first before triggering any events
    const result = await new CurrencyExchange(data).save();
    
    logger.log('currency-service', `Previous rate: ${previousRate}`, 'info');
    logger.log('currency-service', `New currency rate saved: ${currentRate}`, 'info');
    logger.log('currency-service', `Response data: ${JSON.stringify(response.data)}`, 'debug');

    // Then trigger calculations
    await finalScoreService.calculateAndUpdateFinalScore();
    
    // Finally emit event
    dataUpdateEmitter.emit('data-updated', 'currency');
    
    return result;
  } catch (error) {
    logger.log('currency-service', `Error getting currency exchange: ${error.message}`, 'error');
    throw new Error('Currency Exchange error');
  }
}

module.exports = {
  getCurrencyExchange
};