//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IProtocolParams {
    /**
     * @dev set sets the value for a given key.
     */
    function set(bytes32 _key, uint256 _value) external;

    /**
     * @dev get returns the value for a given key.
     */
    function get(bytes32 _key) external view returns (uint256);
}
