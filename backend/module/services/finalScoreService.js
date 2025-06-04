const FinalScore = require('../models/FinalScore');
const Inflation = require('../models/Inflation');
const CurrencyExchange = require('../models/CurrencyExchange');
const Obligasi = require('../models/Obligasi');
const IndexSaham = require('../models/IndexSaham');
const logger = require('../../bin/helper/logger');
const dataUpdateEmitter = require('../../bin/helper/eventEmitter');

const WEIGHTS = {
  INFLATION: 0.25,
  CURRENCY: 0.25,
  OBLIGASI: 0.25,
  SAHAM: 0.25
};

const RANGES = {
  INFLATION: { min: -10, max: 10, description: "Inflasi tahunan dalam persen" },
  CURRENCY: { min: -10, max: 10, description: "Perubahan nilai tukar dalam persen" },
  OBLIGASI: { min: -30, max: 30, description: "Return obligasi dalam persen" },
  SAHAM: { min: -30, max: 30, description: "Return saham dalam persen" }
};

function normalizeValue(value, min, max, indicatorName) {
  const ctx = 'normalize-value';
  if (value < min || value > max) {
    logger.log(ctx, `Warning: ${indicatorName} value (${value}) is outside normal range [${min}, ${max}]`, 'warning');
  }

  const clampedValue = Math.max(min, Math.min(max, value));
  if (clampedValue !== value) {
    logger.log(ctx, `Value for ${indicatorName} was clamped from ${value} to ${clampedValue}`, 'warning');
  }

  return ((clampedValue - min) / (max - min)) * 100;
}

function assessRisk(score) {
  if (score >= 80) return 'LOW_RISK';
  if (score >= 65) return 'LOW_MEDIUM_RISK';
  if (score >= 45) return 'MEDIUM_RISK';
  if (score >= 30) return 'MEDIUM_HIGH_RISK';
  return 'HIGH_RISK';
}

function analyzeTrend(current, previous) {
  const percentChange = ((current - previous) / previous) * 100;
  if (Math.abs(percentChange) < 1) return 'STABLE';
  return percentChange > 0 ? 'IMPROVING' : 'DECLINING';
}

async function calculateFinalScore() {
  try {
    const [latestCurrency, latestInflation, latestObligasi, latestSaham] = await Promise.all([
      CurrencyExchange.findOne().sort({ timestamp: -1 }),
      Inflation.findOne().sort({ period: -1 }),
      Obligasi.findOne().sort({ tanggal: -1 }),
      IndexSaham.findOne().sort({ tanggal: -1 })
    ]);

    if (!latestCurrency || !latestInflation || !latestObligasi || !latestSaham) {
      throw new Error('Missing required indicator data for final score calculation');
    }

    const inflationScore = calculateInflationScore(latestInflation);
    const currencyScore = calculateCurrencyScore(latestCurrency);
    const obligasiScore = calculateObligasiScore(latestObligasi);
    const sahamScore = calculateSahamScore(latestSaham);

    const indicators = [inflationScore, currencyScore, obligasiScore, sahamScore];

    const final_score = indicators.reduce((acc, i) => acc + i.short_term_weighted, 0);
    const short_term_score = indicators.reduce((acc, i) => acc + i.short_term, 0) / indicators.length;
    const long_term_score = indicators.reduce((acc, i) => acc + i.long_term, 0) / indicators.length;

    const risk_assessment = {
      short_term_risk: assessRisk(short_term_score),
      long_term_risk: assessRisk(long_term_score),
      overall_risk: assessRisk(final_score)
    };

    const result = await new FinalScore({
      indicators,
      final_score,
      short_term_score,
      long_term_score,
      risk_assessment,
      timestamp: new Date()
    }).save();

    dataUpdateEmitter.emit('final-score-updated');
    return result;
  } catch (error) {
    logger.log('final-score-service', `Error in calculateFinalScore: ${error.message}`, 'error');
    throw error;
  }
}

function calculateInflationScore(inflation) {
  const short = parseFloat(inflation.short);
  const long = parseFloat(inflation.long);
  if (isNaN(short) || isNaN(long)) {
    throw new Error(`Invalid inflation values: short=${inflation.short}, long=${inflation.long}`);
  }

  const normalizedShort = normalizeValue(short, RANGES.INFLATION.min, RANGES.INFLATION.max, 'INFLATION');
  const normalizedLong = normalizeValue(long, RANGES.INFLATION.min, RANGES.INFLATION.max, 'INFLATION');

  return {
    name: 'INFLATION',
    short_term: normalizedShort,
    long_term: normalizedLong,
    weight: WEIGHTS.INFLATION,
    short_term_weighted: normalizedShort * WEIGHTS.INFLATION,
    long_term_weighted: normalizedLong * WEIGHTS.INFLATION,
    metadata: {
      raw_short: short,
      raw_long: long,
      trend: analyzeTrend(long, short),
      range: RANGES.INFLATION
    }
  };
}

