// SPDX-License-Identifier: UNLICENSED
/**
 * @title WorkContract
 * @notice A contract for managing work agreements, approvals, deadlines, and payments between a client and a worker.
 */
pragma solidity ^0.8.0;


contract WorkContract {
    // NOTE: This contract has more than 15 state variables, which may trigger a linter warning. 
    // This is not a Solidity error, but a style rule. Adjust your linter config if needed.

    /// @notice Address of the client (deployer)
    address payable public client;

    /// @notice Address of the worker
    address payable public worker;

    /// @notice Hourly rate for the work
    uint public hourlyRate;

    /// @notice Number of hours required for the work
    uint public hoursRequired;

    /// @notice Minimum payment guaranteed to the worker
    uint public guaranteedAmount;

    /// @notice Timestamp for ideal completion time
    uint public idealDeadline;

    /// @notice Timestamp for maximum allowed completion time
    uint public maxDeadline;

    /// @notice Whether the client has approved completion
    bool public clientApproved;

    /// @notice Whether the worker has approved completion
    bool public workerApproved;

    /// @notice Whether payment has been released
    bool public paymentReleased;

    /// @notice ETH credited when a direct transfer fails, claimable via withdraw()
    mapping(address => uint) public pendingWithdrawals;

    /// @notice Emitted when payment is released to a party
    event PaymentReleased(address indexed to, uint amount);

    /// @notice Emitted when the guaranteed payment is claimed by the worker
    event GuaranteedClaimed(address indexed worker, uint amount);

    /// @notice Emitted when a refund is issued to the client
    event RefundIssued(address indexed client, uint amount);

    /// @notice Emitted when an approval is made
    event Approval(address indexed approver, bool isClient);

    /// @notice Emitted when a timeout claim is made
    event TimeoutClaim(address indexed claimer, uint amount);

    /// @notice Emitted when a payee withdraws ETH that could not be pushed
    event Withdrawal(address indexed to, uint amount);

    /**
     * @notice Initializes the contract with work parameters
     * @param _worker Address of the worker
     * @param _hourlyRate Hourly rate for the work
     * @param _hoursRequired Number of hours required
     * @param _guaranteedAmount Minimum payment guaranteed to the worker
     * @param _idealDuration Duration in seconds for ideal completion
     * @param _maxDuration Duration in seconds for max completion
     */
    constructor(
        address payable _worker,
        uint _hourlyRate,
        uint _hoursRequired,
        uint _guaranteedAmount,
        uint _idealDuration,
        uint _maxDuration
    ) payable {
        require(_worker != address(0), "Worker address cannot be zero");
        require(_worker != msg.sender, "Worker cannot be client");
        require(_hourlyRate > 0, "Hourly rate must be positive");
        require(_hoursRequired > 0, "Hours required must be positive");
        require(_guaranteedAmount > 0, "Guaranteed amount must be positive");
        require(_idealDuration > 0, "Ideal duration must be positive");
        require(
            _maxDuration >= _idealDuration,
            "Max duration must be >= ideal duration"
        );

        client = payable(msg.sender);
        worker = _worker;
        hourlyRate = _hourlyRate;
        hoursRequired = _hoursRequired;
        guaranteedAmount = _guaranteedAmount;
        idealDeadline = block.timestamp + _idealDuration;
        maxDeadline = block.timestamp + _maxDuration;

        uint requiredAmount = hourlyRate * hoursRequired;
        require(msg.value >= requiredAmount, "Insufficient contract funding");
        require(
            guaranteedAmount <= requiredAmount,
            "Guaranteed exceeds full payment"
        );

        clientApproved = false;
        workerApproved = false;
        paymentReleased = false;
    }

    /**
     * @notice Approve completion by client or worker. Releases payment if both approved.
     * @dev Emits Approval and PaymentReleased events.
     */
    function approveCompletion() public {
        require(
            msg.sender == client || msg.sender == worker,
            "Only client or worker can approve"
        );
        if (msg.sender == client) {
            require(!clientApproved, "Client already approved");
            clientApproved = true;
            emit Approval(msg.sender, true);
        } else if (msg.sender == worker) {
            require(!workerApproved, "Worker already approved");
            workerApproved = true;
            emit Approval(msg.sender, false);
        }
        if (clientApproved && workerApproved && !paymentReleased) {
            paymentReleased = true;
            uint balance = address(this).balance;
            uint payment = hourlyRate * hoursRequired;
            require(balance >= payment, "Insufficient contract balance");
            uint surplus = balance - payment;
            _sendOrCredit(worker, payment);
            emit PaymentReleased(worker, payment);
            if (surplus > 0) {
                _sendOrCredit(client, surplus);
                emit RefundIssued(client, surplus);
            }
        }
    }

    /**
     * @notice Worker claims the guaranteed payment after approving, if the client has not.
     * @dev Emits GuaranteedClaimed and RefundIssued events.
     */
    function claimGuaranteed() public {
        require(
            msg.sender == worker,
            "Only worker can claim guaranteed payment"
        );
        require(workerApproved, "Worker has not approved");
        require(!clientApproved, "Client has already approved");
        require(!paymentReleased, "Payment already released");
        require(
            address(this).balance >= guaranteedAmount,
            "Insufficient contract balance for guaranteed payment"
        );

        paymentReleased = true;

        _sendOrCredit(worker, guaranteedAmount);
        emit GuaranteedClaimed(worker, guaranteedAmount);

        uint refund = address(this).balance;
        if (refund > 0) {
            _sendOrCredit(client, refund);
            emit RefundIssued(client, refund);
        }
    }

    /**
     * @notice Worker claims all funds after maxDeadline if client has not approved.
     * @dev Emits TimeoutClaim event.
     */
    function workerClaimAfterDeadline() public {
        require(msg.sender == worker, "Only worker can claim after deadline");
        require(block.timestamp > maxDeadline, "Deadline not reached");
        require(!paymentReleased, "Payment already released");
        require(!clientApproved, "Client has already approved");
        uint balance = address(this).balance;
        require(balance > 0, "No funds to claim");
        paymentReleased = true;
        _sendOrCredit(worker, balance);
        emit TimeoutClaim(worker, balance);
    }

    /**
     * @notice Client claims all funds after maxDeadline if worker has not approved.
     * @dev Emits TimeoutClaim event.
     */
    function clientClaimAfterDeadline() public {
        require(msg.sender == client, "Only client can claim after deadline");
        require(block.timestamp > maxDeadline, "Deadline not reached");
        require(!paymentReleased, "Payment already released");
        require(!workerApproved, "Worker has already approved");
        uint balance = address(this).balance;
        require(balance > 0, "No funds to claim");
        paymentReleased = true;
        _sendOrCredit(client, balance);
        emit TimeoutClaim(client, balance);
    }

    /**
     * @notice Withdraw ETH that was credited because a direct transfer failed.
     */
    function withdraw() public {
        uint amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "Nothing to withdraw");
        pendingWithdrawals[msg.sender] = 0;
        (bool sent, ) = payable(msg.sender).call{value: amount}("");
        require(sent, "Withdraw failed");
        emit Withdrawal(msg.sender, amount);
    }

    /**
     * @dev Push ETH to `to`. If the recipient rejects it, credit pendingWithdrawals
     * so the rest of the payout can still complete.
     */
    function _sendOrCredit(address payable to, uint amount) internal {
        if (amount == 0) {
            return;
        }
        (bool sent, ) = to.call{value: amount}("");
        if (!sent) {
            pendingWithdrawals[to] += amount;
        }
    }

    /**
     * @notice Returns the contract's ether balance.
     * @return The current contract balance in wei.
     */
    function getContractBalance() public view returns (uint) {
        return address(this).balance;
    }

    /**
     * @notice Returns the approval status of client and worker.
     * @return clientApproved Whether the client has approved
     * @return workerApproved Whether the worker has approved
     */
    function getApprovalStatus() public view returns (bool, bool) {
        return (clientApproved, workerApproved);
    }

    /**
     * @notice Returns whether payment has been released.
     * @return Whether payment has been released
     */
    function isPaymentReleased() public view returns (bool) {
        return paymentReleased;
    }

    /**
     * @notice Returns the ideal and max deadlines.
     * @return idealDeadline The ideal completion deadline
     * @return maxDeadline The maximum allowed completion deadline
     */
    function getDeadlines() public view returns (uint, uint) {
        return (idealDeadline, maxDeadline);
    }
}
