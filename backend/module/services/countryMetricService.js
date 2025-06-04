const FinalScore = require('../models/FinalScore');
const logger = require('../../bin/helper/logger');
const { COUNTRY_STATUS, COMING_SOON_METRICS } = require('../../bin/constants/countryStatus');
const { generateMetricId } = require('../../bin/helper/idGenerator');
const COUNTRY_DESCRIPTIONS = require('../../bin/constants/countryDescriptions');
const dataUpdateEmitter = require('../../bin/helper/eventEmitter');
const finalScoreService = require('./finalScoreService');

const COUNTRY_DATA = {
    'ID': {
        name: 'Indonesia',
        status: COUNTRY_STATUS.ACTIVE,
        flag: 'https://flagcdn.com/id.svg',
        baseConfig: {
            baseVolume: 1200000,
            basePrice: 850000,
            defaultScore: 75,
            defaultRisk: 'LOW_MEDIUM_RISK'
        }
    },
    'US': {
        name: 'United States',
        status: COUNTRY_STATUS.ACTIVE,
        flag: 'https://flagcdn.com/us.svg',
        baseConfig: {
            baseVolume: 1500000,
            basePrice: 1300000,
            defaultScore: 85,
            defaultRisk: 'LOW_RISK'
        }
    },
    // New Coming Soon Countries
    'DE': {
        name: 'Germany',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/de.svg'
    },
    'JP': {
        name: 'Japan',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/jp.svg'
    },
    'IN': {
        name: 'India',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/in.svg'
    },
    'BR': {
        name: 'Brazil',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/br.svg'
    },
    'GB': {
        name: 'United Kingdom',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/gb.svg'
    },
    'CN': {
        name: 'China',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/cn.svg'
    },
    'AU': {
        name: 'Australia',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/au.svg'
    },
    'MX': {
        name: 'Mexico',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/mx.svg'
    },
    'RU': {
        name: 'Russia',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/ru.svg'
    },
    'KR': {
        name: 'South Korea',
        status: COUNTRY_STATUS.COMING_SOON,
        flag: 'https://flagcdn.com/kr.svg'
    }
};

function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0
    }).format(value);
}

function mapRiskToSentiment(risk) {
    switch(risk) {
        case 'LOW_RISK':
        case 'LOW_MEDIUM_RISK':
            return 'Bullish';
        case 'MEDIUM_HIGH_RISK':
        case 'HIGH_RISK':
            return 'Bearish';
        default:
            return 'Bullish'; // Default to Bullish if risk level is unknown
    }
}

async function calculateMetricsForCountry(finalScore, countryCode) {
    try {
        if (!finalScore) {
            throw new Error('Final score is required');
        }

        const countryData = COUNTRY_DATA[countryCode];
        if (!countryData) {
            throw new Error(`Country ${countryCode} not found in COUNTRY_DATA`);
        }

        const metricId = generateMetricId(countryCode);

        // Handle Coming Soon countries
        if (countryData.status === COUNTRY_STATUS.COMING_SOON) {
            return {
                metricId,
                code: countryCode,
                name: countryData.name,
                flag: countryData.flag,
                status: COUNTRY_STATUS.COMING_SOON,
                ...COMING_SOON_METRICS
            };
        }

        // Handle Active countries
        if (!countryData.baseConfig) {
            throw new Error(`Base configuration missing for country ${countryCode}`);
        }        // Get risk assessment or use default
        const riskLevel = finalScore?.risk_assessment?.overall_risk || countryData.baseConfig?.defaultRisk || 'LOW_RISK';
        
        const countryScore = finalScore?.final_score ? 
            Math.round(finalScore.final_score * 20) : 
            countryData.baseConfig.defaultScore;
            
        const trend = finalScore?.short_term_score >= (finalScore?.long_term_score || 0) ? 'up' : 'down';

        const changePercent = finalScore.long_term_score !== 0 ? 
            ((finalScore.short_term_score - finalScore.long_term_score) / finalScore.long_term_score * 100).toFixed(1) :
            '0.0';

        const volumeMultiplier = countryScore / 1000;
        const volume24h = Math.round(countryData.baseConfig.baseVolume * volumeMultiplier);
        const indexPrice = Math.round(countryData.baseConfig.basePrice * volumeMultiplier);

        return {
            metricId,
            code: countryCode,
            name: countryData.name,
            flag: countryData.flag,
            status: COUNTRY_STATUS.ACTIVE,
            countryScore,
            volume24h: formatCurrency(volume24h),
            indexPrice: formatCurrency(indexPrice),            sentiment: mapRiskToSentiment(riskLevel),
            changePercent: parseFloat(changePercent),
            trend,
            markPrice: formatCurrency(Math.round(countryScore * 500)),
            fundingRate: "0.01%",
            openInterest: formatCurrency(4200000),
            openTrades: 90000,
            volumes: formatCurrency(220000),
            fundingCooldown: "00:35:10",
            fundingPercent: "0.0100%",            liquidationPrice: "4.87M",
            leaderboard: {
                status: 'COMING SOON',
                data: []
            }
        };
    } catch (error) {
        logger.log('country-metric-service', `Error calculating metrics for country ${countryCode}: ${error.message}`, 'error');
        throw error;
    }
}

