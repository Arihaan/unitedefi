// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LimitOrderProtocolV4
 * @notice Simplified version of 1inch Limit Order Protocol for cross-chain deployment
 * This implements the core functionality needed for Fusion+ cross-chain swaps
 */
contract LimitOrderProtocolV4 is ReentrancyGuard, Ownable {
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

    struct OrderInfo {
        bytes32 orderHash;
        uint256 remaining;
        uint8 status; // 0 = valid, 1 = filled, 2 = cancelled
    }

    mapping(bytes32 => uint256) public remaining;
    mapping(address => uint256) public nonce;
    mapping(bytes32 => bool) public cancelled;

    address public immutable WETH;

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 remaining
    );

    event OrderCancelled(bytes32 indexed orderHash);
    event NonceIncreased(address indexed maker, uint256 newNonce);

    constructor(address _weth) Ownable(msg.sender) {
        WETH = _weth;
    }

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

    function hashOrder(Order calldata order) external pure returns (bytes32) {
        return getOrderHash(order);
    }

    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        bytes calldata interaction,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 skipPermitAndThresholdAmount,
        bytes calldata target
    ) external nonReentrant returns (uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash) {
        orderHash = getOrderHash(order);
        
        require(!cancelled[orderHash], "Order cancelled");
        require(signature.length > 0, "Invalid signature"); // Simplified signature check
        
        uint256 orderRemaining = remaining[orderHash];
        if (orderRemaining == 0) {
            orderRemaining = order.makingAmount;
        }
        
        require(orderRemaining > 0, "Order fully filled");
        require(makingAmount <= orderRemaining, "Making amount too large");
        
        actualMakingAmount = makingAmount;
        actualTakingAmount = takingAmount;
        
        // Update remaining amount
        remaining[orderHash] = orderRemaining - actualMakingAmount;
        
        // Transfer tokens
        IERC20(order.makerAsset).safeTransferFrom(order.maker, msg.sender, actualMakingAmount);
        IERC20(order.takerAsset).safeTransferFrom(msg.sender, order.receiver, actualTakingAmount);
        
        emit OrderFilled(orderHash, order.maker, msg.sender, actualMakingAmount, actualTakingAmount, remaining[orderHash]);
    }

    function cancelOrder(Order calldata order) external {
        bytes32 orderHash = getOrderHash(order);
        require(order.maker == msg.sender, "Not order maker");
        require(!cancelled[orderHash], "Already cancelled");
        
        cancelled[orderHash] = true;
        emit OrderCancelled(orderHash);
    }

    function increaseNonce() external {
        nonce[msg.sender]++;
        emit NonceIncreased(msg.sender, nonce[msg.sender]);
    }

    function advanceNonce(uint8 amount) external {
        nonce[msg.sender] += amount;
        emit NonceIncreased(msg.sender, nonce[msg.sender]);
    }

    function remainingRaw(bytes32 orderHash) external view returns (uint256) {
        return remaining[orderHash];
    }

    function checkPredicate(Order calldata order) external view returns (bool) {
        // Simplified predicate check
        return !cancelled[getOrderHash(order)];
    }
}