require('@nomicfoundation/hardhat-ethers');
require('dotenv').config();

const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1 || "";
const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2 || "";

module.exports = {
  solidity: {
    version: '0.8.23',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1_000_000,
      },
      evmVersion: 'shanghai',
      viaIR: true, // Enable viaIR to fix stack too deep
    },
  },
  networks: {
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2],
      chainId: 11155111
    },
    celo: {
      url: "https://celo-alfajores.drpc.org",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2],
      chainId: 44787
    },
    monad: {
      url: "https://monad-testnet.drpc.org",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2],
      chainId: 10143
    },
    etherlink: {
      url: "https://node.ghostnet.etherlink.com",
      accounts: [PRIVATE_KEY_1, PRIVATE_KEY_2],
      chainId: 128123
    }
  }
};