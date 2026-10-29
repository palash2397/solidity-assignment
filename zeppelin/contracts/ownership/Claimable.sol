pragma solidity 0.4.23;

import "./Ownable.sol";

contract Claimable is Ownable {
  address public pendingOwner;

  modifier onlyPendingOwner() {
    require(msg.sender == pendingOwner);
    _;
  }

  function transferOwnership(address newOwner) public onlyOwner {
    pendingOwner = newOwner;
  }

  function claimOwnership() public onlyPendingOwner {
    emit OwnershipTransferred(owner, pendingOwner);
    owner = pendingOwner;
    pendingOwner = address(0);
  }
}

