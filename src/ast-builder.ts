/**
 * @module ast-builder
 *
 * Walks the live Blockly workspace and constructs a typed AST
 * (see {@link ast.ts}) that represents the user's SQL query.
 *
 * This is the first stage of the compiler pipeline:
 * ```
 * **Blockly Workspace → AST** → Validator → Optimizer → SQL Emitter
 * ```
 *
 * Also provides {@link buildSchema} to extract table/column metadata
 * from `sql_define_table` / `sql_define_column` blocks, which the
 * validator uses for semantic checks.
 */

import * as Blockly from 'blockly';
import type {
  ASTNode,
  SelectQueryNode,
  TableNode,
  JoinNode,
  OrderByNode,
  LimitNode
} from './ast';
import {
  BLOCK_QUERY,
  BLOCK_DEFINE_TABLE,
  BLOCK_DEFINE_COLUMN,
  BLOCK_ALL_COLUMNS,
  BLOCK_SELECT_ITEM,
  BLOCK_FROM_TABLE,
  BLOCK_JOIN,
  BLOCK_WHERE,
  BLOCK_GROUP_BY,
  BLOCK_HAVING,
  BLOCK_ORDER_BY,
  BLOCK_LIMIT,
  BLOCK_COLUMN_EXPR,
  BLOCK_VALUE,
  BLOCK_COMPARISON,
  BLOCK_LOGICAL,
  BLOCK_NOT,
  BLOCK_AGG_FUNC,
  NONE_SENTINEL
} from './constants';

// ── Schema Types ──────────────────────────────────────────────────────────

/**
 * Metadata for a single column in the workspace schema.
 *
 * @property type - The SQL data type (`'TEXT'`, `'INTEGER'`, `'REAL'`, `'BOOLEAN'`).
 */
export interface ColumnSchema {
  type: string;
}

/**
 * Metadata for a single table, mapping column names to their schemas.
 */
export interface TableSchema {
  columns: Record<string, ColumnSchema>;
}

/**
 * The complete workspace schema: a map from table name to its column definitions.
 * Built from `sql_define_table` / `sql_define_column` blocks.
 */
export type Schema = Record<string, TableSchema>;

// ── Schema Extraction ─────────────────────────────────────────────────────

/**
 * Extract table and column metadata from all `sql_define_table` blocks
 * in the workspace.  The result is used by the validator for type checking
 * and column resolution.
 *
 * @param workspace - The Blockly workspace to scan.
 * @returns A {@link Schema} mapping table names to their column definitions.
 *
 * @example
 * ```ts
 * const schema = buildSchema(workspace);
 * // { employees: { columns: { id: { type: 'INTEGER' }, name: { type: 'TEXT' } } } }
 * ```
 */
export function buildSchema(workspace: Blockly.Workspace): Schema {
  const schema: Schema = {};
  const tableDefs = workspace.getBlocksByType(BLOCK_DEFINE_TABLE);
  
  for (const block of tableDefs) {
    const tableName = block.getFieldValue('TABLE_NAME');
    if (!tableName) continue;
    
    const tableSchema: TableSchema = { columns: {} };
    let colBlock = block.getInputTargetBlock('COLUMNS');
    while (colBlock) {
      if (colBlock.type === BLOCK_DEFINE_COLUMN) {
        const colName = colBlock.getFieldValue('COL_NAME');
        const colType = colBlock.getFieldValue('COL_TYPE');
        if (colName) {
          tableSchema.columns[colName] = { type: colType };
        }
      }
      colBlock = colBlock.getNextBlock();
    }
    schema[tableName] = tableSchema;
  }
  return schema;
}

// ── AST Construction ──────────────────────────────────────────────────────

/**
 * Walk the Blockly workspace and build an AST for every `sql_query` block.
 * Non-query top-level blocks (e.g. floating schema definitions) are ignored.
 *
 * @param workspace - The Blockly workspace to scan.
 * @returns An array of {@link SelectQueryNode} AST roots — one per `sql_query` block.
 *
 * @example
 * ```ts
 * const ast = buildAST(workspace);
 * const sql = emitSQL(ast); // full SQL string
 * ```
 */
export function buildAST(workspace: Blockly.Workspace): SelectQueryNode[] {
  const topBlocks = workspace.getTopBlocks(true);
  const queries: SelectQueryNode[] = [];

  for (const block of topBlocks) {
    if (block.type === BLOCK_QUERY) {
      queries.push(buildQueryNode(block));
    }
  }

  return queries;
}

