const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CrossChainSwap", function () {
  let crossChainSwap;
  let mockToken;
  let owner;
  let user;
  let resolver;

  beforeEach(async function () {
    [owner, user, resolver] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockToken = await MockERC20.deploy("Mock USDC", "USDC", 6);
    await mockToken.waitForDeployment();

    const CrossChainSwap = await ethers.getContractFactory("CrossChainSwap");
    crossChainSwap = await CrossChainSwap.deploy();
    await crossChainSwap.waitForDeployment();

    await crossChainSwap.addResolver(resolver.address);

    await mockToken.mint(user.address, ethers.parseUnits("1000", 6));
    await mockToken.connect(user).approve(await crossChainSwap.getAddress(), ethers.parseUnits("1000", 6));
  });

  describe("Order Creation", function () {
    it("Should create a new order", async function () {
      const secret = ethers.randomBytes(32);
      const hashLock = ethers.keccak256(secret);
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const amount = ethers.parseUnits("100", 6);

      await expect(
        crossChainSwap.connect(user).createOrder(
          await mockToken.getAddress(),
          amount,
          44787, // Celo chain ID
          "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
          hashLock,
          timelock
        )
      ).to.emit(crossChainSwap, "OrderCreated");

      const userBalance = await mockToken.balanceOf(user.address);
      expect(userBalance).to.equal(ethers.parseUnits("900", 6));
    });

    it("Should reject order with zero amount", async function () {
      const secret = ethers.randomBytes(32);
      const hashLock = ethers.keccak256(secret);
      const timelock = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        crossChainSwap.connect(user).createOrder(
          await mockToken.getAddress(),
          0,
          44787,
          "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
          hashLock,
          timelock
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });

    it("Should reject order with short timelock", async function () {
      const secret = ethers.randomBytes(32);
      const hashLock = ethers.keccak256(secret);
      const timelock = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
      const amount = ethers.parseUnits("100", 6);

      await expect(
        crossChainSwap.connect(user).createOrder(
          await mockToken.getAddress(),
          amount,
          44787,
          "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
          hashLock,
          timelock
        )
      ).to.be.revertedWith("Timelock too short");
    });
  });

  describe("Order Completion", function () {
    let orderId;
    let secret;
    let hashLock;

    beforeEach(async function () {
      secret = ethers.randomBytes(32);
      hashLock = ethers.keccak256(secret);
      const timelock = Math.floor(Date.now() / 1000) + 3600;
      const amount = ethers.parseUnits("100", 6);

      const tx = await crossChainSwap.connect(user).createOrder(
        await mockToken.getAddress(),
        amount,
        44787,
        "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
        hashLock,
        timelock
      );

      const receipt = await tx.wait();
      orderId = receipt.logs[2].args[0]; // OrderCreated event
    });

    it("Should complete order with correct secret", async function () {
      await expect(
        crossChainSwap.connect(resolver).completeOrder(orderId, secret)
      ).to.emit(crossChainSwap, "OrderCompleted");

      const order = await crossChainSwap.getOrder(orderId);
      expect(order.completed).to.be.true;
    });

    it("Should reject completion with wrong secret", async function () {
      const wrongSecret = ethers.randomBytes(32);

      await expect(
        crossChainSwap.connect(resolver).completeOrder(orderId, wrongSecret)
      ).to.be.revertedWith("Invalid secret");
    });

    it("Should reject completion by non-resolver", async function () {
      await expect(
        crossChainSwap.connect(user).completeOrder(orderId, secret)
      ).to.be.revertedWith("Not authorized resolver");
    });
  });

  describe("Order Refund", function () {
    let orderId;

    beforeEach(async function () {
      const secret = ethers.randomBytes(32);
      const hashLock = ethers.keccak256(secret);
      const timelock = Math.floor(Date.now() / 1000) + 10; // 10 seconds from now
      const amount = ethers.parseUnits("100", 6);

      const tx = await crossChainSwap.connect(user).createOrder(
        await mockToken.getAddress(),
        amount,
        44787,
        "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
        hashLock,
        timelock
      );

      const receipt = await tx.wait();
      orderId = receipt.logs[2].args[0];
    });

    it("Should allow refund after timelock expires", async function () {
      // Wait for timelock to expire
      await new Promise(resolve => setTimeout(resolve, 11000));

      await expect(
        crossChainSwap.connect(user).refundOrder(orderId)
      ).to.emit(crossChainSwap, "OrderRefunded");

      const userBalance = await mockToken.balanceOf(user.address);
      expect(userBalance).to.equal(ethers.parseUnits("1000", 6));
    });
  });
});

// Mock ERC20 contract for testing
const MockERC20 = {
  deploy: async function(name, symbol, decimals) {
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    return MockERC20Factory.deploy(name, symbol, decimals);
  }
};