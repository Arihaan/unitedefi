// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./EscrowFactory.sol";

/**
 * @title CrossChainSettlement
 * @notice Settlement contract for cross-chain atomic swaps using HTLC
 * Compatible with 1inch Limit Order Protocol architecture
 */
contract CrossChainSettlement is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct Order {
        address maker;
        address makerAsset;
        address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        address receiver;
        bytes32 salt;
        uint256 makerTraits;
    }

    struct CrossChainData {
        uint256 dstChainId;
        address dstToken;
        bytes32 hashLock;
        uint256 timeLocks;
        uint256 srcSafetyDeposit;
        uint256 dstSafetyDeposit;
    }

    EscrowFactory public immutable escrowFactory;
    
    mapping(bytes32 => bool) public filledOrders;
    mapping(bytes32 => address) public orderEscrows;
    mapping(address => bool) public resolvers;

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint256 makingAmount,
        uint256 takingAmount
    );

    event EscrowDeployed(
        bytes32 indexed orderHash,
        address indexed escrow,
        uint256 chainId
    );

    modifier onlyResolver() {
        require(resolvers[msg.sender], "Not authorized resolver");
        _;
    }

    constructor(address _escrowFactory) Ownable(msg.sender) {
        escrowFactory = EscrowFactory(_escrowFactory);
    }

    function addResolver(address _resolver) external onlyOwner {
        resolvers[_resolver] = true;
        escrowFactory.addResolver(_resolver);
    }

    function removeResolver(address _resolver) external onlyOwner {
        resolvers[_resolver] = false;
        escrowFactory.removeResolver(_resolver);
    }

    /**
     * @notice Fill a cross-chain order by creating escrow
     * @param order The limit order to fill
     * @param crossChainData Cross-chain specific data including hashlock and timelocks
     * @param signature Maker's signature for the order
     * @param makingAmount Amount of maker asset to fill
     * @param takingAmount Amount of taker asset to take
     */
    function fillOrder(
        Order calldata order,
        CrossChainData calldata crossChainData,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount
    ) external onlyResolver nonReentrant {
        bytes32 orderHash = getOrderHash(order);
        
        require(!filledOrders[orderHash], "Order already filled");
        require(makingAmount <= order.makingAmount, "Making amount too large");
        require(takingAmount >= order.takingAmount, "Taking amount too small");

        // Verify order signature (simplified - in production use proper EIP-712)
        require(signature.length > 0, "Invalid signature");

        // Transfer maker asset from maker to this contract
        IERC20(order.makerAsset).safeTransferFrom(order.maker, address(this), makingAmount);

        // Approve escrow factory to spend tokens
        IERC20(order.makerAsset).forceApprove(address(escrowFactory), makingAmount);

        // Create escrow contract
        address escrow = escrowFactory.createEscrow(
            orderHash,
            order.makerAsset,
            makingAmount,
            crossChainData.hashLock,
            crossChainData.timeLocks,
            order.maker,
            msg.sender
        );

        filledOrders[orderHash] = true;
        orderEscrows[orderHash] = escrow;

        emit OrderFilled(orderHash, order.maker, msg.sender, makingAmount, takingAmount);
        emit EscrowDeployed(orderHash, escrow, block.chainid);
    }

    /**
     * @notice Complete cross-chain swap by revealing secret
     * @param orderHash Hash of the order
     * @param secret Secret that matches the hashlock
     */
    function completeSwap(bytes32 orderHash, bytes32 secret) external nonReentrant {
        address escrow = orderEscrows[orderHash];
        require(escrow != address(0), "Escrow not found");

        // Call withdraw on escrow with the secret
        Escrow(escrow).withdraw(secret);
    }

    /**
     * @notice Cancel order and return funds to maker
     * @param orderHash Hash of the order to cancel
     */
    function cancelOrder(bytes32 orderHash) external nonReentrant {
        address escrow = orderEscrows[orderHash];
        require(escrow != address(0), "Escrow not found");

        // Call cancel on escrow
        Escrow(escrow).cancel();
    }

    /**
     * @notice Get order hash (simplified version)
     */
    function getOrderHash(Order calldata order) public pure returns (bytes32) {
        return keccak256(abi.encode(
            order.maker,
            order.makerAsset,
            order.takerAsset,
            order.makingAmount,
            order.takingAmount,
            order.receiver,
            order.salt,
            order.makerTraits
        ));
    }

    /**
     * @notice Get escrow address for an order
     */
    function getEscrow(bytes32 orderHash) external view returns (address) {
        return orderEscrows[orderHash];
    }

    /**
     * @notice Check if order is filled
     */
    function isOrderFilled(bytes32 orderHash) external view returns (bool) {
        return filledOrders[orderHash];
    }

    /**
     * @notice Get secret from escrow if revealed
     */
    function getSecret(bytes32 orderHash) external view returns (bytes32) {
        address escrow = orderEscrows[orderHash];
        require(escrow != address(0), "Escrow not found");
        return Escrow(escrow).getSecret();
    }
}