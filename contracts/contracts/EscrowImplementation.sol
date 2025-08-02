// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EscrowImplementation
 * @notice Implementation contract for 1inch Fusion+ cross-chain escrows
 * This handles the HTLC (Hash Time Lock Contract) logic for atomic swaps
 */
contract EscrowImplementation is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Immutables {
        bytes32 orderHash;
        bytes32 hashLock;
        address maker;
        address taker;
        address token;
        uint256 amount;
        uint256 safetyDeposit;
        uint256 timeLocks; // Packed timelock data
    }

    // Unpacked timelock structure
    struct TimeLocks {
        uint32 deployedAt;
        uint32 withdrawal;
        uint32 publicWithdrawal;
        uint32 cancellation;
        uint32 publicCancellation;
    }

    Immutables public immutables;
    TimeLocks public timeLocks;
    
    bytes32 public revealedSecret;
    bool public withdrawn;
    bool public cancelled;

    event SecretRevealed(bytes32 indexed orderHash, bytes32 secret);
    event Withdrawn(bytes32 indexed orderHash, address indexed to, uint256 amount);
    event Cancelled(bytes32 indexed orderHash, address indexed to, uint256 amount);

    modifier onlyAfterTime(uint256 time) {
        require(block.timestamp >= time, "Too early");
        _;
    }

    modifier onlyBeforeTime(uint256 time) {
        require(block.timestamp < time, "Too late");
        _;
    }

    function initialize(
        bytes32 _orderHash,
        bytes32 _hashLock,
        address _maker,
        address _taker,
        address _token,
        uint256 _amount,
        uint256 _safetyDeposit,
        uint256 _timeLocksData
    ) external payable {
        require(immutables.orderHash == bytes32(0), "Already initialized");
        
        immutables = Immutables({
            orderHash: _orderHash,
            hashLock: _hashLock,
            maker: _maker,
            taker: _taker,
            token: _token,
            amount: _amount,
            safetyDeposit: _safetyDeposit,
            timeLocks: _timeLocksData
        });

        // Unpack timelocks
        timeLocks = TimeLocks({
            deployedAt: uint32(_timeLocksData),
            withdrawal: uint32(_timeLocksData >> 32),
            publicWithdrawal: uint32(_timeLocksData >> 64),
            cancellation: uint32(_timeLocksData >> 96),
            publicCancellation: uint32(_timeLocksData >> 128)
        });

        // Tokens are transferred by the factory before initialization
        // Verify the tokens were transferred correctly
        require(IERC20(_token).balanceOf(address(this)) >= _amount, "Insufficient tokens transferred");
        
        // Safety deposit in ETH
        if (_safetyDeposit > 0) {
            require(msg.value >= _safetyDeposit, "Insufficient safety deposit");
        }
    }

    /**
     * @notice Withdraw funds by revealing the secret
     * @param _secret The preimage that matches the hashlock
     */
    function withdraw(bytes32 _secret) 
        external 
        nonReentrant 
    {
        require(!withdrawn, "Already withdrawn");
        require(!cancelled, "Already cancelled");
        require(keccak256(abi.encodePacked(_secret)) == immutables.hashLock, "Invalid secret");

        // Check if withdrawal period has expired (timelock)
        require(block.timestamp < timeLocks.cancellation, "Withdrawal period expired");

        // Check withdrawal permissions based on time phases
        if (block.timestamp < timeLocks.withdrawal) {
            // Finality lock period - no withdrawals yet (brief waiting period for network finality)
            revert("Still in finality lock period");
        } else if (block.timestamp < timeLocks.publicWithdrawal) {
            // Private withdrawal period - only taker can withdraw
            require(msg.sender == immutables.taker, "Private withdrawal period");
        }
        // After publicWithdrawal time - anyone can withdraw for the intended recipient

        revealedSecret = _secret;
        withdrawn = true;

        // Determine recipient based on who is withdrawing
        address recipient = msg.sender; // The person withdrawing gets the tokens
        
        // Transfer tokens
        IERC20(immutables.token).safeTransfer(recipient, immutables.amount);
        
        // Transfer safety deposit to the withdrawer
        if (immutables.safetyDeposit > 0) {
            payable(msg.sender).transfer(immutables.safetyDeposit);
        }

        emit SecretRevealed(immutables.orderHash, _secret);
        emit Withdrawn(immutables.orderHash, recipient, immutables.amount);
    }

    /**
     * @notice Cancel the escrow and return funds to maker
     */
    function cancel() 
        external 
        nonReentrant 
        onlyAfterTime(timeLocks.cancellation)
    {
        require(!withdrawn, "Already withdrawn");
        require(!cancelled, "Already cancelled");

        // Check cancellation permissions
        if (block.timestamp < timeLocks.publicCancellation) {
            // Private cancellation period - only maker can cancel
            require(msg.sender == immutables.maker, "Private cancellation period");
        }
        // Public cancellation period - anyone can cancel for maker

        cancelled = true;

        // Return tokens to maker
        IERC20(immutables.token).safeTransfer(immutables.maker, immutables.amount);
        
        // Return safety deposit to maker
        if (immutables.safetyDeposit > 0) {
            payable(immutables.maker).transfer(immutables.safetyDeposit);
        }

        emit Cancelled(immutables.orderHash, immutables.maker, immutables.amount);
    }

    /**
     * @notice Get the current state of the escrow
     */
    function getState() external view returns (string memory) {
        if (withdrawn) return "withdrawn";
        if (cancelled) return "cancelled";
        
        uint256 currentTime = block.timestamp;
        
        if (currentTime < timeLocks.withdrawal) {
            return "finality_lock";
        } else if (currentTime < timeLocks.publicWithdrawal) {
            return "private_withdrawal";
        } else if (currentTime < timeLocks.cancellation) {
            return "public_withdrawal";
        } else if (currentTime < timeLocks.publicCancellation) {
            return "private_cancellation";
        } else {
            return "public_cancellation";
        }
    }

    /**
     * @notice Check if secret has been revealed
     */
    function isSecretRevealed() external view returns (bool) {
        return revealedSecret != bytes32(0);
    }

    /**
     * @notice Get the revealed secret
     */
    function getSecret() external view returns (bytes32) {
        require(revealedSecret != bytes32(0), "Secret not revealed");
        return revealedSecret;
    }

    // Receive function to accept ETH for safety deposits
    receive() external payable {}
}