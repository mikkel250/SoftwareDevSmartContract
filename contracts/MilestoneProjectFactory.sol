// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {MilestoneProject} from "./MilestoneProject.sol";

/**
 * @title MilestoneProjectFactory
 * @notice Creates one MilestoneProject per project and keeps a registry so both parties and the
 * dApp can find them. The asset allowlist is fixed at deployment: native ETH (the zero address)
 * plus the four token addresses given to the constructor. There is no owner and no setter.
 */
contract MilestoneProjectFactory {
    address public immutable wbtc;
    address public immutable usdt;
    address public immutable usdc;
    address public immutable usds;

    /// @notice True only for projects this factory created.
    mapping(address => bool) public isProject;

    mapping(address => address[]) private _projectsOf;

    event ProjectCreated(address indexed project, address indexed developer, address indexed client, address asset);

    error InvalidToken();
    error AssetNotAllowed();

    constructor(address wbtc_, address usdt_, address usdc_, address usds_) {
        address[4] memory tokens = [wbtc_, usdt_, usdc_, usds_];
        for (uint256 i = 0; i < 4; i++) {
            if (tokens[i] == address(0)) revert InvalidToken();
            for (uint256 j = i + 1; j < 4; j++) {
                if (tokens[i] == tokens[j]) revert InvalidToken();
            }
        }
        wbtc = wbtc_;
        usdt = usdt_;
        usdc = usdc_;
        usds = usds_;
    }

    /**
     * @notice Create a project with the caller as developer. The project validates the client,
     * the deposit, and each milestone amount and review window.
     */
    function createProject(
        address client,
        address asset,
        uint256 deposit,
        uint256[] calldata amounts,
        uint256[] calldata reviewWindows
    ) external returns (address project) {
        if (!isAllowedAsset(asset)) revert AssetNotAllowed();
        project = address(new MilestoneProject(msg.sender, client, asset, deposit, amounts, reviewWindows));
        isProject[project] = true;
        _projectsOf[msg.sender].push(project);
        _projectsOf[client].push(project);
        emit ProjectCreated(project, msg.sender, client, asset);
    }

    function isAllowedAsset(address asset) public view returns (bool) {
        return asset == address(0) || asset == wbtc || asset == usdt || asset == usdc || asset == usds;
    }

    /// @notice The five allowed assets in order: ETH (zero address), wBTC, USDT, USDC, USDS.
    function allowedAssets() external view returns (address[5] memory) {
        return [address(0), wbtc, usdt, usdc, usds];
    }

    /// @notice Number of projects where `account` is the developer or the client.
    function projectCount(address account) external view returns (uint256) {
        return _projectsOf[account].length;
    }

    /// @notice A page of `account`'s projects in creation order. An offset past the end returns an empty page.
    function projectsOf(address account, uint256 offset, uint256 limit) external view returns (address[] memory page) {
        address[] storage all = _projectsOf[account];
        if (offset >= all.length) {
            return new address[](0);
        }
        uint256 end = limit > all.length - offset ? all.length : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = all[i];
        }
    }
}
