const mongoose = require("mongoose");

const countryMetricSchema = new mongoose.Schema({
    countryCode: { type: String, ref: "Country" },
    timestamp: { type: Date, default: Date.now },
    countryScore: { type: Number },
    volume24h: { type: Number },
    indexPrice: { type: Number },
    sentiment: { type: String },
    changePercent: { type: Number },
    trend: { type: String },
    markPrice: { type: Number },
    fundingRate: { type: Number },
    openInterest: { type: Number },
    openTrades: { type: Number },
    volumes: { type: Number },
    fundingCooldown: { type: Number },
    fundingPercent: { type: Number },    liquidationPrice: { type: Number },
    flag: { type: String, required: true },
    news: {
        status: { type: String, default: 'COMING SOON' },
        data: [{ type: mongoose.Schema.Types.Mixed }]
    }
});

countryMetricSchema.index({ countryCode: 1, timestamp: -1 });
module.exports = mongoose.model("CountryMetric", countryMetricSchema);