async function getLatestMetrics() {
    try {
        const latestScore = await FinalScore.findOne()
            .sort({ timestamp: -1 })
            .lean()
            .exec();
        
        if (!latestScore) {
            return [];
        }

        // Get metrics for all countries
        const allCountries = Object.keys(COUNTRY_DATA);
        const allMetrics = await Promise.all(
            allCountries.map(async countryCode => {
                try {
                    return await calculateMetricsForCountry(latestScore, countryCode);
                } catch (error) {
                    logger.log('country-metric-service', `Error calculating metrics for ${countryCode}: ${error.message}`, 'error');
                    return null;
                }
            })
        );

        // Filter out any null values from failed calculations
        const metrics = allMetrics.filter(metric => metric !== null);
        
        logger.log('country-metric-service', `Generated metrics for ${metrics.length} countries`, 'info');
        return metrics;
    } catch (error) {
        logger.log('country-metric-service', `Error getting latest metrics: ${error.message}`, 'error');
        throw error;
    }
}

async function getCountryMetrics(countryCode) {
    try {
        if (!countryCode) {
            throw new Error('Country code is required');
        }

        if (!COUNTRY_DATA[countryCode]) {
            throw new Error(`Country ${countryCode} not supported`);
        }

        const latestScore = await FinalScore.findOne()
            .sort({ timestamp: -1 })
            .lean()
            .exec();

        if (!latestScore) {
            return null;
        }

        return await calculateMetricsForCountry(latestScore, countryCode);
    } catch (error) {
        logger.log('country-metric-service', `Error getting metrics for country ${countryCode}: ${error.message}`, 'error');
        throw error;
    }
}

async function generateAndSaveMetrics() {
    try {
        const metrics = await getLatestMetrics();
        logger.log('country-metric-service', `Generated metrics for ${metrics.length} countries`, 'success');
        return metrics;
    } catch (error) {
        logger.log('country-metric-service', `Error generating metrics: ${error.message}`, 'error');
        throw error;
    }
}

async function getCountryCardMetrics(countryCode) {
    try {
        const metrics = await getCountryMetrics(countryCode);
        
        if (!metrics) {
            return null;
        }        return {
            metricId: metrics.metricId,
            code: metrics.code,
            name: metrics.name,
            flag: metrics.flag,
            countryScore: metrics.countryScore,
            volume24h: metrics.volume24h,
            indexPrice: metrics.indexPrice,
            changePercent: metrics.changePercent,
            sentiment: metrics.sentiment,
            trend: metrics.trend
        };
    } catch (error) {
        logger.log('country-metric-service', `Error getting card metrics for country ${countryCode}: ${error.message}`, 'error');
        throw error;
    }
}

