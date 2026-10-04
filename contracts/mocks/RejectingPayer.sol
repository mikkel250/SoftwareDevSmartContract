// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../WorkContract.sol";

/// @notice Test helper that deploys an escrow and rejects incoming ETH.
contract RejectingPayer {
    WorkContract public escrow;

    function deploy(
        address payable worker,
        uint hourlyRate,
        uint hoursRequired,
        uint guaranteedAmount,
        uint idealDuration,
        uint maxDuration
    ) external payable {
        escrow = new WorkContract{value: msg.value}(
            worker,
            hourlyRate,
            hoursRequired,
            guaranteedAmount,
            idealDuration,
            maxDuration
        );
    }

    function approve() external {
        escrow.approveCompletion();
    }

    function claimAfterDeadline() external {
        escrow.clientClaimAfterDeadline();
    }
}
