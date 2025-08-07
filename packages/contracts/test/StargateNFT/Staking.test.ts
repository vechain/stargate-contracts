import { expect } from "chai";
import { ethers } from "hardhat";
import { getOrDeployContracts } from "../helpers/deploy";
import { StargateNFT, Errors } from "../../typechain-types";
import { getStargateNFTErrorsInterface, mineBlocks } from "../helpers/common";
import { TokenLevelId } from "@repo/config/contracts/StargateNFT";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ContractsConfig } from "@repo/config/contracts/type";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";

describe("shard7: StargateNFT Staking", () => {
  let config: ContractsConfig;
  let stargateNFT: StargateNFT;
  let stargateNFTAddress: string;
  let errorsInterface: Errors;
  let tx: TransactionResponse;
  let user1: HardhatEthersSigner;
  let expectedTokenId: number;

  beforeEach(async () => {
    config = createLocalConfig();

    const { stargateNFTContract, otherAccounts } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    stargateNFT = stargateNFTContract;
    stargateNFTAddress = await stargateNFT.getAddress();
    errorsInterface = await getStargateNFTErrorsInterface(stargateNFT);

    user1 = otherAccounts[0];
    expectedTokenId = config.LEGACY_LAST_TOKEN_ID + 1;
  });

  it("should start testing with expected state", async () => {
    // Assert that user has no NFTs
    expect(await stargateNFT.balanceOf(user1)).to.equal(0);

    // Assert contract balance
    expect(await ethers.provider.getBalance(stargateNFTAddress)).to.equal(0);

    // Assert token id
    await expect(stargateNFT.ownerOf(expectedTokenId)).to.be.reverted; // ownerOf under the hood, ERC721NonexistentToken
    expect(await stargateNFT.idsOwnedBy(user1)).to.deep.equal([]);

    expect(await stargateNFT.tokensOwnedBy(user1)).to.deep.equal([]);
    expect(await stargateNFT.levelsOwnedBy(user1)).to.deep.equal([]);
    expect(await stargateNFT.ownerTotalVetStaked(user1)).to.equal(0);
    expect(await stargateNFT.tokenExists(expectedTokenId)).to.be.false;
  });

  it("staking should revert for non-existent level", async () => {
    const randomLevelId = 100;
    await expect(stargateNFT.connect(user1).stake(randomLevelId)).to.be.reverted;
  });

  it("staking should revert when cap is reached", async () => {
    const levelNotAvailable = TokenLevelId.StrengthX;
    await expect(stargateNFT.connect(user1).stake(levelNotAvailable)).to.be.reverted;
  });

  it("staking should revert when tx value is bigger than the required VET amount", async () => {
    const levelId = TokenLevelId.Thunder;
    const levelSpec = await stargateNFT.getLevel(levelId);
    const valueToSend = levelSpec.vetAmountRequiredToStake + 1n;

    await expect(stargateNFT.connect(user1).stake(levelId, { value: valueToSend })).to.be.reverted;
  });

  it("staking should revert when tx value is smaller than the required VET amount", async () => {
    const levelId = TokenLevelId.Thunder;
    const levelSpec = await stargateNFT.getLevel(levelId);
    const valueToSend = levelSpec.vetAmountRequiredToStake - 1n;

    await expect(stargateNFT.connect(user1).stake(levelId, { value: valueToSend })).to.be.reverted;
  });

  it("when staking succeeds, the NFT should be minted", async () => {
    const levelId = TokenLevelId.Thunder;
    const levelSpec = await stargateNFT.getLevel(levelId);
    const { circulating, cap } = await stargateNFT.getLevelSupply(levelId);

    tx = await stargateNFT
      .connect(user1)
      .stake(levelId, { value: levelSpec.vetAmountRequiredToStake });
    await tx.wait();

    // Assert that user has 1 NFT
    expect(await stargateNFT.balanceOf(user1)).to.equal(1);

    // Assert contract balance
    expect(await ethers.provider.getBalance(stargateNFTAddress)).to.equal(
      levelSpec.vetAmountRequiredToStake
    );

    // Assertions re supply
    const { circulating: supplyAfter, cap: capAfter } = await stargateNFT.getLevelSupply(levelId);
    expect(supplyAfter).to.equal(circulating + 1n);
    expect(capAfter).to.equal(cap);

    // Assert token id
    expect(await stargateNFT.ownerOf(expectedTokenId)).to.be.equal(user1.address);
    expect(await stargateNFT.idsOwnedBy(user1)).to.deep.equal([expectedTokenId]);

    // Assert token data
    const token = await stargateNFT.getToken(expectedTokenId);
    expect(token.levelId).to.equal(levelId);
    expect(token.mintedAtBlock).to.equal(tx.blockNumber);
    expect(token.vetAmountStaked).to.equal(levelSpec.vetAmountRequiredToStake);

    // Other assertions
    expect(await stargateNFT.tokensOwnedBy(user1)).to.deep.equal([
      [
        token.tokenId,
        token.levelId,
        token.mintedAtBlock,
        token.vetAmountStaked,
        token.lastVthoClaimTimestamp,
      ],
    ]);
    expect(await stargateNFT.levelsOwnedBy(user1)).to.deep.equal([levelId]);
    expect(await stargateNFT.ownerTotalVetStaked(user1)).to.equal(
      levelSpec.vetAmountRequiredToStake
    );

    // Token assertions
    expect(await stargateNFT.isXToken(token.tokenId)).to.be.false;
    expect(await stargateNFT.isNormalToken(token.tokenId)).to.be.true;
    expect(await stargateNFT.tokenExists(token.tokenId)).to.be.true;

    // Chek that token URI can be fetched correctly
    const baseURI = await stargateNFT.baseURI();
    const tokenURI = await stargateNFT.tokenURI(token.tokenId);
    expect(tokenURI).to.equal(`${baseURI}${token.levelId}.json`);
  });

  it("safeMint callback is not callable externally", async () => {
    const deployer = (await ethers.getSigners())[0];

    await expect(stargateNFT.connect(deployer)._safeMintCallback(deployer.address, 100000)).to.be
      .reverted;

    await expect(stargateNFT.connect(user1)._safeMintCallback(user1.address, 100000)).to.be
      .reverted;
  });

  it("User should be able to stake multiple times", async () => {
    const levelId = TokenLevelId.Thunder;
    const levelSpec = await stargateNFT.getLevel(levelId);
    const { circulating, cap } = await stargateNFT.getLevelSupply(levelId);
    const latestTokenId = await stargateNFT.getCurrentTokenId();

    await expect(
      stargateNFT
        .connect(user1)
        .stake(levelId, { value: levelSpec.vetAmountRequiredToStake, gasLimit: 10_000_000 })
    )
      .to.emit(stargateNFT, "TokenMinted")
      .withArgs(
        user1.address,
        levelId,
        false,
        latestTokenId + 1n,
        levelSpec.vetAmountRequiredToStake
      );

    await mineBlocks(1); // wait 1 block to ensure the NFT is minted

    await expect(
      stargateNFT
        .connect(user1)
        .stake(levelId, { value: levelSpec.vetAmountRequiredToStake, gasLimit: 10_000_000 })
    )
      .to.emit(stargateNFT, "TokenMinted")
      .withArgs(
        user1.address,
        levelId,
        false,
        latestTokenId + 2n,
        levelSpec.vetAmountRequiredToStake
      );

    // Assert that user has 1 NFT
    expect(await stargateNFT.balanceOf(user1)).to.equal(2);

    // Assert contract balance
    expect(await ethers.provider.getBalance(stargateNFTAddress)).to.equal(
      levelSpec.vetAmountRequiredToStake * 2n
    );

    // Assertions re supply
    const { circulating: supplyAfter, cap: capAfter } = await stargateNFT.getLevelSupply(levelId);
    expect(supplyAfter).to.equal(circulating + 2n);
    expect(capAfter).to.equal(cap);

    // Assert token id
    expect(await stargateNFT.ownerOf(latestTokenId + 1n)).to.be.equal(user1.address);
    expect(await stargateNFT.ownerOf(latestTokenId + 2n)).to.be.equal(user1.address);
    expect(await stargateNFT.idsOwnedBy(user1)).to.deep.equal([
      latestTokenId + 1n,
      latestTokenId + 2n,
    ]);

    // Other assertions
    expect((await stargateNFT.tokensOwnedBy(user1)).length).to.equal(2);
    expect(await stargateNFT.levelsOwnedBy(user1)).to.deep.equal([levelId, levelId]);
    expect(await stargateNFT.ownerTotalVetStaked(user1)).to.equal(
      levelSpec.vetAmountRequiredToStake * 2n
    );
  });
});