/**
 * Build a {@link SelectQueryNode} from a single `sql_query` block,
 * including all its nested clause blocks (FROM, WHERE, GROUP BY, etc.).
 *
 * @param block - A Blockly block of type `sql_query`.
 * @returns The fully populated AST node.
 */
function buildQueryNode(block: Blockly.Block): SelectQueryNode {
  const distinct = block.getFieldValue('DISTINCT') === 'TRUE';
  
  // ── SELECT columns ─────────────────────────────────────────────────
  const columns: ASTNode[] = [];
  let colBlock = block.getInputTargetBlock('COLUMNS');
  while (colBlock) {
    const node = buildSelectNode(colBlock);
    if (node) columns.push(node);
    colBlock = colBlock.getNextBlock();
  }

  // ── FROM tables & JOINs ────────────────────────────────────────────
  const from: TableNode[] = [];
  const joins: JoinNode[] = [];
  let fromBlock = block.getInputTargetBlock('FROM');
  while (fromBlock) {
    if (fromBlock.type === BLOCK_FROM_TABLE) {
      const name = fromBlock.getFieldValue('TABLE');
      if (name && name !== NONE_SENTINEL) {
        from.push({
          type: 'Table',
          name,
          alias: fromBlock.getFieldValue('ALIAS') || null,
          blockId: fromBlock.id
        });
      }
    } else if (fromBlock.type === BLOCK_JOIN) {
      const name = fromBlock.getFieldValue('TABLE');
      if (name && name !== NONE_SENTINEL) {
        joins.push({
          type: 'Join',
          joinType: fromBlock.getFieldValue('JOIN_TYPE'),
          table: {
            type: 'Table',
            name,
            alias: fromBlock.getFieldValue('ALIAS') || null,
            blockId: fromBlock.id
          },
          on: buildExprNode(fromBlock.getInputTargetBlock('ON')) || { type: 'Literal', value: true },
          blockId: fromBlock.id
        });
      }
    }
    fromBlock = fromBlock.getNextBlock();
  }

  // ── WHERE ──────────────────────────────────────────────────────────
  let where: ASTNode | null = null;
  const whereClauseBlock = block.getInputTargetBlock('WHERE');
  if (whereClauseBlock && whereClauseBlock.type === BLOCK_WHERE) {
    where = buildExprNode(whereClauseBlock.getInputTargetBlock('CONDITION'))
      || { type: 'Literal', value: true, blockId: whereClauseBlock.id };
  }

  // ── GROUP BY ───────────────────────────────────────────────────────
  const groupBy: ASTNode[] = [];
  let groupBlock = block.getInputTargetBlock('GROUP_BY');
  while (groupBlock) {
    if (groupBlock.type === BLOCK_GROUP_BY) {
      const expr = buildExprNode(groupBlock.getInputTargetBlock('EXPR'));
      if (expr) groupBy.push(expr);
    }
    groupBlock = groupBlock.getNextBlock();
  }

  // ── HAVING ─────────────────────────────────────────────────────────
  let having: ASTNode | null = null;
  const havingClauseBlock = block.getInputTargetBlock('HAVING');
  if (havingClauseBlock && havingClauseBlock.type === BLOCK_HAVING) {
    having = buildExprNode(havingClauseBlock.getInputTargetBlock('CONDITION'))
      || { type: 'Literal', value: true, blockId: havingClauseBlock.id };
  }

  // ── ORDER BY ───────────────────────────────────────────────────────
  const orderBy: OrderByNode[] = [];
  let orderBlock = block.getInputTargetBlock('ORDER_BY');
  while (orderBlock) {
    if (orderBlock.type === BLOCK_ORDER_BY) {
      const expr = buildExprNode(orderBlock.getInputTargetBlock('EXPR'));
      if (expr) {
        orderBy.push({
          type: 'OrderBy',
          expr,
          direction: orderBlock.getFieldValue('DIR') as 'ASC' | 'DESC',
          blockId: orderBlock.id
        });
      }
    }
    orderBlock = orderBlock.getNextBlock();
  }

  // ── LIMIT ──────────────────────────────────────────────────────────
  let limit: LimitNode | null = null;
  const limitClauseBlock = block.getInputTargetBlock('LIMIT');
  if (limitClauseBlock && limitClauseBlock.type === BLOCK_LIMIT) {
    const expr = buildExprNode(limitClauseBlock.getInputTargetBlock('NUM'));
    if (expr && expr.type === 'Literal' && typeof expr.value === 'number') {
      limit = { type: 'Limit', value: expr.value, blockId: limitClauseBlock.id };
    } else if (expr && expr.type === 'Literal' && typeof expr.value === 'string') {
      const num = Number(expr.value);
      if (!isNaN(num)) limit = { type: 'Limit', value: num, blockId: limitClauseBlock.id };
    }
  }

  return {
    type: 'SelectQuery',
    distinct,
    columns,
    from,
    joins,
    where,
    groupBy,
    having,
    orderBy,
    limit,
    blockId: block.id
  };
}

