// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IStargateNFT } from "../../contracts/interfaces/IStargateNFT.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { ERC721Enumerable } from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import { IERC165 } from "@openzeppelin/contracts/interfaces/IERC165.sol";
import { DataTypes } from "../../contracts/StargateNFT/libraries/DataTypes.sol";
import { ITokenAuction } from "../../contracts/interfaces/ITokenAuction.sol";

contract StargateNFTMock is IERC165, ERC721, ERC721Enumerable, IStargateNFT {
    DataTypes.Level private _level;
    DataTypes.Token private _token;
    ITokenAuction private _legacyNodes;
    bool private _isUnderMaturityPeriod;
    uint256 private _lastTokenId = 10000;
    uint256 private _boostPricePerBlock;

    constructor() ERC721("StargateNFTMock", "STGNFT") ERC721Enumerable() {}

    function helper__setLevel(DataTypes.Level memory level) external {
        _level = level;
    }

    function helper__setBoostPricePerBlock(uint256 boostPricePerBlock) external {
        _boostPricePerBlock = boostPricePerBlock;
    }

    function helper__setToken(DataTypes.Token memory token) external {
        _token = token;
    }

    function helper__setIsUnderMaturityPeriod(bool isUnderMaturityPeriod) external {
        _isUnderMaturityPeriod = isUnderMaturityPeriod;
    }

    function helper__setLegacyNodes(ITokenAuction newLegacyNodes) external {
        _legacyNodes = newLegacyNodes;
    }

    function REWARD_MULTIPLIER_SCALING_FACTOR() external pure returns (uint256) {
        return 100;
    }

    function version() external pure returns (uint256) {
        return 0;
    }

    // ---------- Callbacks ---------- //

    function _safeMintCallback(address, uint256) external {}

    function _burnCallback(uint256) external {}

    // ---------- Pausing Functions ---------- //

    function pause() external {}

    function unpause() external {}

    // ---------- Level Functions ---------- //

    function addLevel(DataTypes.LevelAndSupply memory) external {}

    function getLevelIds() external pure returns (uint8[] memory) {
        return new uint8[](0);
    }

    function getLevel(uint8 levelId) external view returns (DataTypes.Level memory) {
        return
            DataTypes.Level({
                id: levelId,
                name: _level.name,
                isX: _level.isX,
                maturityBlocks: _level.maturityBlocks,
                scaledRewardFactor: _level.scaledRewardFactor,
                vetAmountRequiredToStake: _level.vetAmountRequiredToStake
            });
    }

    function getLevels() external pure returns (DataTypes.Level[] memory) {
        return new DataTypes.Level[](0);
    }

    function getLevelsCirculatingSupplies() external pure returns (uint208[] memory) {
        return new uint208[](0);
    }

    function getLevelSupply(uint8) external pure returns (uint208 circulating, uint32 cap) {
        return (0, 0);
    }

    function getCirculatingSupplyAtBlock(uint8, uint48) external pure returns (uint208) {
        return 0;
    }

    function getLevelsCirculatingSuppliesAtBlock(uint48) external pure returns (uint208[] memory) {
        return new uint208[](0);
    }

    // ---------- Token Functions ---------- //

    function getCurrentTokenId() external view returns (uint256) {
        return _lastTokenId;
    }

    function getToken(uint256 tokenId) external view returns (DataTypes.Token memory) {
        return
            DataTypes.Token({
                tokenId: tokenId,
                levelId: _token.levelId,
                mintedAtBlock: uint64(block.number),
                vetAmountStaked: _token.vetAmountStaked,
                lastVetGeneratedVthoClaimTimestamp_deprecated: _token
                    .lastVetGeneratedVthoClaimTimestamp_deprecated
            });
    }

    function getTokenLevel(uint256) external pure returns (uint8) {
        return 0;
    }

    function tokensOwnedBy(address) external pure returns (DataTypes.Token[] memory) {
        return new DataTypes.Token[](0);
    }

    function ownerTotalVetStaked(address) external pure returns (uint256) {
        return 0;
    }

    function idsOwnedBy(address) external pure returns (uint256[] memory) {
        return new uint256[](0);
    }

    function tokenExists(uint256) external pure returns (bool) {
        return false;
    }

    // ---------- Boosting Functions ---------- //

    function boost(uint256) external {}

    function boostAmount(uint256) external pure returns (uint256) {
        return 0;
    }

    function boostAmountOfLevel(uint8) external pure returns (uint256) {
        return 0;
    }

    function boostPricePerBlock(uint8) external view returns (uint256) {
        return _boostPricePerBlock;
    }

    function maturityPeriodEndBlock(uint256) external pure returns (uint64) {
        return 0;
    }

    function isUnderMaturityPeriod(uint256) external view returns (bool) {
        return _isUnderMaturityPeriod;
    }

    // ---------- Token Manager Functions ---------- //

    function addTokenManager(address, uint256) external {}

    function removeTokenManager(uint256) external {}

    function getTokenManager(uint256) external pure returns (address) {
        return address(0);
    }

    function idsManagedBy(address) external pure returns (uint256[] memory) {
        return new uint256[](0);
    }

    function tokensManagedBy(address) external pure returns (DataTypes.Token[] memory) {
        return new DataTypes.Token[](0);
    }

    function isTokenManager(address, uint256) external pure returns (bool) {
        return false;
    }

    function isManagedByOwner(uint256) external pure returns (bool) {
        return false;
    }

    function tokensOverview(address) external pure returns (DataTypes.TokenOverview[] memory) {
        return new DataTypes.TokenOverview[](0);
    }

    // ---------- Base URI Functions ---------- //

    function setBaseURI(string memory) external {}

    function baseURI() external pure returns (string memory) {
        return "";
    }

    // ---------- Stargate functions ---------- //

    function mint(uint8, address to) external returns (uint256 tokenId) {
        _lastTokenId++;
        _safeMint(to, _lastTokenId);
        return _lastTokenId;
    }

    function burn(uint256) external {
        _burn(_lastTokenId);
    }

    function migrate(uint256 tokenId) external {
        (address owner, , , , , , ) = _legacyNodes.getMetadata(tokenId);
        _safeMint(owner, tokenId);
    }

    function boostOnBehalfOf(address, uint256) external {
        _isUnderMaturityPeriod = false;
    }

    function getStargate() external pure returns (address) {}

    // ---------- Clock Functions ---------- //

    function clock() external view returns (uint48) {
        return uint48(block.number);
    }

    function CLOCK_MODE() external pure returns (string memory) {
        return "";
    }

    function timestamp() external view returns (uint48) {
        return uint48(block.timestamp);
    }

    // ---------- VTHO Functions ---------- //

    function getVthoTokenAddress() external pure returns (address) {
        return address(0);
    }

    // ---------- Legacy Nodes Functions ---------- //

    function xTokensCount() external pure returns (uint208) {
        return 0;
    }

    function ownsXToken(address) external pure returns (bool) {
        return false;
    }

    function isXToken(uint256) external view returns (bool) {
        return _level.isX;
    }

    function legacyNodes() external view returns (ITokenAuction) {
        return _legacyNodes;
    }

    // ---------- Temporary Functions ---------- //

    function transferBalance(uint256) external {}

    function migrateTokenManager(uint256, address) external {}

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable, IERC165) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // ---------- Override Functions ---------- //

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721, ERC721Enumerable) {
        super._increaseBalance(account, value);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override(ERC721, ERC721Enumerable) returns (address) {
        return super._update(to, tokenId, auth);
    }
}
