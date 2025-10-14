export const SIMPLIFIED_MORPHO_BLUE_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'loanToken', type: 'address' },
          { internalType: 'address', name: 'collateralToken', type: 'address' },
          { internalType: 'address', name: 'oracle', type: 'address' },
          { internalType: 'address', name: 'irm', type: 'address' },
          { internalType: 'uint256', name: 'lltv', type: 'uint256' },
        ],
        internalType: 'struct MarketParams',
        name: 'marketParams',
        type: 'tuple',
      },
      { internalType: 'uint256', name: 'assets', type: 'uint256' },
      { internalType: 'uint256', name: 'shares', type: 'uint256' },
      { internalType: 'address', name: 'onBehalf', type: 'address' },
      { internalType: 'bytes', name: 'data', type: 'bytes' },
    ],
    name: 'supply',
    outputs: [
      { internalType: 'uint256', name: 'assetsSupplied', type: 'uint256' },
      { internalType: 'uint256', name: 'sharesSupplied', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        components: [
          { internalType: 'address', name: 'loanToken', type: 'address' },
          { internalType: 'address', name: 'collateralToken', type: 'address' },
          { internalType: 'address', name: 'oracle', type: 'address' },
          { internalType: 'address', name: 'irm', type: 'address' },
          { internalType: 'uint256', name: 'lltv', type: 'uint256' },
        ],
        internalType: 'struct MarketParams',
        name: 'marketParams',
        type: 'tuple',
      },
      { internalType: 'uint256', name: 'assets', type: 'uint256' },
      { internalType: 'uint256', name: 'shares', type: 'uint256' },
      { internalType: 'address', name: 'onBehalf', type: 'address' },
      { internalType: 'address', name: 'receiver', type: 'address' },
    ],
    name: 'withdraw',
    outputs: [
      { internalType: 'uint256', name: 'assetsWithdrawn', type: 'uint256' },
      { internalType: 'uint256', name: 'sharesWithdrawn', type: 'uint256' },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'bytes32', name: 'id', type: 'bytes32' },
      { internalType: 'address', name: 'user', type: 'address' },
    ],
    name: 'position',
    outputs: [
      { internalType: 'uint256', name: 'supplyShares', type: 'uint256' },
      { internalType: 'uint128', name: 'borrowShares', type: 'uint128' },
      { internalType: 'uint128', name: 'collateral', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'bytes32', name: 'id', type: 'bytes32' }],
    name: 'market',
    outputs: [
      { internalType: 'uint128', name: 'totalSupplyAssets', type: 'uint128' },
      { internalType: 'uint128', name: 'totalSupplyShares', type: 'uint128' },
      { internalType: 'uint128', name: 'totalBorrowAssets', type: 'uint128' },
      { internalType: 'uint128', name: 'totalBorrowShares', type: 'uint128' },
      { internalType: 'uint128', name: 'lastUpdate', type: 'uint128' },
      { internalType: 'uint128', name: 'fee', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const
