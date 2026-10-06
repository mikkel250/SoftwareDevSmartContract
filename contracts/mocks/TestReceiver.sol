// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @notice Test client/developer recipient: arbitrary calls, ETH receive modes, reentrancy helper.
contract TestReceiver {
    enum Mode {
        Accept,
        Reject,
        Reenter
    }

    Mode public mode;
    address public reentryTarget;
    bytes public reentryData;

    function setMode(Mode mode_) external {
        mode = mode_;
    }

    function setReentry(address target, bytes calldata data) external {
        reentryTarget = target;
        reentryData = data;
    }

    function execute(
        address target,
        uint256 value,
        bytes calldata data
    ) external payable returns (bytes memory) {
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        if (!success) {
            _bubbleRevert(returndata);
        }
        return returndata;
    }

    receive() external payable {
        if (mode == Mode.Reject) {
            revert("rejecting");
        }
        if (mode == Mode.Reenter) {
            (bool success, bytes memory returndata) = reentryTarget.call(reentryData);
            if (!success) {
                _bubbleRevert(returndata);
            }
        }
    }

    function _bubbleRevert(bytes memory returndata) internal pure {
        if (returndata.length > 0) {
            assembly {
                revert(add(returndata, 32), mload(returndata))
            }
        }
        revert("TestReceiver: call failed");
    }
}
