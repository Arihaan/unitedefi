const { ethers } = require("hardhat");

async function main() {
    console.log("🔧 Fixing Sepolia Settlement Authorization...");
    
    const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
    const settlementAddress = "0xC144D565e799ed813e09d2D43FEC191caC564Ec4";
    
    const [deployer] = await ethers.getSigners();
    console.log("Using deployer:", deployer.address);
    
    const settlement = await ethers.getContractAt("MinimalSettlement", settlementAddress);
    
    // Check current authorization
    const isAuthorized = await settlement.authorizedResolvers(resolverAddress);
    console.log(`Settlement authorized: ${isAuthorized}`);
    
    if (!isAuthorized) {
        console.log("Authorizing resolver on Sepolia Settlement...");
        const tx = await settlement.authorizeResolver(resolverAddress);
        await tx.wait();
        console.log("✅ Sepolia Settlement authorized");
        
        // Verify
        const newAuth = await settlement.authorizedResolvers(resolverAddress);
        console.log(`New authorization status: ${newAuth}`);
    } else {
        console.log("✅ Already authorized!");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});