import * as Blockly from 'blockly';
import type {
  ASTNode,
  SelectQueryNode,
  TableNode,
  JoinNode,
  OrderByNode,
  LimitNode
} from './ast';

export interface ColumnSchema {
  type: string;
}

export interface TableSchema {
  columns: Record<string, ColumnSchema>;
}

export type Schema = Record<string, TableSchema>;

export function buildSchema(workspace: Blockly.Workspace): Schema {
  const schema: Schema = {};
  const tableDefs = workspace.getBlocksByType('sql_define_table');
  
  for (const block of tableDefs) {
    const tableName = block.getFieldValue('TABLE_NAME');
    if (!tableName) continue;
    
    const tableSchema: TableSchema = { columns: {} };
    let colBlock = block.getInputTargetBlock('COLUMNS');
    while (colBlock) {
      if (colBlock.type === 'sql_define_column') {
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

export function buildAST(workspace: Blockly.Workspace): SelectQueryNode[] {
  const topBlocks = workspace.getTopBlocks(true);
  const queries: SelectQueryNode[] = [];

  for (const block of topBlocks) {
    if (block.type === 'sql_query') {
      queries.push(buildQueryNode(block));
    }
  }

  return queries;
}

function buildQueryNode(block: Blockly.Block): SelectQueryNode {
  const distinct = block.getFieldValue('DISTINCT') === 'TRUE';
  
  // COLUMNS
  const columns: ASTNode[] = [];
  let colBlock = block.getInputTargetBlock('COLUMNS');
  while (colBlock) {
    const node = buildSelectNode(colBlock);
    if (node) columns.push(node);
    colBlock = colBlock.getNextBlock();
  }

  // FROM & JOINS
  const from: TableNode[] = [];
  const joins: JoinNode[] = [];
  let fromBlock = block.getInputTargetBlock('FROM');
  while (fromBlock) {
    if (fromBlock.type === 'sql_from_table') {
      const name = fromBlock.getFieldValue('TABLE');
      if (name && name !== 'NONE') {
        from.push({
          type: 'Table',
          name,
          alias: fromBlock.getFieldValue('ALIAS') || null,
          blockId: fromBlock.id
        });
      }
    } else if (fromBlock.type === 'sql_join') {
      const name = fromBlock.getFieldValue('TABLE');
      if (name && name !== 'NONE') {
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

  // WHERE
  let where: ASTNode | null = null;
  const whereClauseBlock = block.getInputTargetBlock('WHERE');
  if (whereClauseBlock && whereClauseBlock.type === 'sql_where') {
    where = buildExprNode(whereClauseBlock.getInputTargetBlock('CONDITION')) || { type: 'Literal', value: true, blockId: whereClauseBlock.id };
  }

  // GROUP BY
  const groupBy: ASTNode[] = [];
  let groupBlock = block.getInputTargetBlock('GROUP_BY');
  while (groupBlock) {
    if (groupBlock.type === 'sql_group_by') {
      const expr = buildExprNode(groupBlock.getInputTargetBlock('EXPR'));
      if (expr) groupBy.push(expr);
    }
    groupBlock = groupBlock.getNextBlock();
  }

  // HAVING
  let having: ASTNode | null = null;
  const havingClauseBlock = block.getInputTargetBlock('HAVING');
  if (havingClauseBlock && havingClauseBlock.type === 'sql_having') {
    having = buildExprNode(havingClauseBlock.getInputTargetBlock('CONDITION')) || { type: 'Literal', value: true, blockId: havingClauseBlock.id };
  }

  // ORDER BY
  const orderBy: OrderByNode[] = [];
  let orderBlock = block.getInputTargetBlock('ORDER_BY');
  while (orderBlock) {
    if (orderBlock.type === 'sql_order_by') {
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

  // LIMIT
  let limit: LimitNode | null = null;
  const limitClauseBlock = block.getInputTargetBlock('LIMIT');
  if (limitClauseBlock && limitClauseBlock.type === 'sql_limit') {
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

function buildSelectNode(block: Blockly.Block): ASTNode | null {
  if (block.type === 'sql_all_columns') {
    return { type: 'Literal', value: '*', blockId: block.id };
  }
  if (block.type === 'sql_select_item') {
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

function buildExprNode(block: Blockly.Block | null): ASTNode | null {
  if (!block) return null;

  if (block.type === 'sql_column_expr') {
    const table = block.getFieldValue('TABLE');
    const column = block.getFieldValue('COLUMN');
    if (!table || table === 'NONE' || !column || column === 'NONE') return { type: 'Literal', value: null, blockId: block.id };
    return {
      type: 'Column',
      table,
      column,
      alias: null,
      blockId: block.id
    };
  }

  if (block.type === 'sql_value') {
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

  if (block.type === 'sql_comparison' || block.type === 'sql_logical') {
    return {
      type: 'BinaryExpression',
      operator: block.getFieldValue('OP'),
      left: buildExprNode(block.getInputTargetBlock('LEFT')) || { type: 'Literal', value: null },
      right: buildExprNode(block.getInputTargetBlock('RIGHT')) || { type: 'Literal', value: null },
      blockId: block.id
    };
  }

  if (block.type === 'sql_not') {
    return {
      type: 'UnaryExpression',
      operator: 'NOT',
      argument: buildExprNode(block.getInputTargetBlock('EXPR')) || { type: 'Literal', value: null },
      blockId: block.id
    };
  }

  if (block.type === 'sql_agg_func') {
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
