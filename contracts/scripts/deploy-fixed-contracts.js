const { ethers } = require("hardhat");

async function main() {
    console.log("🔧 Deploying Fixed Contracts");
    console.log("Network:", network.name);
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Deploy new EscrowFactoryV4 with fixed token transfer logic
    console.log("\n📦 Deploying fixed EscrowFactoryV4...");
    const EscrowFactoryV4 = await ethers.getContractFactory("EscrowFactoryV4");
    const escrowFactory = await EscrowFactoryV4.deploy();
    await escrowFactory.waitForDeployment();
    const factoryAddress = await escrowFactory.getAddress();
    console.log("✅ EscrowFactoryV4 deployed to:", factoryAddress);
    
    // Authorize the resolver
    const resolverAddress = "0x917999645773E99d03d44817B7318861F018Cb74";
    console.log("\n🔐 Authorizing resolver...");
    const authTx = await escrowFactory.authorizeResolver(resolverAddress);
    await authTx.wait();
    console.log("✅ Resolver authorized");
    
    console.log(`\n🎉 Fixed contracts deployed successfully!`);
    console.log(`📝 New EscrowFactory: ${factoryAddress}`);
    console.log(`🔗 Network: ${network.name}`);
    
    // Save deployment info
    const fs = require('fs');
    const deployment = {
        network: network.name,
        chainId: network.name === "sepolia" ? "11155111" : "44787",
        escrowFactory: factoryAddress,
        resolver: resolverAddress,
        deployedAt: new Date().toISOString(),
        status: "fixed"
    };
    
    fs.writeFileSync(`deployments/${network.name}-fixed.json`, JSON.stringify(deployment, null, 2));
    console.log(`💾 Deployment info saved to deployments/${network.name}-fixed.json`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});