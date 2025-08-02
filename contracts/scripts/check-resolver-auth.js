const { ethers } = require("hardhat");

async function main() {
    console.log("🔍 Checking Resolver Authorization...");
    
    const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
    
    // Sepolia contracts
    console.log("\n📍 SEPOLIA:");
    const sepoliaFactory = await ethers.getContractAt("EscrowFactoryV4", "0x9E12f1D513b90F64dd45dE7bE20983DE6152E870");
    const sepoliaSettlement = await ethers.getContractAt("MinimalSettlement", "0xC144D565e799ed813e09d2D43FEC191caC564Ec4");
    
    const sepoliaFactoryAuth = await sepoliaFactory.authorizedResolvers(resolverAddress);
    const sepoliaSettlementAuth = await sepoliaSettlement.authorizedResolvers(resolverAddress);
    
    console.log(`EscrowFactory authorized: ${sepoliaFactoryAuth}`);
    console.log(`Settlement authorized: ${sepoliaSettlementAuth}`);
    
    // Celo contracts  
    console.log("\n📍 CELO:");
    const celoFactory = await ethers.getContractAt("EscrowFactoryV4", "0xa829F1f93b3845FC893b1DFc591A0A964E953356");
    const celoSettlement = await ethers.getContractAt("MinimalSettlement", "0x14367b834E7C39fD316730D413bF07c7e7a2E1A9");
    
    const celoFactoryAuth = await celoFactory.authorizedResolvers(resolverAddress);
    const celoSettlementAuth = await celoSettlement.authorizedResolvers(resolverAddress);
    
    console.log(`EscrowFactory authorized: ${celoFactoryAuth}`);  
    console.log(`Settlement authorized: ${celoSettlementAuth}`);
    
    // Fix authorization if needed
    if (!sepoliaFactoryAuth || !sepoliaSettlementAuth || !celoFactoryAuth || !celoSettlementAuth) {
        console.log("\n🔧 Fixing Authorization...");
        
        const [deployer] = await ethers.getSigners();
        console.log("Using deployer:", deployer.address);
        
        if (!sepoliaFactoryAuth) {
            console.log("Authorizing resolver on Sepolia EscrowFactory...");
            const tx1 = await sepoliaFactory.authorizeResolver(resolverAddress);
            await tx1.wait();
            console.log("✅ Sepolia EscrowFactory authorized");
        }
        
        if (!sepoliaSettlementAuth) {
            console.log("Authorizing resolver on Sepolia Settlement...");
            const tx2 = await sepoliaSettlement.authorizeResolver(resolverAddress);
            await tx2.wait();
            console.log("✅ Sepolia Settlement authorized");
        }
        
        // Switch to Celo network for Celo contracts
        console.log("Switching to Celo network...");
        const celoProvider = new ethers.JsonRpcProvider("https://celo-alfajores.drpc.org");
        const celoWallet = new ethers.Wallet(process.env.PRIVATE_KEY || "5eec436e2ea795bea9fbf4ed97f2868efb183e126a9eeb58a83f75a42e98c7f8", celoProvider);
        
        const celoFactoryWithSigner = celoFactory.connect(celoWallet);
        const celoSettlementWithSigner = celoSettlement.connect(celoWallet);
        
        if (!celoFactoryAuth) {
            console.log("Authorizing resolver on Celo EscrowFactory...");
            const tx3 = await celoFactoryWithSigner.authorizeResolver(resolverAddress);
            await tx3.wait();
            console.log("✅ Celo EscrowFactory authorized");
        }
        
        if (!celoSettlementAuth) {
            console.log("Authorizing resolver on Celo Settlement...");
            const tx4 = await celoSettlementWithSigner.authorizeResolver(resolverAddress);
            await tx4.wait();
            console.log("✅ Celo Settlement authorized");
        }
        
        console.log("\n🎉 All authorizations fixed!");
    } else {
        console.log("\n✅ All contracts are properly authorized!");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});