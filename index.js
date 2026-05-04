
```javascript
import Anthropic from "@anthropic-ai/sdk";
import https from "https";

const client = new Anthropic();

// Store for monitoring state
const monitoringState = {
  isMonitoring: false,
  alerts: [],
  watchedCryptos: {},
  priceHistory: {},
};

// Tool definitions for Claude
const tools = [
  {
    name: "fetch_crypto_price",
    description:
      "Fetch current price of a cryptocurrency from CoinGecko API",
    input_schema: {
      type: "object",
      properties: {
        crypto_id: {
          type: "string",
          description:
            "The cryptocurrency ID (e.g., 'bitcoin', 'ethereum', 'cardano')",
        },
      },
      required: ["crypto_id"],
    },
  },
  {
    name: "set_price_alert",
    description: "Set a price alert for a cryptocurrency",
    input_schema: {
      type: "object",
      properties: {
        crypto_id: {
          type: "string",
          description: "The cryptocurrency ID",
        },
        condition: {
          type: "string",
          enum: ["above", "below"],
          description: "Alert when price goes above or below the threshold",
        },
        threshold_price: {
          type: "number",
          description: "The price threshold in USD",
        },
      },
      required: ["crypto_id", "condition", "threshold_price"],
    },
  },
  {
    name: "get_price_history",
    description: "Get price history for a cryptocurrency",
    input_schema: {
      type: "object",
      properties: {
        crypto_id: {
          type: "string",
          description: "The cryptocurrency ID",
        },
        days: {
          type: "number",
          description: "Number of days of history to fetch (default: 7)",
        },
      },
      required: ["crypto_id"],
    },
  },
  {
    name: "start_monitoring",
    description: "Start monitoring selected cryptocurrencies for price changes",
    input_schema: {
      type: "object",
      properties: {
        crypto_ids: {
          type: "array",
          items: { type: "string" },
          description: "List of cryptocurrency IDs to monitor",
        },
        check_interval_minutes: {
          type: "number",
          description: "How often to check prices in minutes (default: 5)",
        },
      },
      required: ["crypto_ids"],
    },
  },
  {
    name: "stop_monitoring",
    description: "Stop monitoring cryptocurrencies",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Helper function to fetch prices from CoinGecko API
function fetchCryptoPrice(cryptoId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true`;

    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const priceData = parsed[cryptoId];
            if (priceData) {
              resolve({
                crypto_id: cryptoId,
                price: priceData.usd,
                market_cap: priceData.usd_market_cap,
                volume_24h: priceData.usd_24h_vol,
                timestamp: new Date().toISOString(),
              });
            } else {
              reject(
                new Error(
                  `Cryptocurrency ${cryptoId} not found. Try: bitcoin, ethereum, cardano, solana, polkadot`
                )
              );
            }
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// Helper function to fetch price history
function fetchPriceHistory(cryptoId, days = 7) {
  return new Promise((resolve, reject) => {
    const url = `https://api.coingecko.com/api/v3/coins/${cryptoId}/market_chart?vs_currency=usd&days=${days}`;

    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const prices = parsed.prices;
            const summary = {
              crypto_id: cryptoId,
              days: days,
              prices: prices.slice(-5).map(([timestamp, price]) => ({
                date: new Date(timestamp).toISOString(),
                price: price.toFixed(2),
              })),
              high: Math.max(...prices.map((p) => p[1])).toFixed(2),
              low: Math.min(...prices.map((p) => p[1])).toFixed(2),
              current: prices[prices.length - 1][1].toFixed(2),
            };
            resolve(summary);
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// Process tool calls
async function processTool(toolName, toolInput) {
  switch (toolName) {
    case "fetch_crypto_price": {
      const result = await fetchCryptoPrice(toolInput.crypto_id);
      return JSON.stringify(result);
    }

    case "set_price_alert": {
      const alertId = `alert_${Date.now()}`;
      const alert = {
        id: alert