const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Adding resolver with account:", deployer.address);

  // Connect to deployed EscrowFactory
  const escrowFactoryAddress = "0x9E12f1D513b90F64dd45dE7bE20983DE6152E870";
  const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
  
  const EscrowFactory = await hre.ethers.getContractFactory("EscrowFactory");
  const escrowFactory = EscrowFactory.attach(escrowFactoryAddress);
  
  console.log("Adding resolver:", resolverAddress);
  console.log("To EscrowFactory:", escrowFactoryAddress);
  
  try {
    // First check if already authorized
    const isAlreadyAuthorized = await escrowFactory.resolvers(resolverAddress);
    console.log("Already authorized:", isAlreadyAuthorized);
    
    if (isAlreadyAuthorized) {
      console.log("✅ Resolver is already authorized!");
      return;
    }
    
    const tx = await escrowFactory.addResolver(resolverAddress, {
      gasLimit: 100000
    });
    console.log("Transaction sent:", tx.hash);
    await tx.wait();
    console.log("✅ Resolver added successfully!");
    
    // Verify
    const isAuthorized = await escrowFactory.resolvers(resolverAddress);
    console.log("Resolver authorized:", isAuthorized);
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.data) {
      console.error("Error data:", error.data);
    }
  }
}

main().catch(console.error);