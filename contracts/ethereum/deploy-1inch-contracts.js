const { ethers } = require("hardhat");

// Import the actual 1inch contract artifacts
const LimitOrderProtocolV3Artifact = require("../../Samples/fusion-protocol-master/artifacts-v1/LimitOrderProtocolV3.json");
const SettlementV1Artifact = require("../../Samples/fusion-protocol-master/artifacts-v1/SettlementV1.json");

async function main() {
  console.log("🚀 Deploying 1inch Fusion+ Contracts to Sepolia Testnet");
  
  const [deployer] = await ethers.getSigners();
  console.log("Deployer address:", deployer.address);
  console.log("Deployer balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)));

  // Sepolia testnet configuration
  const WETH_SEPOLIA = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"; // Sepolia WETH
  const ACCESS_TOKEN = "0x0000000000000000000000000000000000000000"; // No access token for demo

  console.log("\n📝 Step 1: Deploy LimitOrderProtocolV3");
  
  // Deploy LimitOrderProtocolV3 (Core 1inch contract)
  const LimitOrderProtocolV3Factory = new ethers.ContractFactory(
    LimitOrderProtocolV3Artifact.abi,
    LimitOrderProtocolV3Artifact.bytecode,
    deployer
  );
  
  const limitOrderProtocol = await LimitOrderProtocolV3Factory.deploy(WETH_SEPOLIA);
  await limitOrderProtocol.waitForDeployment();
  
  const lopAddress = await limitOrderProtocol.getAddress();
  console.log("✅ LimitOrderProtocolV3 deployed to:", lopAddress);

  console.log("\n📝 Step 2: Deploy Settlement Contract (Fusion+ Extension)");
  
  // Deploy Settlement (Fusion+ extension)
  const SettlementFactory = new ethers.ContractFactory(
    SettlementV1Artifact.abi,
    SettlementV1Artifact.bytecode,
    deployer
  );
  
  const settlement = await SettlementFactory.deploy(
    lopAddress,        // limitOrderProtocol
    WETH_SEPOLIA       // token (WETH address)
  );
  await settlement.waitForDeployment();
  
  const settlementAddress = await settlement.getAddress();
  console.log("✅ Settlement contract deployed to:", settlementAddress);

  console.log("\n🎯 Deployment Summary:");
  console.log("==========================================");
  console.log("Network: Sepolia Testnet");
  console.log("LimitOrderProtocolV3:", lopAddress);
  console.log("Settlement (Fusion+):", settlementAddress);
  console.log("WETH:", WETH_SEPOLIA);
  console.log("Deployer:", deployer.address);
  
  console.log("\n📋 Environment Variables for .env:");
  console.log(`ETHEREUM_LIMIT_ORDER_PROTOCOL=${lopAddress}`);
  console.log(`ETHEREUM_SETTLEMENT_CONTRACT=${settlementAddress}`);
  console.log(`ETHEREUM_WETH_ADDRESS=${WETH_SEPOLIA}`);

  // Verify deployment by calling a view function
  try {
    const domainSeparator = await limitOrderProtocol.DOMAIN_SEPARATOR();
    console.log("✅ LimitOrderProtocol verification - Domain Separator:", domainSeparator);
  } catch (error) {
    console.log("❌ LimitOrderProtocol verification failed:", error.message);
  }

  return {
    limitOrderProtocol: lopAddress,
    settlement: settlementAddress,
    weth: WETH_SEPOLIA
  };
}

main()
  .then((contracts) => {
    console.log("\n🎉 1inch Fusion+ contracts deployed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  }); 