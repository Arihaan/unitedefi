const { ethers } = require("hardhat");

async function main() {
    console.log("🔄 Redeploying Fixed EscrowImplementation...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    
    // Deploy new EscrowImplementation
    console.log("\n📦 Deploying EscrowImplementation...");
    const EscrowImplementation = await ethers.getContractFactory("EscrowImplementation");
    const escrowImpl = await EscrowImplementation.deploy();
    await escrowImpl.waitForDeployment();
    console.log("✅ EscrowImplementation deployed to:", await escrowImpl.getAddress());
    
    // Deploy new EscrowFactory with the fixed implementation
    console.log("\n📦 Deploying new EscrowFactoryV4...");
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
    
    // Update settlement contract to use new factory
    const settlementAddress = network.name === "sepolia" ? 
        "0xC144D565e799ed813e09d2D43FEC191caC564Ec4" : 
        "0x14367b834E7C39fD316730D413bF07c7e7a2E1A9";
        
    console.log("\n🔄 Updating Settlement contract...");
    const settlement = await ethers.getContractAt("MinimalSettlement", settlementAddress);
    
    // We need to deploy a new settlement since the factory address is immutable
    console.log("📦 Deploying new Settlement with updated factory...");
    const limitOrderAddress = network.name === "sepolia" ?
        "0x7cE1Db8Ca0769aBED8867222f7b9ec808A7565d0" :
        "0x176f5c341F9b1812b866c97677c270F3209d7D8b";
        
    const MinimalSettlement = await ethers.getContractFactory("MinimalSettlement");
    const newSettlement = await MinimalSettlement.deploy(limitOrderAddress, factoryAddress);
    await newSettlement.waitForDeployment();
    const newSettlementAddress = await newSettlement.getAddress();
    console.log("✅ New Settlement deployed to:", newSettlementAddress);
    
    // Authorize resolver on new settlement
    const authSettlementTx = await newSettlement.authorizeResolver(resolverAddress);
    await authSettlementTx.wait();
    console.log("✅ Resolver authorized on new settlement");
    
    console.log("\n📊 Updated Addresses:");
    console.log(`EscrowFactory: ${factoryAddress}`);
    console.log(`Settlement: ${newSettlementAddress}`);
    console.log(`Network: ${network.name}`);
    
    // Save to deployment file
    const fs = require('fs');
    const deploymentFile = `deployments/${network.name}-fixed.json`;
    const deployment = {
        chainId: network.name === "sepolia" ? "11155111" : "44787",
        name: network.name === "sepolia" ? "Ethereum Sepolia" : "Celo Alfajores",
        deployments: {
            escrowFactory: factoryAddress,
            settlement: newSettlementAddress,
            limitOrderProtocol: limitOrderAddress
        },
        resolver: resolverAddress,
        deployedAt: new Date().toISOString(),
        status: "fixed"
    };
    
    fs.writeFileSync(deploymentFile, JSON.stringify(deployment, null, 2));
    console.log(`\n💾 Deployment saved to ${deploymentFile}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});