const { TronWeb } = require('tronweb');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1;
const PRIVATE_KEY_2 = process.env.PRIVATE_KEY_2;

// Tron Shasta testnet configuration
const fullHost = "https://api.shasta.trongrid.io";
const tronWeb = new TronWeb({
  fullHost: fullHost,
  privateKey: PRIVATE_KEY_1
});

// Contract artifacts paths
const artifactsPath = path.join(__dirname, '../artifacts/contracts');

async function loadContractArtifact(contractName) {
  const artifactPath = path.join(artifactsPath, `${contractName}.sol/${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return artifact;
}

async function deployContract(contractName, constructorArgs = []) {
  try {
    console.log(`Deploying ${contractName} to Tron Shasta...`);
    
    const artifact = await loadContractArtifact(contractName);
    const contractInstance = await tronWeb.contract().new({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      feeLimit: 5000_000_000, // Increased from 1B to 5B TRX (5000 TRX)
      callValue: 0,
      parameters: constructorArgs
    });

    const address = contractInstance.address;
    console.log(`${contractName} deployed to:`, tronWeb.address.fromHex(address));
    
    return {
      name: contractName,
      address: tronWeb.address.fromHex(address),
      hexAddress: address,
      abi: artifact.abi
    };
  } catch (error) {
    console.error(`Error deploying ${contractName}:`, error);
    throw error;
  }
}

async function main() {
  console.log("Starting Tron Shasta deployment...");
  console.log("Using account:", tronWeb.address.fromPrivateKey(PRIVATE_KEY_1));
  
  const deployments = {};

  try {
    // Deploy MockERC20 (USDC)
    console.log("\n=== Deploying Mock USDC ===");
    const mockUSDC = await deployContract('MockERC20', [
      "USD Coin",
      "USDC",
      6
    ]);
    deployments.usdc = mockUSDC;

    // Deploy WETH
    console.log("\n=== Deploying WETH ===");
    const weth = await deployContract('WETH');
    deployments.weth = weth;

    // Deploy TrueERC20
    console.log("\n=== Deploying TrueERC20 ===");
    const trueERC20 = await deployContract('TrueERC20');
    deployments.trueERC20 = trueERC20;

    // Deploy LimitOrderProtocolV4
    console.log("\n=== Deploying LimitOrderProtocolV4 ===");
    const limitOrderProtocol = await deployContract('LimitOrderProtocolV4', [
      weth.hexAddress
    ]);
    deployments.limitOrderProtocol = limitOrderProtocol;

    // Deploy MinimalSettlement
    console.log("\n=== Deploying MinimalSettlement ===");
    const settlement = await deployContract('MinimalSettlement', [
      limitOrderProtocol.hexAddress,
      weth.hexAddress
    ]);
    deployments.settlement = settlement;

    // Deploy EscrowFactory
    console.log("\n=== Deploying EscrowFactory ===");
    const escrowFactory = await deployContract('EscrowFactory');
    deployments.escrowFactory = escrowFactory;

    console.log("\n=== Deployment Summary ===");
    Object.entries(deployments).forEach(([key, contract]) => {
      console.log(`${key}: ${contract.address}`);
    });

    // Save deployment info
    const deploymentData = {
      network: "tron-shasta",
      chainId: "2",
      timestamp: new Date().toISOString(),
      deployer: tronWeb.address.fromPrivateKey(PRIVATE_KEY_1),
      contracts: Object.fromEntries(
        Object.entries(deployments).map(([key, contract]) => [
          key,
          {
            address: contract.address,
            hexAddress: contract.hexAddress
          }
        ])
      )
    };

    const outputPath = path.join(__dirname, '../deployments/tron.json');
    fs.writeFileSync(outputPath, JSON.stringify(deploymentData, null, 2));
    console.log(`\nDeployment data saved to: ${outputPath}`);

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });