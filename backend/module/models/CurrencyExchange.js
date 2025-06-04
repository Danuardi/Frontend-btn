const mongoose = require("mongoose");
const { Schema } = mongoose;

const currencyExchangeSchema = new Schema(
  {
    timestamp: { type: Number, required: true },
    source: { type: String, required: true },
    quotes: { type: Object, required: true },
    short: { type: String, required: true }, // Pastikan field ini ada
    long: { type: String, required: true }, // Pastikan field ini ada
    previousRate: { type: String, required: true }, // Menyimpan nilai tukar sebelumnya
  },
  { timestamps: true }
);

module.exports = mongoose.model("CurrencyExchange", currencyExchangeSchema);