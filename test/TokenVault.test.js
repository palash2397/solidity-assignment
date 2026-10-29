const TokenVault = artifacts.require("TokenVault");
const StandardTokenMock = artifacts.require("StandardTokenMock");

const increaseTime = (duration) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [duration],
        id: Date.now(),
      },
      (err1) => {
        if (err1) return reject(err1);
        web3.currentProvider.send(
          {
            jsonrpc: "2.0",
            method: "evm_mine",
            params: [],
            id: Date.now() + 1,
          },
          (err2, res) => {
            if (err2) return reject(err2);
            resolve(res);
          }
        );
      }
    );
  });
};

const assertRevert = async (promise, expectedReason) => {
  try {
    await promise;
    assert.fail("Expected revert not received");
  } catch (error) {
    const revertFound = error.message.search("revert") >= 0;
    assert(revertFound, `Expected "revert", got ${error.message} instead`);
    if (expectedReason) {
      assert(
        error.message.includes(expectedReason),
        `Expected error to contain "${expectedReason}", got "${error.message}"`
      );
    }
  }
};

contract("TokenVault - Comprehensive Test Suite", (accounts) => {
  const [owner, beneficiary1, beneficiary2, beneficiary3, newOwner, nonOwner] = accounts;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const TOTAL_VAULT_TOKENS = 500;
  const VESTING_PERIOD = 60; // 60 seconds

  let vaultToken;
  let otherToken;
  let vault;

  beforeEach(async () => {
    vaultToken = await StandardTokenMock.new(owner, 10000);
    otherToken = await StandardTokenMock.new(owner, 10000);
    vault = await TokenVault.new(vaultToken.address, TOTAL_VAULT_TOKENS, VESTING_PERIOD, { from: owner });
  });

  describe("1. Constructor & Initialization", () => {
    it("initializes state variables correctly", async () => {
      assert.equal(await vault.token(), vaultToken.address);
      assert.equal((await vault.tokensToBeAllocated()).toNumber(), TOTAL_VAULT_TOKENS);
      assert.equal((await vault.vestingPeriod()).toNumber(), VESTING_PERIOD);
      assert.equal((await vault.tokensAllocated()).toNumber(), 0);
      assert.equal((await vault.totalClaimed()).toNumber(), 0);
      assert.equal((await vault.lockedAt()).toNumber(), 0);
      assert.equal((await vault.unlockedAt()).toNumber(), 0);
      assert.equal(await vault.owner(), owner);
    });

    it("reverts if token address is 0", async () => {
      await assertRevert(
        TokenVault.new(ZERO_ADDRESS, TOTAL_VAULT_TOKENS, VESTING_PERIOD, { from: owner })
      );
    });

    it("reverts if tokensToBeAllocated is 0", async () => {
      await assertRevert(
        TokenVault.new(vaultToken.address, 0, VESTING_PERIOD, { from: owner })
      );
    });
  });

  describe("2. Allocation functionality & validations", () => {
    it("owner can set allocations and Allocated event is emitted", async () => {
      const tx = await vault.setAllocation(beneficiary1, 300, { from: owner });
      assert.equal((await vault.allocations(beneficiary1)).toNumber(), 300);
      assert.equal((await vault.tokensAllocated()).toNumber(), 300);

      // Verify event
      const event = tx.logs.find((l) => l.event === "Allocated");
      assert.ok(event, "Allocated event should be emitted");
      assert.equal(event.args.beneficiary, beneficiary1);
      assert.equal(event.args.amount.toNumber(), 300);
    });

    it("reverts if non-owner attempts to set allocation", async () => {
      await assertRevert(
        vault.setAllocation(beneficiary1, 100, { from: nonOwner })
      );
    });

    it("reverts if beneficiary address is zero", async () => {
      await assertRevert(
        vault.setAllocation(ZERO_ADDRESS, 100, { from: owner })
      );
    });

    it("reverts if allocation amount is zero", async () => {
      await assertRevert(
        vault.setAllocation(beneficiary1, 0, { from: owner })
      );
    });

    it("reverts if beneficiary already has an allocation", async () => {
      await vault.setAllocation(beneficiary1, 200, { from: owner });
      await assertRevert(
        vault.setAllocation(beneficiary1, 100, { from: owner })
      );
    });

    it("reverts when an allocation exceeds tokensToBeAllocated", async () => {
      await vault.setAllocation(beneficiary1, 300, { from: owner });
      // 300 + 201 = 501 > 500
      await assertRevert(
        vault.setAllocation(beneficiary2, 201, { from: owner })
      );

      // Exact remaining amount (200) succeeds
      await vault.setAllocation(beneficiary2, 200, { from: owner });
      assert.equal((await vault.tokensAllocated()).toNumber(), TOTAL_VAULT_TOKENS);
    });
  });

  describe("3. Lock functionality & validations", () => {
    it("reverts if lock is called by non-owner", async () => {
      await assertRevert(
        vault.lock({ from: nonOwner })
      );
    });

    it("reverts lock if not all tokens are allocated", async () => {
      // Allocate only 300 out of 500
      await vault.setAllocation(beneficiary1, 300, { from: owner });
      await vaultToken.transfer(vault.address, 300, { from: owner });

      await assertRevert(
        vault.lock({ from: owner })
      );
    });

    it("reverts lock if vault token balance does not match allocated total", async () => {
      // Fully allocate 500 tokens
      await vault.setAllocation(beneficiary1, 300, { from: owner });
      await vault.setAllocation(beneficiary2, 200, { from: owner });

      // Vault holds 0 tokens (expected 500)
      await assertRevert(
        vault.lock({ from: owner })
      );

      // Vault holds insufficient tokens (e.g. 400)
      await vaultToken.transfer(vault.address, 400, { from: owner });
      await assertRevert(
        vault.lock({ from: owner })
      );
    });

    it("locks successfully when fully allocated and funded, emitting Locked", async () => {
      await vault.setAllocation(beneficiary1, 300, { from: owner });
      await vault.setAllocation(beneficiary2, 200, { from: owner });
      await vaultToken.transfer(vault.address, TOTAL_VAULT_TOKENS, { from: owner });

      const tx = await vault.lock({ from: owner });
      const lockedAt = await vault.lockedAt();
      assert.ok(lockedAt.toNumber() > 0);

      const event = tx.logs.find((l) => l.event === "Locked");
      assert.ok(event, "Locked event should be emitted");
    });

    it("reverts lock or setAllocation once vault is already locked", async () => {
      await vault.setAllocation(beneficiary1, 300, { from: owner });
      await vault.setAllocation(beneficiary2, 200, { from: owner });
      await vaultToken.transfer(vault.address, TOTAL_VAULT_TOKENS, { from: owner });
      await vault.lock({ from: owner });

      // Cannot lock again
      await assertRevert(vault.lock({ from: owner }));

      // Cannot setAllocation after lock
      await assertRevert(
        vault.setAllocation(beneficiary3, 10, { from: owner })
      );
    });
  });

  describe("4. Unlock functionality & validations", () => {
    beforeEach(async () => {
      await vault.setAllocation(beneficiary1, 300, { from: owner });
      await vault.setAllocation(beneficiary2, 200, { from: owner });
      await vaultToken.transfer(vault.address, TOTAL_VAULT_TOKENS, { from: owner });
    });

    it("reverts unlock if called before lock", async () => {
      await assertRevert(vault.unlock({ from: owner }));
    });

    it("reverts unlock if called by non-owner", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 10);
      await assertRevert(vault.unlock({ from: nonOwner }));
    });

    it("reverts unlock if vesting period has not elapsed", async () => {
      await vault.lock({ from: owner });
      // Attempt immediate unlock before vesting period
      await assertRevert(vault.unlock({ from: owner }));
    });

    it("unlocks successfully after vesting period, emitting Unlocked", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);

      const tx = await vault.unlock({ from: owner });
      const unlockedAt = await vault.unlockedAt();
      assert.ok(unlockedAt.toNumber() > 0);

      const event = tx.logs.find((l) => l.event === "Unlocked");
      assert.ok(event, "Unlocked event should be emitted");
    });

    it("reverts unlock if called a second time", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);
      await vault.unlock({ from: owner });

      await assertRevert(vault.unlock({ from: owner }));
    });
  });

  describe("5. Claiming & token distribution", () => {
    beforeEach(async () => {
      await vault.setAllocation(beneficiary1, 300, { from: owner });
      await vault.setAllocation(beneficiary2, 200, { from: owner });
      await vaultToken.transfer(vault.address, TOTAL_VAULT_TOKENS, { from: owner });
    });

    it("reverts claim or transferFor before vault is unlocked", async () => {
      // In loading state
      await assertRevert(vault.claim({ from: beneficiary1 }));
      await assertRevert(vault.transferFor(beneficiary1, { from: owner }));

      // In locked state
      await vault.lock({ from: owner });
      await assertRevert(vault.claim({ from: beneficiary1 }));
      await assertRevert(vault.transferFor(beneficiary1, { from: owner }));
    });

    it("reverts claim if sender has no allocation", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);
      await vault.unlock({ from: owner });

      await assertRevert(vault.claim({ from: beneficiary3 }));
    });

    it("one successful claim after unlock distributes tokens and emits Distributed", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);
      await vault.unlock({ from: owner });

      const tx = await vault.claim({ from: beneficiary1 });
      assert.equal((await vaultToken.balanceOf(beneficiary1)).toNumber(), 300);
      assert.equal((await vault.claimed(beneficiary1)).toNumber(), 300);
      assert.equal((await vault.totalClaimed()).toNumber(), 300);

      const event = tx.logs.find((l) => l.event === "Distributed");
      assert.ok(event, "Distributed event should be emitted");
      assert.equal(event.args.beneficiary, beneficiary1);
      assert.equal(event.args.amount.toNumber(), 300);
    });

    it("a second claim reverts", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);
      await vault.unlock({ from: owner });

      await vault.claim({ from: beneficiary1 });
      await assertRevert(vault.claim({ from: beneficiary1 }));
    });

    it("transferFor by owner succeeds and emits Distributed", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);
      await vault.unlock({ from: owner });

      const tx = await vault.transferFor(beneficiary2, { from: owner });
      assert.equal((await vaultToken.balanceOf(beneficiary2)).toNumber(), 200);
      assert.equal((await vault.claimed(beneficiary2)).toNumber(), 200);

      const event = tx.logs.find((l) => l.event === "Distributed");
      assert.ok(event, "Distributed event should be emitted");
      assert.equal(event.args.beneficiary, beneficiary2);
      assert.equal(event.args.amount.toNumber(), 200);
    });

    it("transferFor by non-owner reverts", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);
      await vault.unlock({ from: owner });

      await assertRevert(vault.transferFor(beneficiary2, { from: nonOwner }));
    });

    it("second transferFor reverts, and claim after transferFor reverts", async () => {
      await vault.lock({ from: owner });
      await increaseTime(VESTING_PERIOD + 5);
      await vault.unlock({ from: owner });

      await vault.transferFor(beneficiary2, { from: owner });
      await assertRevert(vault.transferFor(beneficiary2, { from: owner }));
      await assertRevert(vault.claim({ from: beneficiary2 }));
    });
  });

  describe("6. Token and Ether Recovery", () => {
    it("reclaim of the vault token is rejected", async () => {
      await vaultToken.transfer(vault.address, TOTAL_VAULT_TOKENS, { from: owner });
      await assertRevert(
        vault.reclaimToken(vaultToken.address, { from: owner })
      );
    });

    it("reclaiming a different ERC20 token works for owner", async () => {
      const amount = 250;
      await otherToken.transfer(vault.address, amount, { from: owner });

      const beforeBalance = await otherToken.balanceOf(owner);
      await vault.reclaimToken(otherToken.address, { from: owner });
      const afterBalance = await otherToken.balanceOf(owner);

      assert.equal(afterBalance.sub(beforeBalance).toNumber(), amount);
      assert.equal((await otherToken.balanceOf(vault.address)).toNumber(), 0);
    });

    it("reclaimToken called by non-owner reverts", async () => {
      await otherToken.transfer(vault.address, 100, { from: owner });
      await assertRevert(
        vault.reclaimToken(otherToken.address, { from: nonOwner })
      );
    });

    it("reclaimEther called by owner succeeds and non-owner reverts", async () => {
      await vault.reclaimEther({ from: owner });
      await assertRevert(vault.reclaimEther({ from: nonOwner }));
    });
  });

  describe("7. Ownership Management (Claimable)", () => {
    it("handles two-step transfer of ownership correctly", async () => {
      // Step 1: Owner initiates transfer
      await vault.transferOwnership(newOwner, { from: owner });
      assert.equal(await vault.pendingOwner(), newOwner);
      assert.equal(await vault.owner(), owner);

      // Non-pending-owner cannot claim
      await assertRevert(vault.claimOwnership({ from: nonOwner }));

      // Step 2: New owner claims
      await vault.claimOwnership({ from: newOwner });
      assert.equal(await vault.owner(), newOwner);
      assert.equal(await vault.pendingOwner(), ZERO_ADDRESS);

      // Old owner can no longer execute owner-only actions
      await assertRevert(vault.setAllocation(beneficiary1, 100, { from: owner }));

      // New owner can execute owner-only actions
      await vault.setAllocation(beneficiary1, 100, { from: newOwner });
      assert.equal((await vault.allocations(beneficiary1)).toNumber(), 100);
    });
  });
});
