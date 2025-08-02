// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Escrow
 * @notice HTLC escrow contract for cross-chain atomic swaps
 * Implements proper hashlock and timelock functionality as per 1inch Fusion+
 */
contract Escrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public immutable amount;
    bytes32 public immutable hashLock;
    uint32 public immutable deployedAt;
    uint32 public immutable withdrawal;
    uint32 public immutable publicWithdrawal;
    uint32 public immutable cancellation;
    uint32 public immutable publicCancellation;
    address public immutable maker;
    address public immutable taker;
    address public immutable resolver;

    bytes32 public secret;
    bool public withdrawn;
    bool public cancelled;

    event SecretRevealed(bytes32 secret);
    event Withdrawn(address indexed to, uint256 amount);
    event Cancelled(address indexed to, uint256 amount);

    modifier onlyMaker() {
        require(msg.sender == maker, "Not maker");
        _;
    }

    modifier onlyTaker() {
        require(msg.sender == taker, "Not taker");
        _;
    }

    modifier onlyResolver() {
        require(msg.sender == resolver, "Not resolver");
        _;
    }

    constructor(
        address _token,
        uint256 _amount,
        bytes32 _hashLock,
        uint256 _timeLocksData,
        address _maker,
        address _taker,
        address _resolver
    ) {
        token = IERC20(_token);
        amount = _amount;
        hashLock = _hashLock;
        maker = _maker;
        taker = _taker;
        resolver = _resolver;

        // Unpack time locks from uint256
        deployedAt = uint32(_timeLocksData);
        withdrawal = uint32(_timeLocksData >> 32);
        publicWithdrawal = uint32(_timeLocksData >> 64);
        cancellation = uint32(_timeLocksData >> 96);
        publicCancellation = uint32(_timeLocksData >> 128);

        // Note: Tokens will be transferred by the factory after construction
    }

    /**
     * @notice Withdraw tokens by revealing the secret (hashlock)
     * @param _secret The secret that matches the hashlock
     */
    function withdraw(bytes32 _secret) external nonReentrant {
        require(!withdrawn, "Already withdrawn");
        require(!cancelled, "Already cancelled");
        require(keccak256(abi.encodePacked(_secret)) == hashLock, "Invalid secret");

        uint256 currentTime = block.timestamp;
        
        // Check if we're in withdrawal period
        require(
            currentTime >= deployedAt + withdrawal,
            "Not in withdrawal period"
        );

        // Private withdrawal period (only taker)
        if (currentTime < deployedAt + publicWithdrawal) {
            require(msg.sender == taker, "Private withdrawal period");
        }
        // Public withdrawal period (anyone can call)
        else if (currentTime < deployedAt + cancellation) {
            // Anyone can call during public withdrawal
        } else {
            revert("Withdrawal period expired");
        }

        secret = _secret;
        withdrawn = true;

        // Transfer to maker on destination chain or taker on source chain
        address recipient = (msg.sender == taker) ? maker : taker;
        token.safeTransfer(recipient, amount);

        emit SecretRevealed(_secret);
        emit Withdrawn(recipient, amount);
    }

    /**
     * @notice Cancel the escrow and return tokens to maker (timelock)
     */
    function cancel() external nonReentrant {
        require(!withdrawn, "Already withdrawn");
        require(!cancelled, "Already cancelled");

        uint256 currentTime = block.timestamp;

        // Check if we're in cancellation period
        require(
            currentTime >= deployedAt + cancellation,
            "Not in cancellation period"
        );

        // Private cancellation period (only maker)
        if (currentTime < deployedAt + publicCancellation) {
            require(msg.sender == maker, "Private cancellation period");
        }
        // Public cancellation period (anyone can call for maker)

        cancelled = true;
        token.safeTransfer(maker, amount);

        emit Cancelled(maker, amount);
    }

    /**
     * @notice Check if secret has been revealed
     */
    function isSecretRevealed() external view returns (bool) {
        return secret != bytes32(0);
    }

    /**
     * @notice Get the revealed secret
     */
    function getSecret() external view returns (bytes32) {
        require(secret != bytes32(0), "Secret not revealed");
        return secret;
    }

    /**
     * @notice Check current state of the escrow
     */
    function getState() external view returns (string memory) {
        if (withdrawn) return "withdrawn";
        if (cancelled) return "cancelled";
        
        uint256 currentTime = block.timestamp;
        
        if (currentTime < deployedAt + withdrawal) {
            return "finality_lock";
        } else if (currentTime < deployedAt + publicWithdrawal) {
            return "private_withdrawal";
        } else if (currentTime < deployedAt + cancellation) {
            return "public_withdrawal";
        } else if (currentTime < deployedAt + publicCancellation) {
            return "private_cancellation";
        } else {
            return "public_cancellation";
        }
    }
}