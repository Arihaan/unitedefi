const { ethers } = require("hardhat");

async function main() {
    console.log("🔧 Fixing Celo Authorization...");
    
    const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
    const factoryAddress = "0xa829F1f93b3845FC893b1DFc591A0A964E953356";
    const settlementAddress = "0x14367b834E7C39fD316730D413bF07c7e7a2E1A9";
    
    const [deployer] = await ethers.getSigners();
    console.log("Using deployer:", deployer.address);
    
    const factory = await ethers.getContractAt("EscrowFactoryV4", factoryAddress);
    const settlement = await ethers.getContractAt("MinimalSettlement", settlementAddress);
    
    // Check current authorization
    console.log("\n📍 Checking Authorization:");  
    const factoryAuth = await factory.authorizedResolvers(resolverAddress);
    const settlementAuth = await settlement.authorizedResolvers(resolverAddress);
    
    console.log(`EscrowFactory authorized: ${factoryAuth}`);
    console.log(`Settlement authorized: ${settlementAuth}`);
    
    if (!factoryAuth) {
        console.log("\nAuthorizing resolver on Celo EscrowFactory...");
        const tx1 = await factory.authorizeResolver(resolverAddress);
        await tx1.wait();
        console.log("✅ Celo EscrowFactory authorized");
    }
    
    if (!settlementAuth) {
        console.log("\nAuthorizing resolver on Celo Settlement...");
        const tx2 = await settlement.authorizeResolver(resolverAddress);
        await tx2.wait();
        console.log("✅ Celo Settlement authorized");
    }
    
    if (factoryAuth && settlementAuth) {
        console.log("\n✅ All contracts already authorized!");
    } else {
        console.log("\n🎉 Authorization complete!");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});