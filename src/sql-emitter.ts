/**
 * @module sql-emitter
 *
 * Converts an array of AST {@link SelectQueryNode} trees into a formatted
 * SQL string.  This is the final stage of the compiler pipeline:
 *
 * ```
 * Blockly Workspace → AST (ast-builder) → Optimizer → SQL String (this module)
 * ```
 *
 * @example
 * ```ts
 * const ast = buildAST(workspace);
 * const sql = emitSQL(ast);
 * // "SELECT employees.name\nFROM employees\nWHERE salary > 50000;"
 * ```
 */

import type { ASTNode, SelectQueryNode, TableNode } from './ast';

/**
 * Convert an array of AST root nodes into a single SQL string.
 * Multiple queries are separated by blank lines.
 *
 * @param nodes - Array of AST nodes (typically {@link SelectQueryNode} trees).
 * @returns The formatted SQL string, or a placeholder comment if no nodes.
 */
export function emitSQL(nodes: ASTNode[]): string {
  if (nodes.length === 0) return '-- No query blocks in workspace';
  return nodes.map(node => emitNode(node)).join('\n\n');
}

/**
 * Dispatch a single AST node to the appropriate emitter.
 * Top-level {@link SelectQueryNode}s get full query formatting;
 * all other nodes are treated as expressions.
 */
function emitNode(node: ASTNode): string {
  if (node.type === 'SelectQuery') {
    return emitSelectQuery(node);
  }
  return emitExpr(node);
}

/**
 * Emit a complete SELECT statement from a {@link SelectQueryNode}.
 * Clauses are only included when the corresponding AST field is non-empty/non-null.
 *
 * @param node - The SELECT query AST node.
 * @returns A complete SQL SELECT statement ending with `;`.
 */
function emitSelectQuery(node: SelectQueryNode): string {
  let sql = `SELECT ${node.distinct ? 'DISTINCT ' : ''}`;
  
  if (node.columns.length === 0) {
    sql += '*';
  } else {
    sql += node.columns.map(c => emitExpr(c)).join(', ');
  }

  if (node.from.length > 0) {
    sql += `\nFROM ` + node.from.map(f => emitTable(f)).join(', ');
  }

  if (node.joins.length > 0) {
    sql += '\n' + node.joins.map(j => `${j.joinType} ${emitTable(j.table)} ON ${emitExpr(j.on)}`).join('\n');
  }

  if (node.where) {
    sql += `\nWHERE ${emitExpr(node.where)}`;
  }

  if (node.groupBy.length > 0) {
    sql += `\nGROUP BY ` + node.groupBy.map(g => emitExpr(g)).join(', ');
  }

  if (node.having) {
    sql += `\nHAVING ${emitExpr(node.having)}`;
  }

  if (node.orderBy.length > 0) {
    sql += `\nORDER BY ` + node.orderBy.map(o => `${emitExpr(o.expr)} ${o.direction}`).join(', ');
  }

  if (node.limit !== null) {
    sql += `\nLIMIT ${node.limit.value}`;
  }

  return sql + ';';
}

/**
 * Emit a table reference, including its alias when present.
 *
 * @param node - A {@link TableNode}.
 * @returns `"tableName"` or `"tableName AS alias"`.
 */
function emitTable(node: TableNode): string {
  if (node.alias) {
    return `${node.name} AS ${node.alias}`;
  }
  return node.name;
}

/**
 * Recursively emit any expression node as a SQL fragment.
 * Handles columns, literals, binary/unary expressions, and aggregates.
 * Logical operators (`AND`/`OR`) are wrapped in parentheses for clarity.
 *
 * @param node - Any {@link ASTNode}.
 * @returns The SQL fragment string.
 */
function emitExpr(node: ASTNode): string {
  switch (node.type) {
    case 'Column':
      const col = node.table ? `${node.table}.${node.column}` : node.column;
      return node.alias ? `${col} AS ${node.alias}` : col;
    case 'Literal':
      if (node.value === null) return 'NULL';
      if (typeof node.value === 'boolean') return node.value ? 'TRUE' : 'FALSE';
      return String(node.value);
    case 'BinaryExpression':
      if (node.operator === 'AND' || node.operator === 'OR') {
        return `(${emitExpr(node.left)} ${node.operator} ${emitExpr(node.right)})`;
      }
      return `${emitExpr(node.left)} ${node.operator} ${emitExpr(node.right)}`;
    case 'UnaryExpression':
      return `${node.operator} ${emitExpr(node.argument)}`;
    case 'Aggregate':
      const agg = `${node.func}(${emitExpr(node.argument)})`;
      return node.alias ? `${agg} AS ${node.alias}` : agg;
    default:
      return '';
  }
}