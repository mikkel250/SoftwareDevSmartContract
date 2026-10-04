// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../WorkContract.sol";

/// @notice Test worker that rejects pushed ETH until payments are accepted.
contract RejectingWorker {
    bool public rejectPayments = true;

    receive() external payable {
        require(!rejectPayments, "rejecting");
    }

    function acceptPayments() external {
        rejectPayments = false;
    }

    function approve(WorkContract escrow) external {
        escrow.approveCompletion();
    }

    function claimGuaranteed(WorkContract escrow) external {
        escrow.claimGuaranteed();
    }

    function claimAfterDeadline(WorkContract escrow) external {
        escrow.workerClaimAfterDeadline();
    }

    function withdraw(WorkContract escrow) external {
        escrow.withdraw();
    }
}
