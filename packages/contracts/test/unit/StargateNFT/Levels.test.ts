import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts, getStargateNFTErrorsInterface } from "../../helpers";
import { Errors, Stargate, StargateNFT } from "../../../typechain-types";

describe("shard-u101: StargateNFT: Levels", () => {
    const config = createLocalConfig();

    let otherAccounts: HardhatEthersSigner[];
    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;
    let errorsInterface: Errors;

    beforeEach(async () => {
        const contracts = await getOrDeployContracts({
            forceDeploy: true,
            config,
        });

        otherAccounts = contracts.otherAccounts;
        stargateNFTContract = contracts.stargateNFTContract;
        stargateContract = contracts.stargateContract;
        errorsInterface = await getStargateNFTErrorsInterface();
    });

    describe("Getters (some)", () => {
        it("should not be able to get a non-existing level", async () => {
            const fakeLevelId = 100;

            const levelIds = await stargateNFTContract.getLevelIds();

            expect(levelIds).to.not.include(fakeLevelId);

            await expect(stargateNFTContract.getLevel(fakeLevelId))
                .to.be.revertedWithCustomError(errorsInterface, "LevelNotFound")
                .withArgs(fakeLevelId);
        });

        it("should not be able to get the supply of a non-existing level", async () => {
            const fakeLevelId = 100;

            const levelIds = await stargateNFTContract.getLevelIds();

            expect(levelIds).to.not.include(fakeLevelId);

            await expect(stargateNFTContract.getLevelSupply(fakeLevelId))
                .to.be.revertedWithCustomError(errorsInterface, "LevelNotFound")
                .withArgs(fakeLevelId);
        });

        it("should not be able to get the circulating supply at block of a non-existent level", async () => {
            const fakeLevelId = 100;

            const levelIds = await stargateNFTContract.getLevelIds();

            expect(levelIds).to.not.include(fakeLevelId);

            const currentBlock = await stargateNFTContract.clock();
            await expect(stargateNFTContract.getCirculatingSupplyAtBlock(fakeLevelId, currentBlock))
                .to.be.revertedWithCustomError(errorsInterface, "LevelNotFound")
                .withArgs(fakeLevelId);
        });

        it("should not be able to get the circulating supply at block in the future", async () => {
            const currentBlock = await stargateNFTContract.clock();
            await expect(
                stargateNFTContract.getCirculatingSupplyAtBlock(1, currentBlock + 100n)
            ).to.be.revertedWithCustomError(errorsInterface, "BlockInFuture");
        });

        it("should be able to get all levels", async () => {
            const levels = await stargateNFTContract.getLevels();

            for (let i = 0; i < levels.length; i++) {
                const level = levels[i];
                const configLevel = config.TOKEN_LEVELS[i];

                expect(level.id).to.equal(configLevel.level.id);
                expect(level.name).to.equal(configLevel.level.name);
                expect(level.isX).to.equal(configLevel.level.isX);
                expect(level.vetAmountRequiredToStake).to.equal(
                    configLevel.level.vetAmountRequiredToStake
                );
                expect(level.scaledRewardFactor).to.equal(configLevel.level.scaledRewardFactor);
                expect(level.maturityBlocks).to.equal(configLevel.level.maturityBlocks);
            }
        });

        it("should be able to get all levels circulating supplies", async () => {
            const circulatingSupplies = await stargateNFTContract.getLevelsCirculatingSupplies();

            // Expect all circulating supplies to be 0
            expect(circulatingSupplies).to.deep.equal(Array(config.TOKEN_LEVELS.length).fill(0));

            // Mint a token
            const stakeTx = await stargateContract.connect(otherAccounts[0]).stake(1, {
                value: config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake,
            });
            await stakeTx.wait();

            // Assert circulating supply is 1
            const circulatingSuppliesAfter =
                await stargateNFTContract.getLevelsCirculatingSupplies();
            expect(circulatingSuppliesAfter).to.deep.equal(
                [1].concat(Array(config.TOKEN_LEVELS.length - 1).fill(0))
            );
        });

        it("should be able to correctly track all levels circulating supplies at all blocks", async () => {
            const t0 = await stargateNFTContract.clock();
            const circulatingSuppliesAtT0 =
                await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(t0);
            // console.log("circulatingSuppliesAtT0", circulatingSuppliesAtT0);

            // Mint a token of level 1
            const stakeTx1 = await stargateContract.connect(otherAccounts[0]).stake(1, {
                value: config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake,
            });
            const tx1Receipt = await stakeTx1.wait();

            const t1 = tx1Receipt?.blockNumber;
            if (!t1) {
                throw new Error("Transaction 1 did not include a block number");
            }
            const circulatingSuppliesAtT1 =
                await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(t1);
            // console.log("circulatingSuppliesAtT1", circulatingSuppliesAtT1);

            // Mint a token of level 8
            const stakeTx2 = await stargateContract.connect(otherAccounts[0]).stake(8, {
                value: config.TOKEN_LEVELS[7].level.vetAmountRequiredToStake,
            });
            const tx2Receipt = await stakeTx2.wait();

            const t2 = tx2Receipt?.blockNumber;
            if (!t2) {
                throw new Error("Transaction 2 did not include a block number");
            }
            const circulatingSuppliesAtT2 =
                await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(t2);
            // console.log("circulatingSuppliesAtT2", circulatingSuppliesAtT2);

            // Assertions
            // At t0, all circulating supplies are 0
            expect(circulatingSuppliesAtT0).to.deep.equal(
                Array(config.TOKEN_LEVELS.length).fill(0)
            );

            // At t1, circulating supply of level 1 is 1, and all other levels are 0
            expect(circulatingSuppliesAtT1[0]).to.equal(1);
            expect(circulatingSuppliesAtT1[1]).to.equal(0);
            expect(circulatingSuppliesAtT1[2]).to.equal(0);
            expect(circulatingSuppliesAtT1[3]).to.equal(0);
            expect(circulatingSuppliesAtT1[4]).to.equal(0);
            expect(circulatingSuppliesAtT1[5]).to.equal(0);
            expect(circulatingSuppliesAtT1[6]).to.equal(0);
            expect(circulatingSuppliesAtT1[7]).to.equal(0);
            expect(circulatingSuppliesAtT1[8]).to.equal(0);
            expect(circulatingSuppliesAtT1[9]).to.equal(0);

            // At t2, circulating supply of levels 1 and 8 is 1, and all other levels are 0
            expect(circulatingSuppliesAtT2[0]).to.equal(1);
            expect(circulatingSuppliesAtT2[1]).to.equal(0);
            expect(circulatingSuppliesAtT2[2]).to.equal(0);
            expect(circulatingSuppliesAtT2[3]).to.equal(0);
            expect(circulatingSuppliesAtT2[4]).to.equal(0);
            expect(circulatingSuppliesAtT2[5]).to.equal(0);
            expect(circulatingSuppliesAtT2[6]).to.equal(0);
            expect(circulatingSuppliesAtT2[7]).to.equal(1);
            expect(circulatingSuppliesAtT2[8]).to.equal(0);
        });
    });

    describe("Add level", () => {
        it("should not be able to add level without level operator role", async () => {
            const currentLevelIds = await stargateNFTContract.getLevelIds();

            const unauthorisedUser = otherAccounts[0];

            expect(
                await stargateNFTContract.hasRole(
                    await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
                    unauthorisedUser.address
                )
            ).to.be.false;

            await expect(
                stargateNFTContract.connect(unauthorisedUser).addLevel({
                    level: {
                        id: 25, // This id does not matter since it will be replaced by the real one
                        name: "My New Level",
                        isX: false,
                        vetAmountRequiredToStake: ethers.parseEther("1000000"),
                        scaledRewardFactor: 150,
                        maturityBlocks: 30,
                    },
                    cap: 872,
                    circulatingSupply: 0,
                })
            ).to.be.revertedWithCustomError(
                stargateNFTContract,
                "AccessControlUnauthorizedAccount"
            );

            expect(await stargateNFTContract.getLevelIds()).to.deep.equal(currentLevelIds);
        });

        it("should not be able to add level with invalid parameters", async () => {
            const currentLevelIds = await stargateNFTContract.getLevelIds();

            const levelOperator = otherAccounts[1];

            const grantTx = await stargateNFTContract.grantRole(
                await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
                levelOperator.address
            );
            await grantTx.wait();

            const testCases = [
                {
                    test: "Level name cannot be empty",
                    input: {
                        level: {
                            id: 0,
                            name: "",
                            isX: false,
                            vetAmountRequiredToStake: ethers.parseEther("1000"),
                            scaledRewardFactor: 100,
                            maturityBlocks: 20,
                        },
                        cap: 1000,
                        circulatingSupply: 0,
                    },
                    expectedError: "StringCannotBeEmpty",
                },
                {
                    test: "Level VET requirement cannot be zero",
                    input: {
                        level: {
                            id: 0,
                            name: "Zero Vet",
                            isX: false,
                            vetAmountRequiredToStake: 0n,
                            scaledRewardFactor: 100,
                            maturityBlocks: 20,
                        },
                        cap: 1000,
                        circulatingSupply: 0,
                    },
                    expectedError: "ValueCannotBeZero",
                },
                {
                    test: "Level circulating supply cannot be greater than cap",
                    input: {
                        level: {
                            id: 0,
                            name: "Bad Supply",
                            isX: false,
                            vetAmountRequiredToStake: ethers.parseEther("1000"),
                            scaledRewardFactor: 100,
                            maturityBlocks: 20,
                        },
                        cap: 100,
                        circulatingSupply: 101,
                    },
                    expectedError: "CirculatingSupplyGreaterThanCap",
                },
            ];

            for (const testCase of testCases) {
                await expect(
                    stargateNFTContract.connect(levelOperator).addLevel(testCase.input)
                ).to.be.revertedWithCustomError(errorsInterface, testCase.expectedError);

                expect(await stargateNFTContract.getLevelIds()).to.deep.equal(currentLevelIds);

                console.log(`          ${testCase.test} ✅`);
            }
        });

        it("should be able to add level, and levels should be sequentially numbered", async () => {
            const levelOperator = otherAccounts[2];

            const grantTx = await stargateNFTContract.grantRole(
                await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
                levelOperator.address
            );
            await grantTx.wait();

            const currentLevelIds = await stargateNFTContract.getLevelIds();

            const newLevelAndSupply = {
                level: {
                    id: 25, // This id does not matter since it will be replaced by the real one
                    name: "My New Level",
                    isX: false,
                    vetAmountRequiredToStake: ethers.parseEther("1000000"),
                    scaledRewardFactor: 150,
                    maturityBlocks: 30,
                },
                cap: 872,
                circulatingSupply: 0,
            };

            const expectedLevelId = currentLevelIds[currentLevelIds.length - 1] + 1n;

            // Add new level
            const addLevelTx = await stargateNFTContract
                .connect(levelOperator)
                .addLevel(newLevelAndSupply);
            await addLevelTx.wait();

            // Assert levels are sequentially numbered
            expect(await stargateNFTContract.getLevelIds()).to.deep.equal([
                ...currentLevelIds,
                expectedLevelId,
            ]);

            // Assert new level data is correct
            const newLevel = await stargateNFTContract.getLevel(expectedLevelId);
            expect(newLevel.name).to.equal(newLevelAndSupply.level.name);
            expect(newLevel.isX).to.equal(newLevelAndSupply.level.isX);
            expect(newLevel.vetAmountRequiredToStake).to.equal(
                newLevelAndSupply.level.vetAmountRequiredToStake
            );
            expect(newLevel.scaledRewardFactor).to.equal(
                newLevelAndSupply.level.scaledRewardFactor
            );
            expect(newLevel.maturityBlocks).to.equal(newLevelAndSupply.level.maturityBlocks);

            // Assert cap and circulating supply are correct
            const newLevelSupply = await stargateNFTContract.getLevelSupply(expectedLevelId);
            expect(newLevelSupply.cap).to.equal(newLevelAndSupply.cap);
            expect(newLevelSupply.circulating).to.equal(newLevelAndSupply.circulatingSupply);
        });
    });
});
