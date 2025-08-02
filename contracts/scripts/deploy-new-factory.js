const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying new EscrowFactory with account:", deployer.address);
  console.log("Network:", hre.network.name);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // Deploy new EscrowFactory without resolver restriction
  console.log("\nDeploying new EscrowFactory...");
  const EscrowFactory = await hre.ethers.getContractFactory("EscrowFactory");
  const escrowFactory = await EscrowFactory.deploy();
  await escrowFactory.waitForDeployment();
  const escrowFactoryAddress = await escrowFactory.getAddress();
  console.log("New EscrowFactory deployed to:", escrowFactoryAddress);

  console.log("\n=== New Deployment Summary ===");
  console.log("Network:", hre.network.name);
  console.log("New EscrowFactory:", escrowFactoryAddress);
  console.log("Deployer:", deployer.address);
  
  console.log("\nUpdate resolver config with new address:", escrowFactoryAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });