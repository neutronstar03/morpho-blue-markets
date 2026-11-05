import { QUERY_COLLATERAL_SUPPLY_AGGREGATE } from './collateral-supply-aggregate'
import { QUERY_COLLATERAL_CANDIDATES, QUERY_DATASET_MARKETS, QUERY_DATASET_UNHEALTHY_POSITIONS } from './dataset-generation'
import { QUERY_LIST_MARKETS } from './list-markets'
import { QUERY_SINGLE_MORPHO_MARKET } from './market-detail'
import { GetMarketLiquidationCount } from './market-liquidations'
import { QUERY_MARKETS_BY_CHAIN } from './markets-by-chain'
import { QUERY_POPULAR_LOAN_ASSETS } from './popular-loan-assets'
import { QUERY_USER_POSITIONS, QUERY_USER_POSITIONS_ALL_CHAINS } from './user-positions'
import { QUERY_USER_VAULT_V2_CHAINS, QUERY_USER_VAULT_V2_POSITIONS } from './vault-v2-positions'
import { QUERY_VAULTS_V1, QUERY_VAULTS_V2 } from './vaults-by-asset'

// All production Morpho operations. Keep this list explicit and validate it offline.
export const PRODUCTION_OPERATIONS = {
  QUERY_COLLATERAL_CANDIDATES,
  QUERY_DATASET_MARKETS,
  QUERY_DATASET_UNHEALTHY_POSITIONS,
  QUERY_COLLATERAL_SUPPLY_AGGREGATE,
  QUERY_LIST_MARKETS,
  QUERY_SINGLE_MORPHO_MARKET,
  GetMarketLiquidationCount,
  QUERY_MARKETS_BY_CHAIN,
  QUERY_POPULAR_LOAN_ASSETS,
  QUERY_USER_POSITIONS,
  QUERY_USER_POSITIONS_ALL_CHAINS,
  QUERY_USER_VAULT_V2_POSITIONS,
  QUERY_USER_VAULT_V2_CHAINS,
  QUERY_VAULTS_V1,
  QUERY_VAULTS_V2,
}
