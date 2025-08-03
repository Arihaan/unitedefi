require('dotenv').config();

const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1 || "";
const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2 || "";

module.exports = {
  networks: {
    development: {
      privateKey: PRIVATE_KEY_1,
      userFeePercentage: 100,
      feeLimit: 1000 * 1e6,
      fullHost: "https://api.shasta.trongrid.io",
      network_id: "2"
    },
    shasta: {
      privateKey: PRIVATE_KEY_1,
      userFeePercentage: 100,
      feeLimit: 1000 * 1e6,
      fullHost: "https://api.shasta.trongrid.io",
      network_id: "2"
    }
  },
  compilers: {
    solc: {
      version: "0.8.23",
      settings: {
        optimizer: {
          enabled: true,
          runs: 1000000
        },
        evmVersion: "shanghai"
      }
    }
  }
};