const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying CrossChainSwap with account:", deployer.address);
  console.log("Network:", hre.network.name);

  // Deploy CrossChainSwap
  console.log("\nDeploying CrossChainSwap...");
  const CrossChainSwap = await hre.ethers.getContractFactory("CrossChainSwap");
  const crossChainSwap = await CrossChainSwap.deploy();
  await crossChainSwap.waitForDeployment();
  const crossChainSwapAddress = await crossChainSwap.getAddress();
  console.log("CrossChainSwap deployed to:", crossChainSwapAddress);

  // Add resolver
  const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
  console.log("\nAdding resolver:", resolverAddress);
  
  try {
    const tx = await crossChainSwap.addResolver(resolverAddress);
    await tx.wait();
    console.log("Resolver added to CrossChainSwap");
  } catch (error) {
    console.error("Error adding resolver:", error.message);
  }

  console.log("\n=== CrossChainSwap Deployment ===");
  console.log("Address:", crossChainSwapAddress);
  console.log("Network:", hre.network.name);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });