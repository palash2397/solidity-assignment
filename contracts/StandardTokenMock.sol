pragma solidity 0.4.23;

import "../zeppelin/contracts/token/ERC20/StandardToken.sol";

contract StandardTokenMock is StandardToken {
  constructor(address initialAccount, uint256 initialBalance) public {
    totalSupply_ = initialBalance;
    balances[initialAccount] = initialBalance;
    emit Transfer(address(0), initialAccount, initialBalance);
  }
}