function calculateCurrencyScore(currency) {
  const currentRate = parseFloat(currency.short);
  const previousRate = parseFloat(currency.long);
  if (isNaN(currentRate) || isNaN(previousRate)) {
    throw new Error(`Invalid currency values: current=${currentRate}, previous=${previousRate}`);
  }

  const percentChange = ((currentRate - previousRate) / previousRate) * 100;
  const normalizedValue = normalizeValue(percentChange, RANGES.CURRENCY.min, RANGES.CURRENCY.max, 'CURRENCY');

  return {
    name: 'CURRENCY',
    short_term: normalizedValue,
    long_term: normalizedValue,
    weight: WEIGHTS.CURRENCY,
    short_term_weighted: normalizedValue * WEIGHTS.CURRENCY,
    long_term_weighted: normalizedValue * WEIGHTS.CURRENCY,
    metadata: {
      current_rate: currentRate,
      previous_rate: previousRate,
      raw_change_percentage: percentChange,
      trend: analyzeTrend(currentRate, previousRate),
      range: RANGES.CURRENCY
    }
  };
}

function calculateObligasiScore(obligasi) {
  const short_term = parseFloat(obligasi.future_simulation.short.pnl_pct);
  const long_term = parseFloat(obligasi.future_simulation.long.pnl_pct);
  if (isNaN(short_term) || isNaN(long_term)) {
    throw new Error(`Invalid obligasi values: short=${short_term}, long=${long_term}`);
  }

  const normalizedShort = normalizeValue(short_term, RANGES.OBLIGASI.min, RANGES.OBLIGASI.max, 'OBLIGASI');
  const normalizedLong = normalizeValue(long_term, RANGES.OBLIGASI.min, RANGES.OBLIGASI.max, 'OBLIGASI');

  return {
    name: 'OBLIGASI',
    short_term: normalizedShort,
    long_term: normalizedLong,
    weight: WEIGHTS.OBLIGASI,
    short_term_weighted: normalizedShort * WEIGHTS.OBLIGASI,
    long_term_weighted: normalizedLong * WEIGHTS.OBLIGASI,
    metadata: {
      raw_short: short_term,
      raw_long: long_term,
      trend: analyzeTrend(long_term, short_term),
      range: RANGES.OBLIGASI
    }
  };
}

function calculateSahamScore(saham) {
  const pnl = parseFloat(saham.future_info.pnl);
  const margin = parseFloat(saham.future_info.initial_margin);
  if (isNaN(pnl) || isNaN(margin) || margin === 0) {
    throw new Error(`Invalid saham values: pnl=${pnl}, margin=${margin}`);
  }

  const returnPct = (pnl / margin) * 100;
  const normalizedValue = normalizeValue(returnPct, RANGES.SAHAM.min, RANGES.SAHAM.max, 'SAHAM');

  return {
    name: 'SAHAM',
    short_term: normalizedValue,
    long_term: normalizedValue,
    weight: WEIGHTS.SAHAM,
    short_term_weighted: normalizedValue * WEIGHTS.SAHAM,
    long_term_weighted: normalizedValue * WEIGHTS.SAHAM,
    metadata: {
      raw_pnl: pnl,
      raw_margin: margin,
      raw_return_percentage: returnPct,
      trend: returnPct > 0 ? 'IMPROVING' : returnPct < 0 ? 'DECLINING' : 'STABLE',
      range: RANGES.SAHAM
    }
  };
}

const calculateAndUpdateFinalScore = async () => {
  try {
    const result = await calculateFinalScore();
    if (!result) throw new Error('Failed to calculate final score');
    logger.log('final-score-service', 'Final score updated successfully', 'info');
    logger.log('final-score-service', `New score: ${result.final_score}`, 'debug');
    dataUpdateEmitter.emit('final-score-updated');
    return result;
  } catch (error) {
    logger.log('final-score-service', `Error in auto calculation: ${error.message}`, 'error');
    throw error;
  }
};

setInterval(calculateAndUpdateFinalScore, 5 * 60 * 1000);

module.exports = {
  calculateFinalScore,
  calculateAndUpdateFinalScore,
  getLatestFinalScore: async () => {
    try {
      return await FinalScore.findOne().sort({ timestamp: -1 }).lean();
    } catch (error) {
      logger.log('final-score-service', `Error getting latest score: ${error.message}`, 'error');
      throw error;
    }
  }
};
