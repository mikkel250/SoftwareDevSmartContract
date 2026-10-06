// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MilestoneProject
 * @notice Escrow for one software project between a developer and a client, paid in one asset.
 * The client locks a deposit, which goes to the developer at once, together with milestone 1.
 * Each later milestone is funded only after the previous one is paid. A delivered milestone is
 * paid on acceptance or when its review window ends, and a rejection inside the window returns
 * it to the client and stops the project.
 * @dev `asset` is the zero address for native ETH. Payouts only ever use stored amounts.
 */
contract MilestoneProject {
    using SafeERC20 for IERC20;

    enum ProjectStatus {
        Setup,
        Active,
        Stopped,
        Completed
    }

    enum MilestoneStatus {
        Unfunded,
        Funded,
        Delivered,
        Paid,
        Returned
    }

    struct Milestone {
        uint256 amount;
        uint64 reviewWindow;
        uint64 deliveredAt;
        MilestoneStatus status;
    }

    struct Summary {
        address factory;
        address developer;
        address client;
        address asset;
        uint256 deposit;
        ProjectStatus status;
        uint256 milestoneCount;
        uint256 currentMilestone;
        uint256 termsVersion;
        uint256 confirmedVersion;
    }

    uint256 public constant MAX_MILESTONES = 50;
    uint256 public constant MAX_REVIEW_WINDOW = 365 days;

    address public immutable factory;
    address public immutable developer;
    address public immutable client;
    address public immutable asset;

    uint256 public deposit;
    ProjectStatus public status;
    /// @notice Index of the milestone most recently funded (0 before and after the start lock).
    uint256 public currentMilestone;
    /// @notice Incremented by every edit to the deposit or a milestone.
    uint256 public termsVersion;
    /// @notice The latest terms version the developer has seen. Funding requires it to equal termsVersion.
    uint256 public confirmedVersion;

    Milestone[] private _milestones;

    event DepositEdited(address indexed by, uint256 deposit, uint256 termsVersion);
    event MilestoneEdited(
        uint256 indexed index,
        address indexed by,
        uint256 amount,
        uint256 reviewWindow,
        uint256 termsVersion
    );
    event TermsConfirmed(uint256 termsVersion);
    event ProjectStarted(uint256 deposit, uint256 firstMilestoneAmount);
    event MilestoneFunded(uint256 indexed index, uint256 amount);
    event MilestoneDelivered(uint256 indexed index, uint256 deliveredAt, uint256 reviewEnd);
    event MilestoneAccepted(uint256 indexed index);
    event MilestoneReleased(uint256 indexed index, address indexed caller);
    event MilestoneRejected(uint256 indexed index);
    event ProjectCompleted();
    event PaymentSent(address indexed to, uint256 amount);

    error NotClient();
    error NotDeveloper();
    error NotParty();
    error InvalidDeveloper();
    error InvalidClient();
    error InvalidMilestoneCount();
    error LengthMismatch();
    error InvalidAmount();
    error InvalidWindow();
    error UnknownMilestone();
    error WrongProjectStatus();
    error WrongMilestoneStatus();
    error PreviousNotPaid();
    error TermsChanged();
    error TermsNotConfirmed();
    error StaleVersion();
    error WrongValue();
    error ReviewClosed();
    error ReviewOpen();
    error TransferFailed();

    modifier onlyClient() {
        if (msg.sender != client) revert NotClient();
        _;
    }

    modifier onlyDeveloper() {
        if (msg.sender != developer) revert NotDeveloper();
        _;
    }

    modifier onlyParty() {
        if (msg.sender != client && msg.sender != developer) revert NotParty();
        _;
    }

    /**
     * @param developer_ The party paid for the work.
     * @param client_ The party who funds the project.
     * @param asset_ Zero for native ETH, otherwise the ERC-20 token address.
     * @param deposit_ Start fee paid to the developer on the start lock.
     * @param amounts Milestone amounts in the asset's base units.
     * @param reviewWindows Review window per milestone, in seconds.
     */
    constructor(
        address developer_,
        address client_,
        address asset_,
        uint256 deposit_,
        uint256[] memory amounts,
        uint256[] memory reviewWindows
    ) {
        if (developer_ == address(0)) revert InvalidDeveloper();
        if (client_ == address(0) || client_ == developer_) revert InvalidClient();
        if (amounts.length == 0 || amounts.length > MAX_MILESTONES) revert InvalidMilestoneCount();
        if (amounts.length != reviewWindows.length) revert LengthMismatch();
        if (deposit_ == 0) revert InvalidAmount();

        factory = msg.sender;
        developer = developer_;
        client = client_;
        asset = asset_;
        deposit = deposit_;

        for (uint256 i = 0; i < amounts.length; i++) {
            _checkTerms(amounts[i], reviewWindows[i]);
            _milestones.push(
                Milestone({
                    amount: amounts[i],
                    reviewWindow: uint64(reviewWindows[i]),
                    deliveredAt: 0,
                    status: MilestoneStatus.Unfunded
                })
            );
        }

        termsVersion = 1;
        confirmedVersion = 1;
    }

    // ---------------------------------------------------------------------
    // Terms
    // ---------------------------------------------------------------------

    /// @notice Change the deposit. Allowed for either party before the start lock.
    function editDeposit(uint256 newDeposit) external onlyParty {
        if (status != ProjectStatus.Setup) revert WrongProjectStatus();
        if (newDeposit == 0) revert InvalidAmount();
        deposit = newDeposit;
        emit DepositEdited(msg.sender, newDeposit, _bumpTerms());
    }

    /// @notice Change an unfunded milestone's amount and review window.
    function editMilestone(uint256 index, uint256 amount, uint256 reviewWindow) external onlyParty {
        _requireOpen();
        Milestone storage m = _milestone(index);
        if (m.status != MilestoneStatus.Unfunded) revert WrongMilestoneStatus();
        _checkTerms(amount, reviewWindow);
        m.amount = amount;
        m.reviewWindow = uint64(reviewWindow);
        emit MilestoneEdited(index, msg.sender, amount, reviewWindow, _bumpTerms());
    }

    /// @notice Developer confirms the client's edits, given the version the developer reviewed.
    function confirmTerms(uint256 version) external onlyDeveloper {
        _requireOpen();
        if (version != termsVersion) revert StaleVersion();
        confirmedVersion = version;
        emit TermsConfirmed(version);
    }

    // ---------------------------------------------------------------------
    // Funding
    // ---------------------------------------------------------------------

    /**
     * @notice Client locks the deposit and milestone 1. The deposit goes to the developer now
     * and is never returned.
     * @dev Reverts unless the stored terms equal the values the client saw and the developer
     * has confirmed the current terms version.
     */
    function startLock(
        uint256 expectedDeposit,
        uint256 expectedAmount,
        uint256 expectedWindow
    ) external payable onlyClient {
        if (status != ProjectStatus.Setup) revert WrongProjectStatus();
        Milestone storage m = _milestones[0];
        if (deposit != expectedDeposit) revert TermsChanged();
        _checkExpected(m, expectedAmount, expectedWindow);

        uint256 depositAmount = deposit;
        uint256 firstAmount = m.amount;
        m.status = MilestoneStatus.Funded;
        status = ProjectStatus.Active;

        _pullFromClient(depositAmount + firstAmount);
        emit ProjectStarted(depositAmount, firstAmount);
        emit MilestoneFunded(0, firstAmount);
        _pay(developer, depositAmount);
    }

    /// @notice Client locks the next milestone after the previous one was paid.
    function fundMilestone(
        uint256 index,
        uint256 expectedAmount,
        uint256 expectedWindow
    ) external payable onlyClient {
        if (status != ProjectStatus.Active) revert WrongProjectStatus();
        Milestone storage m = _milestone(index);
        if (index == 0 || m.status != MilestoneStatus.Unfunded) revert WrongMilestoneStatus();
        if (_milestones[index - 1].status != MilestoneStatus.Paid) revert PreviousNotPaid();
        _checkExpected(m, expectedAmount, expectedWindow);

        uint256 amount = m.amount;
        m.status = MilestoneStatus.Funded;
        currentMilestone = index;

        _pullFromClient(amount);
        emit MilestoneFunded(index, amount);
    }

    // ---------------------------------------------------------------------
    // Delivery and review
    // ---------------------------------------------------------------------

    /// @notice Developer marks a funded milestone delivered, which starts its review window.
    function markDelivered(uint256 index) external onlyDeveloper {
        if (status != ProjectStatus.Active) revert WrongProjectStatus();
        Milestone storage m = _milestone(index);
        if (m.status != MilestoneStatus.Funded) revert WrongMilestoneStatus();
        m.status = MilestoneStatus.Delivered;
        m.deliveredAt = uint64(block.timestamp);
        emit MilestoneDelivered(index, block.timestamp, block.timestamp + m.reviewWindow);
    }

    /// @notice Client accepts a delivered milestone before its review window ends.
    function accept(uint256 index) external onlyClient {
        Milestone storage m = _deliveredMilestone(index);
        if (block.timestamp >= _reviewEnd(m)) revert ReviewClosed();
        emit MilestoneAccepted(index);
        _payMilestone(index, m);
    }

    /// @notice Client rejects a delivered milestone before its review window ends. The milestone
    /// returns to the client and the project stops.
    function reject(uint256 index) external onlyClient {
        Milestone storage m = _deliveredMilestone(index);
        if (block.timestamp >= _reviewEnd(m)) revert ReviewClosed();
        m.status = MilestoneStatus.Returned;
        status = ProjectStatus.Stopped;
        emit MilestoneRejected(index);
        _pay(client, m.amount);
    }

    /// @notice Anyone can pay the developer once a delivered milestone's review window has ended.
    function release(uint256 index) external {
        Milestone storage m = _deliveredMilestone(index);
        if (block.timestamp < _reviewEnd(m)) revert ReviewOpen();
        emit MilestoneReleased(index, msg.sender);
        _payMilestone(index, m);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function milestoneCount() external view returns (uint256) {
        return _milestones.length;
    }

    function getMilestone(uint256 index) external view returns (Milestone memory) {
        return _milestone(index);
    }

    function getMilestones() external view returns (Milestone[] memory) {
        return _milestones;
    }

    function getSummary() external view returns (Summary memory) {
        return
            Summary({
                factory: factory,
                developer: developer,
                client: client,
                asset: asset,
                deposit: deposit,
                status: status,
                milestoneCount: _milestones.length,
                currentMilestone: currentMilestone,
                termsVersion: termsVersion,
                confirmedVersion: confirmedVersion
            });
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _milestone(uint256 index) internal view returns (Milestone storage) {
        if (index >= _milestones.length) revert UnknownMilestone();
        return _milestones[index];
    }

    function _deliveredMilestone(uint256 index) internal view returns (Milestone storage m) {
        m = _milestone(index);
        if (m.status != MilestoneStatus.Delivered) revert WrongMilestoneStatus();
    }

    function _reviewEnd(Milestone storage m) internal view returns (uint256) {
        return uint256(m.deliveredAt) + m.reviewWindow;
    }

    function _requireOpen() internal view {
        if (status != ProjectStatus.Setup && status != ProjectStatus.Active) revert WrongProjectStatus();
    }

    function _checkTerms(uint256 amount, uint256 reviewWindow) internal pure {
        if (amount == 0) revert InvalidAmount();
        if (reviewWindow == 0 || reviewWindow > MAX_REVIEW_WINDOW) revert InvalidWindow();
    }

    function _checkExpected(Milestone storage m, uint256 expectedAmount, uint256 expectedWindow) internal view {
        if (m.amount != expectedAmount || m.reviewWindow != expectedWindow) revert TermsChanged();
        if (confirmedVersion != termsVersion) revert TermsNotConfirmed();
    }

    function _bumpTerms() internal returns (uint256 version) {
        version = ++termsVersion;
        if (msg.sender == developer) {
            confirmedVersion = version;
        }
    }

    function _payMilestone(uint256 index, Milestone storage m) internal {
        m.status = MilestoneStatus.Paid;
        if (index == _milestones.length - 1) {
            status = ProjectStatus.Completed;
            emit ProjectCompleted();
        }
        _pay(developer, m.amount);
    }

    function _pullFromClient(uint256 amount) internal {
        if (asset == address(0)) {
            if (msg.value != amount) revert WrongValue();
            return;
        }
        if (msg.value != 0) revert WrongValue();
        IERC20(asset).safeTransferFrom(client, address(this), amount);
    }

    function _pay(address to, uint256 amount) internal {
        if (asset == address(0)) {
            (bool sent, ) = payable(to).call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
        emit PaymentSent(to, amount);
    }
}
