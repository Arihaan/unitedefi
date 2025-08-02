// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Escrow.sol";

/**
 * @title EscrowFactory
 * @notice Factory contract for creating cross-chain escrow contracts
 * Based on 1inch Fusion+ architecture
 */
contract EscrowFactory is Ownable {
    event EscrowCreated(
        bytes32 indexed orderHash,
        address indexed escrow,
        address indexed token,
        uint256 amount,
        bytes32 hashLock,
        uint256 deployedAt
    );

    mapping(bytes32 => address) public escrows;
    mapping(address => bool) public resolvers;

    modifier onlyResolver() {
        require(resolvers[msg.sender], "Not authorized resolver");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function addResolver(address _resolver) external onlyOwner {
        resolvers[_resolver] = true;
    }

    function removeResolver(address _resolver) external onlyOwner {
        resolvers[_resolver] = false;
    }

    /**
     * @notice Creates a new escrow contract for cross-chain atomic swap
     * @param orderHash Hash of the cross-chain order
     * @param token Token address to be escrowed
     * @param amount Amount to be escrowed
     * @param hashLock Hash lock for the atomic swap
     * @param timeLocks Packed time lock data
     * @param maker Original maker of the order
     * @param taker Taker who filled the order
     * @return escrowAddress Address of the created escrow contract
     */
    function createEscrow(
        bytes32 orderHash,
        address token,
        uint256 amount,
        bytes32 hashLock,
        uint256 timeLocks,
        address maker,
        address taker
    ) external payable returns (address escrowAddress) {
        require(escrows[orderHash] == address(0), "Escrow already exists");

        bytes memory bytecode = abi.encodePacked(
            type(Escrow).creationCode,
            abi.encode(
                token,
                amount,
                hashLock,
                timeLocks,
                maker,
                taker,
                msg.sender
            )
        );

        bytes32 salt = keccak256(abi.encodePacked(orderHash, block.timestamp));
        
        assembly {
            escrowAddress := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }

        require(escrowAddress != address(0), "Failed to create escrow");

        // Transfer tokens from resolver to the newly created escrow
        IERC20(token).transferFrom(msg.sender, escrowAddress, amount);

        escrows[orderHash] = escrowAddress;

        emit EscrowCreated(
            orderHash,
            escrowAddress,
            token,
            amount,
            hashLock,
            block.timestamp
        );
    }

    function getEscrow(bytes32 orderHash) external view returns (address) {
        return escrows[orderHash];
    }
}