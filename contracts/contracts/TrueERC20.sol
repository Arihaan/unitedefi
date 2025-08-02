// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title TrueERC20
 * @dev Placeholder token for cross-chain orders in 1inch Fusion+
 * This represents the "true" token on the destination chain
 * Address: 0xda0000d4000015a526378bb6fafc650cea5966f8 on all chains
 */
contract TrueERC20 is ERC20 {
    constructor() ERC20("TrueERC20", "TRUE") {
        // This is a placeholder token, no minting needed
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}