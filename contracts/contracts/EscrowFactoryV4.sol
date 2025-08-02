// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./EscrowImplementation.sol";

/**
 * @title EscrowFactoryV4
 * @notice Factory for creating deterministic escrow contracts for 1inch Fusion+ cross-chain swaps
 * Uses CREATE2 to generate the same addresses across different chains
 */
contract EscrowFactoryV4 is Ownable {
    using SafeERC20 for IERC20;
    
    address public immutable escrowImplementation;
    
    mapping(bytes32 => address) public escrows;
    mapping(address => bool) public authorizedResolvers;

    event EscrowCreated(
        bytes32 indexed orderHash,
        address indexed escrow,
        address indexed token,
        uint256 amount,
        bytes32 hashLock,
        uint256 deployedAt
    );

    event ResolverAuthorized(address indexed resolver);
    event ResolverDeauthorized(address indexed resolver);

    modifier onlyAuthorizedResolver() {
        require(authorizedResolvers[msg.sender], "Not authorized resolver");
        _;
    }

    constructor() Ownable(msg.sender) {
        // Deploy the implementation contract
        escrowImplementation = address(new EscrowImplementation());
    }

    /**
     * @notice Authorize a resolver to create escrows
     */
    function authorizeResolver(address resolver) external onlyOwner {
        authorizedResolvers[resolver] = true;
        emit ResolverAuthorized(resolver);
    }

    /**
     * @notice Deauthorize a resolver
     */
    function deauthorizeResolver(address resolver) external onlyOwner {
        authorizedResolvers[resolver] = false;
        emit ResolverDeauthorized(resolver);
    }

    /**
     * @notice Create a new escrow contract using CREATE2 for deterministic addresses
     */
    function createEscrow(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timeLocks,
        address maker,
        address taker
    ) external payable onlyAuthorizedResolver returns (address payable escrow) {
        require(escrows[orderHash] == address(0), "Escrow already exists");

        // Create salt from order parameters for deterministic address
        bytes32 salt = keccak256(abi.encodePacked(
            orderHash,
            token,
            amount,
            hashLock,
            maker,
            taker,
            block.timestamp
        ));

        // Get the init code for the proxy
        bytes memory initCode = getEscrowInitCode();
        
        // Deploy using CREATE2
        escrow = payable(Create2.deploy(0, salt, initCode));
        
        require(escrow != address(0), "Failed to create escrow");

        // Transfer tokens from caller to escrow before initialization
        IERC20(token).safeTransferFrom(msg.sender, escrow, amount);
        
        // Initialize the escrow (no longer needs to transfer tokens)
        EscrowImplementation(escrow).initialize{value: msg.value}(
            orderHash,
            hashLock,
            maker,
            taker,
            token,
            amount,
            msg.value, // safetyDeposit
            timeLocks
        );

        escrows[orderHash] = escrow;

        emit EscrowCreated(orderHash, escrow, token, amount, hashLock, block.timestamp);
    }

    /**
     * @notice Get the init code for creating escrow contracts
     */
    function getEscrowInitCode() public view returns (bytes memory) {
        return abi.encodePacked(
            type(EscrowImplementation).creationCode
        );
    }

    /**
     * @notice Predict the address of an escrow contract
     */
    function predictEscrowAddress(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashLock,
        address maker,
        address taker,
        uint256 timestamp
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(
            orderHash,
            token,
            amount,
            hashLock,
            maker,
            taker,
            timestamp
        ));

        return Create2.computeAddress(salt, keccak256(getEscrowInitCode()));
    }

    /**
     * @notice Get escrow address for an order
     */
    function getEscrow(bytes32 orderHash) external view returns (address) {
        return escrows[orderHash];
    }

    /**
     * @notice Check if an escrow exists for an order
     */
    function escrowExists(bytes32 orderHash) external view returns (bool) {
        return escrows[orderHash] != address(0);
    }

    /**
     * @notice Emergency function to withdraw stuck funds (only owner)
     */
    function emergencyWithdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    // Receive function to accept ETH
    receive() external payable {}
}