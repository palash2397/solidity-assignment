pragma solidity 0.4.23;

import "./Ownable.sol";
import "../token/ERC20/ERC20Basic.sol";
import "../token/ERC20/SafeERC20.sol";

contract CanReclaimToken is Ownable {
  using SafeERC20 for ERC20Basic;

  function reclaimToken(ERC20Basic _token) external onlyOwner {
    uint256 balance = _token.balanceOf(this);
    _token.safeTransfer(owner, balance);
  }
}

