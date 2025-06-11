const COUNTRY_STATUS = {
    ACTIVE: 'ACTIVE',
    COMING_SOON: 'COMING SOON'
};

const CARD_METRICS = {
    metricId: '',
    code: '',
    name: '',
    flag: '',
    countryScore: 'COMING SOON',
    volume24h: 'COMING SOON',
    indexPrice: 'COMING SOON',
    changePercent: '0.0',    sentiment: 'Bearish',
    trend: 'down'
};

const TRADE_METRICS = {
    metricId: '',
    code: '',
    name: '',
    flag: '',
    about: '',
    tradingMetrics: {
        countryScore: 'COMING SOON',
        openTrades: 'COMING SOON',
        volume24h: 'COMING SOON',
        fundingCooldown: 'COMING SOON'
    },
    leaderboard: {
        status: 'COMING SOON',
        data: []
    },    news: {
        status: 'COMING SOON',
        data: []
    },
    marketInfo: {
        indexPrice: 'COMING SOON',
        trend: 'down',
        markPrice: 'COMING SOON',
        fundingRate: 'COMING SOON',
        openInterest: 'COMING SOON',
        liquidationPrice: 'COMING SOON'
    }
};

module.exports = { 
    COUNTRY_STATUS, 
    CARD_METRICS, 
    TRADE_METRICS 
};