async function getTradeDetailMetrics(countryCode) {
    try {
        const metrics = await getCountryMetrics(countryCode);
        
        if (!metrics) {
            return null;
        }

        const countryDesc = COUNTRY_DESCRIPTIONS[countryCode] || COUNTRY_DESCRIPTIONS.DEFAULT_COMING_SOON;

        return {
            metricId: metrics.metricId,
            code: metrics.code,
            name: metrics.name,
            flag: metrics.flag,
            about: countryDesc.full,
            tradingMetrics: {
                countryScore: metrics.countryScore,
                openTrades: metrics.openTrades,
                volume24h: metrics.volume24h,
                fundingCooldown: metrics.fundingCooldown
            },            marketInfo: {
                indexPrice: metrics.indexPrice,
                markPrice: metrics.markPrice,
                fundingRate: metrics.fundingRate,
                openInterest: metrics.openInterest,
                liquidationPrice: metrics.liquidationPrice
            },
            leaderboard: metrics.leaderboard
        };
    } catch (error) {
        logger.log('country-metric-service', `Error getting trade metrics for country ${countryCode}: ${error.message}`, 'error');
        throw error;
    }
}

async function getAllCardMetrics() {
    try {
        const metrics = [];
        for (const [code, country] of Object.entries(COUNTRY_DATA)) {
            if (country.status === COUNTRY_STATUS.ACTIVE) {
                const cardMetrics = await getCountryCardMetrics(code);
                metrics.push({
                    ...cardMetrics,
                    timestamp: new Date().toISOString()
                });
            } else {                metrics.push({
                    metricId: generateMetricId(code),
                    code,
                    name: country.name,
                    flag: country.flag,                    status: COUNTRY_STATUS.COMING_SOON,
                    ...COMING_SOON_METRICS,
                    sentiment: '',
                    trend: 'down',
                    timestamp: new Date().toISOString()
                });
            }
        }
        return metrics;
    } catch (error) {
        logger.log('country-metric-service', `Error getting all card metrics: ${error.message}`, 'error');
        throw error;
    }
}

async function getAllTradeMetrics() {
    try {
        const metrics = [];
        for (const [code, country] of Object.entries(COUNTRY_DATA)) {
            if (country.status === COUNTRY_STATUS.ACTIVE) {
                const tradeMetrics = await getTradeDetailMetrics(code);
                metrics.push({
                    ...tradeMetrics,
                    timestamp: new Date().toISOString()
                });
            } else {
                metrics.push({
                    metricId: generateMetricId(),
                    code,
                    name: country.name,
                    flag: country.flag,                    status: COUNTRY_STATUS.COMING_SOON,
                    about: COUNTRY_DESCRIPTIONS[code] || COUNTRY_DESCRIPTIONS.DEFAULT_COMING_SOON,
                    ...COMING_SOON_METRICS,
                    leaderboard: {
                        status: 'COMING SOON',
                        data: []
                    },
                    timestamp: new Date().toISOString()
                });
            }
        }
        return metrics;
    } catch (error) {
        logger.log('country-metric-service', `Error getting all trade metrics: ${error.message}`, 'error');
        throw error;
    }
}

// Add event listener for final score updates
dataUpdateEmitter.on('final-score-updated', async () => {
    try {
        const countries = Object.keys(COUNTRY_DATA);
        for (const countryCode of countries) {
            if (COUNTRY_DATA[countryCode].status === COUNTRY_STATUS.ACTIVE) {
                const latestScore = await finalScoreService.getLatestFinalScore();
                await calculateMetricsForCountry(latestScore, countryCode);
            }
        }
        logger.log('country-metric-service', 'Metrics updated after final score change', 'info');
    } catch (error) {
        logger.log('country-metric-service', `Error updating metrics: ${error.message}`, 'error');
    }
});

module.exports = {
    getLatestMetrics,
    getCountryMetrics,
    generateAndSaveMetrics,
    getCountryCardMetrics,
    getTradeDetailMetrics,
    getAllCardMetrics,
    getAllTradeMetrics
};
