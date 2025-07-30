// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title StellarFusionEscrow
 * @notice Ethereum side escrow contract for 1inch Fusion+ cross-chain swaps with Stellar
 * @dev Implements Hash Time Locked Contracts (HTLCs) compatible with Stellar timelock contract
 */
contract StellarFusionEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct EscrowDetails {
        address maker;           // Original order maker
        address resolver;        // Resolver handling the swap
        address token;          // Token being escrowed
        uint256 amount;         // Amount being escrowed
        bytes32 hashLock;       // SHA-256 hash of the secret
        uint256 timelock;       // Expiration timestamp
        bool claimed;           // Whether funds have been claimed
        bool refunded;          // Whether funds have been refunded
        uint32 dstChainId;      // Destination chain ID (Stellar)
        bytes32 orderHash;      // Original order hash
    }

    mapping(uint256 => EscrowDetails) public escrows;
    uint256 public escrowCounter;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed maker,
        address indexed resolver,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timelock,
        uint32 dstChainId,
        bytes32 orderHash
    );

    event EscrowClaimed(
        uint256 indexed escrowId,
        address indexed claimant,
        bytes32 secret
    );

    event EscrowRefunded(
        uint256 indexed escrowId,
        address indexed refundee
    );

    error InvalidAmount();
    error InvalidTimelock();
    error InvalidHashLock();
    error EscrowNotFound();
    error EscrowAlreadyClaimed();
    error EscrowAlreadyRefunded();
    error UnauthorizedClaim();
    error UnauthorizedRefund();
    error TimelockNotExpired();
    error TimelockExpired();
    error InvalidSecret();

    /**
     * @notice Create a new escrow for cross-chain swap
     * @param maker Original order maker who will receive funds on destination chain
     * @param token Token contract address to escrow
     * @param amount Amount of tokens to escrow
     * @param hashLock SHA-256 hash of the secret
     * @param timelockDuration Duration in seconds for the timelock
     * @param dstChainId Destination chain ID (Stellar network identifier)
     * @param orderHash Original order hash for tracking
     * @return escrowId The ID of the created escrow
     */
    function createEscrow(
        address maker,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timelockDuration,
        uint32 dstChainId,
        bytes32 orderHash
    ) external nonReentrant returns (uint256 escrowId) {
        if (amount == 0) revert InvalidAmount();
        if (timelockDuration == 0) revert InvalidTimelock();
        if (hashLock == bytes32(0)) revert InvalidHashLock();

        escrowId = ++escrowCounter;
        uint256 timelock = block.timestamp + timelockDuration;

        // Transfer tokens from maker to this contract
        IERC20(token).safeTransferFrom(maker, address(this), amount);

        // Store escrow details
        escrows[escrowId] = EscrowDetails({
            maker: maker,
            resolver: msg.sender, // Resolver creating the escrow
            token: token,
            amount: amount,
            hashLock: hashLock,
            timelock: timelock,
            claimed: false,
            refunded: false,
            dstChainId: dstChainId,
            orderHash: orderHash
        });

        emit EscrowCreated(
            escrowId,
            maker,
            msg.sender,
            token,
            amount,
            hashLock,
            timelock,
            dstChainId,
            orderHash
        );
    }

    /**
     * @notice Claim escrow with the secret
     * @param escrowId The escrow to claim
     * @param secret The secret that hashes to the hashLock
     */
    function claimWithSecret(
        uint256 escrowId,
        bytes32 secret
    ) external nonReentrant {
        EscrowDetails storage escrow = escrows[escrowId];
        
        if (escrow.amount == 0) revert EscrowNotFound();
        if (escrow.claimed) revert EscrowAlreadyClaimed();
        if (escrow.refunded) revert EscrowAlreadyRefunded();
        if (block.timestamp >= escrow.timelock) revert TimelockExpired();
        
        // Verify secret
        bytes32 computedHash = sha256(abi.encodePacked(secret));
        if (computedHash != escrow.hashLock) revert InvalidSecret();

        // Only resolver can claim (they provide liquidity on destination chain)
        if (msg.sender != escrow.resolver) revert UnauthorizedClaim();

        escrow.claimed = true;

        // Transfer tokens to resolver
        IERC20(escrow.token).safeTransfer(escrow.resolver, escrow.amount);

        emit EscrowClaimed(escrowId, msg.sender, secret);
    }

    /**
     * @notice Refund escrow after timelock expires
     * @param escrowId The escrow to refund
     */
    function refundEscrow(uint256 escrowId) external nonReentrant {
        EscrowDetails storage escrow = escrows[escrowId];
        
        if (escrow.amount == 0) revert EscrowNotFound();
        if (escrow.claimed) revert EscrowAlreadyClaimed();
        if (escrow.refunded) revert EscrowAlreadyRefunded();
        if (block.timestamp < escrow.timelock) revert TimelockNotExpired();

        // Only maker can get refund
        if (msg.sender != escrow.maker) revert UnauthorizedRefund();

        escrow.refunded = true;

        // Refund tokens to maker
        IERC20(escrow.token).safeTransfer(escrow.maker, escrow.amount);

        emit EscrowRefunded(escrowId, msg.sender);
    }

    /**
     * @notice Get escrow details
     * @param escrowId The escrow ID
     * @return Escrow details
     */
    function getEscrow(uint256 escrowId) external view returns (EscrowDetails memory) {
        return escrows[escrowId];
    }

    /**
     * @notice Check if escrow is active (not claimed, not refunded, not expired)
     * @param escrowId The escrow ID
     * @return Whether the escrow is active
     */
    function isActiveEscrow(uint256 escrowId) external view returns (bool) {
        EscrowDetails storage escrow = escrows[escrowId];
        return escrow.amount > 0 && 
               !escrow.claimed && 
               !escrow.refunded && 
               block.timestamp < escrow.timelock;
    }

    /**
     * @notice Get the current escrow counter
     * @return The current counter value
     */
    function getEscrowCounter() external view returns (uint256) {
        return escrowCounter;
    }
} 