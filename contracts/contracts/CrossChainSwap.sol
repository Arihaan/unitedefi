// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CrossChainSwap is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct SwapOrder {
        address user;
        address token;
        uint256 amount;
        uint256 destinationChainId;
        address destinationToken;
        bytes32 hashLock;
        uint256 timelock;
        bool completed;
        bool refunded;
    }

    struct SecretReveal {
        bytes32 orderId;
        bytes32 secret;
        uint256 timestamp;
    }

    mapping(bytes32 => SwapOrder) public orders;
    mapping(bytes32 => SecretReveal) public secrets;
    mapping(address => bool) public resolvers;

    uint256 public constant TIMELOCK_DURATION = 1 hours;
    uint256 public constant MIN_TIMELOCK = 30 minutes;

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed user,
        address token,
        uint256 amount,
        uint256 destinationChainId,
        bytes32 hashLock,
        uint256 timelock
    );

    event OrderCompleted(
        bytes32 indexed orderId,
        bytes32 secret
    );

    event OrderRefunded(
        bytes32 indexed orderId
    );

    event ResolverAdded(address indexed resolver);
    event ResolverRemoved(address indexed resolver);

    modifier onlyResolver() {
        require(resolvers[msg.sender], "Not authorized resolver");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function addResolver(address _resolver) external onlyOwner {
        resolvers[_resolver] = true;
        emit ResolverAdded(_resolver);
    }

    function removeResolver(address _resolver) external onlyOwner {
        resolvers[_resolver] = false;
        emit ResolverRemoved(_resolver);
    }

    function createOrder(
        address _token,
        uint256 _amount,
        uint256 _destinationChainId,
        address _destinationToken,
        bytes32 _hashLock,
        uint256 _timelock
    ) external nonReentrant returns (bytes32 orderId) {
        require(_amount > 0, "Amount must be greater than 0");
        require(_timelock >= block.timestamp + MIN_TIMELOCK, "Timelock too short");
        require(_hashLock != bytes32(0), "Invalid hash lock");

        orderId = keccak256(
            abi.encodePacked(
                msg.sender,
                _token,
                _amount,
                _destinationChainId,
                _hashLock,
                block.timestamp,
                block.number
            )
        );

        require(orders[orderId].user == address(0), "Order already exists");

        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);

        orders[orderId] = SwapOrder({
            user: msg.sender,
            token: _token,
            amount: _amount,
            destinationChainId: _destinationChainId,
            destinationToken: _destinationToken,
            hashLock: _hashLock,
            timelock: _timelock,
            completed: false,
            refunded: false
        });

        emit OrderCreated(
            orderId,
            msg.sender,
            _token,
            _amount,
            _destinationChainId,
            _hashLock,
            _timelock
        );
    }

    function completeOrder(
        bytes32 _orderId,
        bytes32 _secret
    ) external onlyResolver nonReentrant {
        SwapOrder storage order = orders[_orderId];
        require(order.user != address(0), "Order does not exist");
        require(!order.completed, "Order already completed");
        require(!order.refunded, "Order already refunded");
        require(block.timestamp <= order.timelock, "Order expired");
        require(keccak256(abi.encodePacked(_secret)) == order.hashLock, "Invalid secret");

        order.completed = true;
        secrets[_orderId] = SecretReveal({
            orderId: _orderId,
            secret: _secret,
            timestamp: block.timestamp
        });

        emit OrderCompleted(_orderId, _secret);
    }

    function refundOrder(bytes32 _orderId) external nonReentrant {
        SwapOrder storage order = orders[_orderId];
        require(order.user == msg.sender, "Not order owner");
        require(!order.completed, "Order already completed");
        require(!order.refunded, "Order already refunded");
        require(block.timestamp > order.timelock, "Timelock not expired");

        order.refunded = true;
        IERC20(order.token).safeTransfer(order.user, order.amount);

        emit OrderRefunded(_orderId);
    }

    function claimTokens(
        bytes32 _orderId,
        address _to,
        uint256 _amount
    ) external onlyResolver nonReentrant {
        SwapOrder storage order = orders[_orderId];
        require(order.completed, "Order not completed");
        require(_amount <= order.amount, "Amount exceeds order");

        IERC20(order.token).safeTransfer(_to, _amount);
    }

    function getOrder(bytes32 _orderId) external view returns (SwapOrder memory) {
        return orders[_orderId];
    }

    function getSecret(bytes32 _orderId) external view returns (SecretReveal memory) {
        return secrets[_orderId];
    }

    function verifySecret(bytes32 _orderId, bytes32 _secret) external view returns (bool) {
        SwapOrder memory order = orders[_orderId];
        return keccak256(abi.encodePacked(_secret)) == order.hashLock;
    }

    function isOrderExpired(bytes32 _orderId) external view returns (bool) {
        return block.timestamp > orders[_orderId].timelock;
    }

    function emergencyWithdraw(address _token, uint256 _amount) external onlyOwner {
        IERC20(_token).safeTransfer(owner(), _amount);
    }
}