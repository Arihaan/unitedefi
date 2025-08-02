const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Using account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const escrowFactoryAddress = "0x9E12f1D513b90F64dd45dE7bE20983DE6152E870";
  const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
  
  console.log("EscrowFactory:", escrowFactoryAddress);
  console.log("Resolver:", resolverAddress);
  
  // Connect to deployed contract with ABI
  const escrowFactory = await hre.ethers.getContractAt("EscrowFactory", escrowFactoryAddress);
  
  console.log("\n1. Checking owner...");
  try {
    const owner = await escrowFactory.owner();
    console.log("Owner:", owner);
    console.log("Is deployer owner?", owner.toLowerCase() === deployer.address.toLowerCase());
  } catch (error) {
    console.error("Error getting owner:", error.message);
  }
  
  console.log("\n2. Checking resolver authorization...");
  try {
    const isAuthorized = await escrowFactory.resolvers(resolverAddress);
    console.log("Resolver authorized:", isAuthorized);
  } catch (error) {
    console.error("Error checking resolver:", error.message);
  }
  
  console.log("\n3. Checking contract functions...");
  try {
    // Check if the resolver is already authorized by trying to simulate createEscrow
    console.log("Testing createEscrow call as resolver...");
    
    // Try to call createEscrow with the resolver to see what error we get
    const testOrderHash = "0x0000000000000000000000000000000000000000000000000000000000000001";
    const testToken = "0xfC47b0FFACC1ef1c6267f06F2A15cDB23a44c93d"; // USDC
    const testAmount = "1000000"; // 1 USDC
    const testHashLock = "0x0000000000000000000000000000000000000000000000000000000000000002";
    const testTimeLocks = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const testMaker = deployer.address;
    const testTaker = resolverAddress;
    
    // This should fail with "Not authorized resolver" if resolver is not added
    try {
      await escrowFactory.createEscrow.staticCall(
        testOrderHash,
        testToken, 
        testAmount,
        testHashLock,
        testTimeLocks,
        testMaker,
        testTaker,
        { value: hre.ethers.parseEther("0.001") }
      );
      console.log("✅ createEscrow would succeed - resolver is authorized!");
    } catch (createError) {
      console.log("❌ createEscrow failed:", createError.message);
      
      // Now try to add the resolver
      console.log("\n4. Attempting to add resolver...");
      try {
        // Use a manual transaction to avoid any hardhat issues
        const data = escrowFactory.interface.encodeFunctionData("addResolver", [resolverAddress]);
        console.log("Encoded addResolver data:", data);
        
        const tx = await deployer.sendTransaction({
          to: escrowFactoryAddress,
          data: data,
          gasLimit: 100000
        });
        
        console.log("Manual transaction hash:", tx.hash);
        const receipt = await tx.wait();
        console.log("Manual transaction successful! Gas used:", receipt.gasUsed.toString());
        
        // Verify
        const isAuthorizedAfter = await escrowFactory.resolvers(resolverAddress);
        console.log("Resolver authorized after manual add:", isAuthorizedAfter);
        
      } catch (addError) {
        console.error("Manual add resolver failed:", addError.message);
      }
    }
    
  } catch (error) {
    console.error("Error in testing:", error.message);
  }
}

main().catch(console.error);