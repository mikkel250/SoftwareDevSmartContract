// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Configurable-decimal ERC-20 with optional blocklist and fee-on-transfer for tests.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;
    address private constant FEE_SINK = address(0xdead);

    mapping(address account => bool) public frozen;
    uint256 public feeBps;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFrozen(address account, bool frozen_) external {
        frozen[account] = frozen_;
    }

    function setFeeBps(uint256 bps) external {
        feeBps = bps;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && frozen[from]) {
            revert("MockERC20: sender frozen");
        }
        if (to != address(0) && frozen[to]) {
            revert("MockERC20: recipient frozen");
        }

        if (from != address(0) && to != address(0) && feeBps > 0) {
            uint256 fee = (value * feeBps) / 10_000;
            uint256 net = value - fee;
            super._update(from, to, net);
            if (fee > 0) {
                super._update(from, FEE_SINK, fee);
            }
            return;
        }

        super._update(from, to, value);
    }
}