/**
 * Build an AST node for a single item in the SELECT list.
 * Handles `sql_all_columns` (`*`) and `sql_select_item` (expression + alias).
 *
 * @param block - A Blockly block in the COLUMNS statement input.
 * @returns An AST node, or `null` if the block type is unrecognised.
 */
function buildSelectNode(block: Blockly.Block): ASTNode | null {
  if (block.type === BLOCK_ALL_COLUMNS) {
    return { type: 'Literal', value: '*', blockId: block.id };
  }
  if (block.type === BLOCK_SELECT_ITEM) {
    const exprBlock = block.getInputTargetBlock('EXPR');
    const expr = buildExprNode(exprBlock) || { type: 'Literal', value: null, blockId: block.id };
    const alias = block.getFieldValue('ALIAS');
    
    if (alias && alias.trim() !== '') {
      if (expr.type === 'Column' || expr.type === 'Aggregate') {
        expr.alias = alias.trim();
        return expr;
      }
    }
    return expr;
  }
  return null;
}

/**
 * Build an AST expression node from any expression-type Blockly block.
 * Dispatches based on block type to create the appropriate AST node.
 *
 * Handles: `sql_column_expr`, `sql_value`, `sql_comparison`, `sql_logical`,
 * `sql_not`, and `sql_agg_func`.
 *
 * @param block - A Blockly block (or `null` for an empty input).
 * @returns An AST node, or `null` if the block is null/unrecognised.
 */
function buildExprNode(block: Blockly.Block | null): ASTNode | null {
  if (!block) return null;

  if (block.type === BLOCK_COLUMN_EXPR) {
    const table = block.getFieldValue('TABLE');
    const column = block.getFieldValue('COLUMN');
    if (!table || table === NONE_SENTINEL || !column || column === NONE_SENTINEL) {
      return { type: 'Literal', value: null, blockId: block.id };
    }
    return {
      type: 'Column',
      table,
      column,
      alias: null,
      blockId: block.id
    };
  }

  if (block.type === BLOCK_VALUE) {
    const val = block.getFieldValue('VALUE');
    const num = Number(val);
    if (!isNaN(num) && val.trim() !== '') return { type: 'Literal', value: num, blockId: block.id };
    
    const upper = val.toUpperCase();
    if (upper === 'TRUE') return { type: 'Literal', value: true, blockId: block.id };
    if (upper === 'FALSE') return { type: 'Literal', value: false, blockId: block.id };
    if (upper === 'NULL') return { type: 'Literal', value: null, blockId: block.id };
    
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      return { type: 'Literal', value: val, blockId: block.id };
    }
    return { type: 'Literal', value: `'${val}'`, blockId: block.id };
  }

  if (block.type === BLOCK_COMPARISON || block.type === BLOCK_LOGICAL) {
    return {
      type: 'BinaryExpression',
      operator: block.getFieldValue('OP'),
      left: buildExprNode(block.getInputTargetBlock('LEFT')) || { type: 'Literal', value: null },
      right: buildExprNode(block.getInputTargetBlock('RIGHT')) || { type: 'Literal', value: null },
      blockId: block.id
    };
  }

  if (block.type === BLOCK_NOT) {
    return {
      type: 'UnaryExpression',
      operator: 'NOT',
      argument: buildExprNode(block.getInputTargetBlock('EXPR')) || { type: 'Literal', value: null },
      blockId: block.id
    };
  }

  if (block.type === BLOCK_AGG_FUNC) {
    return {
      type: 'Aggregate',
      func: block.getFieldValue('FUNC'),
      argument: buildExprNode(block.getInputTargetBlock('EXPR')) || { type: 'Literal', value: null },
      alias: null,
      blockId: block.id
    };
  }

  return null;
}