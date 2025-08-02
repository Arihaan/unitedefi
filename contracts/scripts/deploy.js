const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying 1inch Fusion+ compatible contracts with account:", deployer.address);
  console.log("Network:", hre.network.name);
  console.log("Chain ID:", (await hre.ethers.provider.getNetwork()).chainId);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Deploy EscrowFactory first
  console.log("\nDeploying EscrowFactory...");
  const EscrowFactory = await hre.ethers.getContractFactory("EscrowFactory");
  const escrowFactory = await EscrowFactory.deploy();
  await escrowFactory.waitForDeployment();
  const escrowFactoryAddress = await escrowFactory.getAddress();
  console.log("EscrowFactory deployed to:", escrowFactoryAddress);

  // Deploy CrossChainSettlement
  console.log("\nDeploying CrossChainSettlement...");
  const CrossChainSettlement = await hre.ethers.getContractFactory("CrossChainSettlement");
  const settlement = await CrossChainSettlement.deploy(escrowFactoryAddress);
  await settlement.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  console.log("CrossChainSettlement deployed to:", settlementAddress);

  // Set up resolver
  const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
  console.log("\nAdding resolver:", resolverAddress);
  
  try {
    const tx1 = await escrowFactory.addResolver(resolverAddress);
    await tx1.wait();
    console.log("Resolver added to EscrowFactory");

    const tx2 = await settlement.addResolver(resolverAddress);
    await tx2.wait();
    console.log("Resolver added to Settlement");
  } catch (error) {
    console.error("Error adding resolver:", error.message);
  }

  const chainId = (await hre.ethers.provider.getNetwork()).chainId;
  const networkConfig = {
    [hre.network.name]: {
      chainId: chainId.toString(),
      escrowFactory: escrowFactoryAddress,
      settlement: settlementAddress,
      deployer: deployer.address,
      resolver: resolverAddress
    }
  };

  console.log("\n=== Deployment Summary ===");
  console.log(JSON.stringify(networkConfig, null, 2));
  
  if (hre.network.name === "sepolia") {
    console.log("\n🎉 Ethereum Sepolia deployment completed!");
    console.log("USDC Token:", "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d");
    console.log("\nNext steps:");
    console.log("1. Deploy to Celo: npm run deploy:celo");
    console.log("2. Test cross-chain swaps");
  } else if (hre.network.name === "celo") {
    console.log("\n🎉 Celo Alfajores deployment completed!");
    console.log("USDC Token:", "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B");
    console.log("\nNext steps:");
    console.log("1. Update frontend with contract addresses");
    console.log("2. Start resolver service");
    console.log("3. Test cross-chain swaps");
  }

  // Save deployment info to file
  const fs = require('fs');
  const deploymentFile = `deployments/${hre.network.name}.json`;
  
  try {
    if (!fs.existsSync('deployments')) {
      fs.mkdirSync('deployments');
    }
    fs.writeFileSync(deploymentFile, JSON.stringify(networkConfig[hre.network.name], null, 2));
    console.log(`\nDeployment info saved to ${deploymentFile}`);
  } catch (error) {
    console.log("Could not save deployment file:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });