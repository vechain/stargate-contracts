// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../../contracts/interfaces/IStargateNFT.sol";
import "../../contracts/interfaces/IStargateDelegation.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title MaliciousReentrancyContract
/// @notice Contract that attempts various reentrancy attacks during NFT operations
contract MaliciousReentrancyContract is IERC721Receiver {
    IStargateNFT public stargateNFT;
    IStargateDelegation public stargateDelegation;
    IERC20 public vthoToken;

    bool public attackEnabled = false;
    uint256 public attackType = 0;
    uint256 public receivedTokenId;
    address public targetRecipient;
    uint256 public attackCount = 0;
    uint256 public maxAttackAttempts = 2;

    // Track balances during attack
    uint256 public vthoBalanceBeforeAttack;
    uint256 public vthoBalanceAfterAttack;

    constructor(address _stargateNFT, address _stargateDelegation, address _vthoToken) {
        stargateNFT = IStargateNFT(_stargateNFT);
        stargateDelegation = IStargateDelegation(_stargateDelegation);
        vthoToken = IERC20(_vthoToken);
    }

    /// @notice Enable attack mode
    /// @param _attackType Type of attack to perform (1: retransfer, 2: claim rewards, 3: unstake)
    /// @param _targetRecipient Address to transfer to during attack
    function enableAttack(uint256 _attackType, address _targetRecipient) external {
        attackEnabled = true;
        attackType = _attackType;
        targetRecipient = _targetRecipient;
        attackCount = 0;
        vthoBalanceBeforeAttack = vthoToken.balanceOf(address(this));
    }

    function disableAttack() external {
        attackEnabled = false;
        vthoBalanceAfterAttack = vthoToken.balanceOf(address(this));
    }

    /// @notice Called when NFT is received - this is where we attempt reentrancy
    function onERC721Received(
        address,
        address,
        uint256 tokenId,
        bytes calldata
    ) external override returns (bytes4) {
        receivedTokenId = tokenId;

        if (attackEnabled && attackCount < maxAttackAttempts) {
            attackCount++;

            if (attackType == 1) {
                // Attack Type 1: Try to transfer the NFT again during onERC721Received
                try stargateNFT.transferFrom(address(this), targetRecipient, tokenId) {
                    // Attack succeeded
                } catch {
                    // Attack failed
                }
            } else if (attackType == 2) {
                // Attack Type 2: Try to claim rewards during onERC721Received
                try stargateNFT.claimVetGeneratedVtho(tokenId) {
                    // Attack succeeded
                } catch {
                    // Attack failed
                }

                try stargateDelegation.claimRewards(tokenId) {
                    // Attack succeeded
                } catch {
                    // Attack failed
                }
            } else if (attackType == 3) {
                // Attack Type 3: Try to unstake during onERC721Received
                try stargateNFT.unstake(tokenId) {
                    // Attack succeeded
                } catch {
                    // Attack failed
                }
            }
        }

        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice Get current VTHO balance
    function getVthoBalance() external view returns (uint256) {
        return vthoToken.balanceOf(address(this));
    }

    /// @notice Check if we own a specific token
    function ownsToken(uint256 tokenId) external view returns (bool) {
        try stargateNFT.ownerOf(tokenId) returns (address owner) {
            return owner == address(this);
        } catch {
            return false;
        }
    }

    /// @notice Manually claim rewards (for testing)
    function claimRewards(uint256 tokenId) external {
        stargateNFT.claimVetGeneratedVtho(tokenId);
        stargateDelegation.claimRewards(tokenId);
    }

    /// @notice Manually transfer NFT (for testing)
    function transferNFT(address to, uint256 tokenId) external {
        stargateNFT.transferFrom(address(this), to, tokenId);
    }

    /// @notice Check claimable rewards
    function checkClaimableRewards(
        uint256 tokenId
    ) external view returns (uint256 baseRewards, uint256 delegationRewards) {
        baseRewards = stargateNFT.claimableVetGeneratedVtho(tokenId);
        delegationRewards = stargateDelegation.claimableRewards(tokenId);
    }

    /// @notice Receive ETH for staking
    receive() external payable {}

    /// @notice Emergency function to get tokens out
    function emergencyTransfer(uint256 tokenId, address to) external {
        stargateNFT.transferFrom(address(this), to, tokenId);
    }
}
