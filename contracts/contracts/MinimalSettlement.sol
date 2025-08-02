// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./LimitOrderProtocolV4.sol";
import "./EscrowFactoryV4.sol";

/**
 * @title MinimalSettlement
 * @notice Minimal settlement contract for 1inch Fusion+ cross-chain functionality
 * Handles the interaction between limit orders and cross-chain escrows
 */
contract MinimalSettlement is Ownable, ReentrancyGuard {
    
    LimitOrderProtocolV4 public immutable limitOrderProtocol;
    EscrowFactoryV4 public immutable escrowFactory;
    
    struct CrossChainOrder {
        bytes32 orderHash;
        address srcToken;
        address dstToken;
        uint256 srcChainId;
        uint256 dstChainId;
        bytes32 hashLock;
        uint256 timeLocks;
        address escrow;
        uint8 status; // 0 = pending, 1 = escrow_created, 2 = completed, 3 = cancelled
    }
    
    mapping(bytes32 => CrossChainOrder) public crossChainOrders;
    mapping(address => bool) public authorizedResolvers;
    
    event CrossChainOrderCreated(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed resolver,
        uint256 srcChainId,
        uint256 dstChainId
    );
    
    event EscrowCreatedForOrder(
        bytes32 indexed orderHash,
        address indexed escrow
    );
    
    event CrossChainOrderCompleted(
        bytes32 indexed orderHash,
        bytes32 secret
    );

    modifier onlyAuthorizedResolver() {
        require(authorizedResolvers[msg.sender], "Not authorized resolver");
        _;
    }

    constructor(address _limitOrderProtocol, address payable _escrowFactory) Ownable(msg.sender) {
        limitOrderProtocol = LimitOrderProtocolV4(_limitOrderProtocol);
        escrowFactory = EscrowFactoryV4(_escrowFactory);
    }

    /**
     * @notice Authorize a resolver
     */
    function authorizeResolver(address resolver) external onlyOwner {
        authorizedResolvers[resolver] = true;
    }

    /**
     * @notice Create cross-chain order and corresponding escrow
     */
    function createCrossChainOrder(
        LimitOrderProtocolV4.Order calldata order,
        bytes calldata signature,
        address dstToken,
        uint256 dstChainId,
        bytes32 hashLock,
        uint256 timeLocks
    ) external payable onlyAuthorizedResolver nonReentrant returns (bytes32 orderHash) {
        
        orderHash = limitOrderProtocol.getOrderHash(order);
        
        require(crossChainOrders[orderHash].orderHash == bytes32(0), "Order already exists");
        
        // Create the cross-chain order record
        crossChainOrders[orderHash] = CrossChainOrder({
            orderHash: orderHash,
            srcToken: order.makerAsset,
            dstToken: dstToken,
            srcChainId: block.chainid,
            dstChainId: dstChainId,
            hashLock: hashLock,
            timeLocks: timeLocks,
            escrow: address(0),
            status: 0
        });
        
        emit CrossChainOrderCreated(orderHash, order.maker, msg.sender, block.chainid, dstChainId);
        
        // Create escrow for this order
        address escrow = escrowFactory.createEscrow{value: msg.value}(
            orderHash,
            order.makerAsset,
            order.makingAmount,
            hashLock,
            timeLocks,
            order.maker,
            msg.sender
        );
        
        crossChainOrders[orderHash].escrow = escrow;
        crossChainOrders[orderHash].status = 1;
        
        emit EscrowCreatedForOrder(orderHash, escrow);
    }

    /**
     * @notice Complete cross-chain order by revealing secret
     */
    function completeCrossChainOrder(
        bytes32 orderHash,
        bytes32 secret
    ) external onlyAuthorizedResolver {
        CrossChainOrder storage order = crossChainOrders[orderHash];
        require(order.orderHash != bytes32(0), "Order not found");
        require(order.status == 1, "Order not ready for completion");
        
        // Verify secret matches hashlock
        require(keccak256(abi.encodePacked(secret)) == order.hashLock, "Invalid secret");
        
        order.status = 2;
        
        emit CrossChainOrderCompleted(orderHash, secret);
    }

    /**
     * @notice Get cross-chain order details
     */
    function getCrossChainOrder(bytes32 orderHash) external view returns (CrossChainOrder memory) {
        return crossChainOrders[orderHash];
    }

    /**
     * @notice Check if order exists
     */
    function orderExists(bytes32 orderHash) external view returns (bool) {
        return crossChainOrders[orderHash].orderHash != bytes32(0);
    }

    /**
     * @notice Get order status
     */
    function getOrderStatus(bytes32 orderHash) external view returns (uint8) {
        return crossChainOrders[orderHash].status;
    }

    /**
     * @notice Emergency withdrawal (owner only)
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Receive function to accept ETH
    receive() external payable {}
}