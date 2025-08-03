const { TronWeb } = require('tronweb');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

const PRIVATE_KEY_1 = process.env.PRIVATE_KEY_1;

// Tron Shasta testnet configuration
const fullHost = "https://api.shasta.trongrid.io";
const tronWeb = new TronWeb({
  fullHost: fullHost,
  privateKey: PRIVATE_KEY_1
});

async function loadContractArtifact(contractName) {
  const artifactPath = path.join(__dirname, '../artifacts/contracts', `${contractName}.sol/${contractName}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return artifact;
}

async function deployEscrowFactory() {
  try {
    console.log("Deploying EscrowFactory to Tron Shasta with increased fee limit...");
    console.log("Using account:", tronWeb.address.fromPrivateKey(PRIVATE_KEY_1));
    
    const artifact = await loadContractArtifact('EscrowFactory');
    const contractInstance = await tronWeb.contract().new({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      feeLimit: 10000_000_000, // 10,000 TRX fee limit
      callValue: 0,
      parameters: []
    });

    const address = contractInstance.address;
    const readableAddress = tronWeb.address.fromHex(address);
    
    console.log(`EscrowFactory deployed successfully!`);
    console.log(`Address: ${readableAddress}`);
    console.log(`Hex Address: ${address}`);
    
    // Update the deployment file
    const deploymentPath = path.join(__dirname, '../deployments/tron.json');
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    
    deployment.contracts.escrowFactory = {
      address: readableAddress,
      hexAddress: address
    };
    
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log(`Updated deployment file: ${deploymentPath}`);
    
    return {
      address: readableAddress,
      hexAddress: address
    };
    
  } catch (error) {
    console.error("EscrowFactory deployment failed:", error);
    throw error;
  }
}

deployEscrowFactory()
  .then((result) => {
    console.log("✅ EscrowFactory deployment successful:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ EscrowFactory deployment failed:", error);
    process.exit(1);
  });