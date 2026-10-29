module.exports = {
  contracts_directory: "./contracts",
  contracts_build_directory: "./build/contracts",
  compilers: {
    solc: {
      version: "0.4.23",
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  }
};
