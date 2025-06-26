// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "../interfaces/IStargateNFT.sol";

/// @title StakeUtility
/// @notice Mock utility contract that interacts with Stargate,
/// receives ERC721 tokens and immediately transfers them to the contract owner
/// @dev This contract is used for testing scenarios where a contract receives an NFT and transfers it to its owner
contract StakeUtility is IERC721Receiver {
    address public owner;
    IStargateNFT public stargateNFT;

    constructor(address _stargateNFT) {
        stargateNFT = IStargateNFT(_stargateNFT);
        owner = msg.sender;
    }

    /// @notice Handles the receipt of an NFT and transfers it to the contract owner
    /// @param tokenId The NFT identifier which is being transferred
    /// @return bytes4 The selector to confirm token transfer
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        // Transfer the received token to the contract owner
        // Use transferFrom instead of safeTransferFrom to avoid reentrancy during minting
        IERC721(msg.sender).transferFrom(address(this), owner, tokenId);

        return this.onERC721Received.selector;
    }

    function stakeAndDelegate(uint8 levelId) external payable {
        stargateNFT.stakeAndDelegate{value: msg.value}(levelId, true);
    }

    function migrateAndDelegate(uint256 legacyNodeId) external payable {
        stargateNFT.migrateAndDelegate{value: msg.value}(legacyNodeId, true);
    }
}
