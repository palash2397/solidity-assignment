# 🚀 Technical Assessment: TokenVault

A secure, time-locked ERC20 token distribution smart contract written in Solidity `0.4.23`. This repository implements strict allocation controls, prevents inadvertent drain of vault tokens by the contract owner, enforces a single-claim policy per beneficiary, and provides a comprehensive test suite.

---

## 📌 Requirements & Implementation Details

### 1. Minimal OpenZeppelin Mocks (Solidity `0.4.23`)
* **Context**: The contract references standard OpenZeppelin contracts via `../zeppelin/contracts/...`.
* **Solution**: Provided minimal, self-contained mock implementations under `zeppelin/contracts/`:
  - **Math**: `SafeMath.sol` (safeguards arithmetic overflow/underflow)
  - **ERC20**: `ERC20Basic.sol`, `ERC20.sol`, `BasicToken.sol`, `StandardToken.sol`, `SafeERC20.sol`, `PausableToken.sol`
  - **Ownership & Lifecycle**: `Ownable.sol`, `Claimable.sol`, `CanReclaimToken.sol`, `Pausable.sol`

### 2. Restrict Reclaiming of Vault's Own Token
* **Requirement**: The contract owner must **not** be able to reclaim the token managed and distributed by the vault (`token`). Reclaiming any other extraneous ERC20 token or Ether sent in error must still work.
* **Implementation** in `TokenVault.sol`:
  ```solidity
  function reclaimToken(ERC20Basic _token) external onlyOwner {
    require(address(_token) != address(token), "Cannot reclaim the vault's own token");
    uint256 balance = _token.balanceOf(this);
    _token.safeTransfer(owner, balance);
  }
  ```
* Reclaiming Ether continues to be supported via `Recoverable.sol`'s `reclaimEther()` function.

### 3. Enforce Allocation Cap in `setAllocation`
* **Requirement**: `setAllocation` must revert when adding an allocation would cause `tokensAllocated` to exceed `tokensToBeAllocated`. `lock()` still requires that `tokensAllocated == tokensToBeAllocated` and the contract token balance matches.
* **Implementation** in `TokenVault.sol`:
  ```solidity
  require(tokensAllocated.add(_amount) <= tokensToBeAllocated, "Total allocated tokens cannot exceed tokensToBeAllocated");
  ```

### 4. Single-Claim Rule
* **Requirement**: A beneficiary can claim tokens only once. Any subsequent call to `claim()` or `transferFor()` for that beneficiary must revert.
* **Implementation** in `_transferTokens`:
  ```solidity
  require(claimed[_beneficiary] == 0, "Beneficiary has already claimed");
  ```

---

## 🔄 Contract State Lifecycle

The `TokenVault` contract operates as a three-stage finite state machine:

```
    [ vaultLoading ]
           │
           │  owner sets allocations (up to cap) & funds vault
           │  owner calls lock()
           ▼
    [ vaultLocked ]
           │
           │  vestingPeriod elapses
           │  owner calls unlock()
           ▼
   [ vaultUnlocked ]
           │
           └── beneficiaries claim tokens once (via claim() or transferFor())
```

---

## 🧪 Running the Tests

### Prerequisites
* **Node.js**: v18+ (tested on Node v22)
* **Truffle**: Global or local installation (`npm install -g truffle`)

### Compile Contracts
```bash
truffle compile
```

### Run Test Suite
```bash
truffle test
```

---

## 📊 Test Suite Coverage (31 Passing Tests)

The test suite in [`test/TokenVault.test.js`](./test/TokenVault.test.js) verifies full contract functionality and edge cases:

* **1. Constructor & Initialization**
  - Verifies state variables (`token`, `tokensToBeAllocated`, `vestingPeriod`, initial balances).
  - Reverts if token address is `address(0)`.
  - Reverts if `tokensToBeAllocated` is `0`.

* **2. Allocation Functionality & Validations**
  - Owner sets allocation, updates total allocated, and emits `Allocated` event.
  - Reverts if called by non-owner.
  - Reverts if beneficiary is `address(0)`.
  - Reverts if allocation amount is `0`.
  - Reverts if beneficiary already has an allocation.
  - Reverts when an allocation exceeds `tokensToBeAllocated`.

* **3. Lock Functionality & Validations**
  - Reverts if called by non-owner.
  - Reverts if total allocated tokens < `tokensToBeAllocated`.
  - Reverts if vault's token balance does not match `tokensAllocated`.
  - Locks successfully when fully allocated and funded; emits `Locked` event.
  - Reverts if `lock` or `setAllocation` is called after the vault is locked.

* **4. Unlock Functionality & Validations**
  - Reverts if called before `lock`.
  - Reverts if called by non-owner.
  - Reverts if vesting period has not elapsed.
  - Unlocks successfully after vesting period; emits `Unlocked` event.
  - Reverts if `unlock` is called a second time.

* **5. Claiming & Token Distribution**
  - Reverts `claim` or `transferFor` before unlock.
  - Reverts `claim` if caller has no allocation.
  - Successful claim transfers tokens, updates balances, and emits `Distributed` event.
  - Reverts on second `claim` attempt.
  - `transferFor` by owner succeeds for eligible beneficiary and emits `Distributed` event.
  - Reverts `transferFor` when called by non-owner.
  - Second `transferFor` reverts, and `claim` after `transferFor` reverts.

* **6. Token and Ether Recovery**
  - Reclaim of vault's own token is rejected.
  - Reclaiming a different ERC20 token succeeds for owner.
  - Reclaim of tokens by non-owner reverts.
  - `reclaimEther` by owner succeeds, while non-owner call reverts.

* **7. Ownership Management (Claimable)**
  - Two-step ownership transfer (`transferOwnership` + `claimOwnership`).
  - Access-controlled methods transfer securely to the new owner.

