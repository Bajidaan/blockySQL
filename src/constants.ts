/**
 * @module constants
 *
 * Centralised constants for Blockly block type names and sentinel values.
 * Using these constants instead of raw strings prevents typos and makes
 * renaming a block type a single-line change.
 */

// ── Block Type Names ────────────────────────────────────────────────────────

/** Schema definition blocks */
export const BLOCK_DEFINE_TABLE  = 'sql_define_table'  as const;
export const BLOCK_DEFINE_COLUMN = 'sql_define_column'  as const;

/** Query structure blocks */
export const BLOCK_QUERY        = 'sql_query'          as const;
export const BLOCK_ALL_COLUMNS  = 'sql_all_columns'    as const;
export const BLOCK_SELECT_ITEM  = 'sql_select_item'    as const;

/** Condition / expression blocks */
export const BLOCK_WHERE        = 'sql_where'          as const;
export const BLOCK_COMPARISON   = 'sql_comparison'     as const;
export const BLOCK_LOGICAL      = 'sql_logical'        as const;
export const BLOCK_NOT          = 'sql_not'            as const;
export const BLOCK_VALUE        = 'sql_value'          as const;

/** Clause blocks */
export const BLOCK_GROUP_BY     = 'sql_group_by'       as const;
export const BLOCK_HAVING       = 'sql_having'         as const;
export const BLOCK_ORDER_BY     = 'sql_order_by'       as const;
export const BLOCK_LIMIT        = 'sql_limit'          as const;
export const BLOCK_AGG_FUNC     = 'sql_agg_func'       as const;

/** Table / join blocks */
export const BLOCK_FROM_TABLE   = 'sql_from_table'     as const;
export const BLOCK_COLUMN_EXPR  = 'sql_column_expr'    as const;
export const BLOCK_JOIN         = 'sql_join'           as const;

// ── Sentinel Values ─────────────────────────────────────────────────────────

/** Dropdown sentinel when no table or column is available. */
export const NONE_SENTINEL = 'NONE' as const;

// ── LocalStorage Keys ───────────────────────────────────────────────────────

/** Key used to persist the Blockly workspace state between sessions. */
export const STORAGE_KEY = 'blockySQL_workspace' as const;
