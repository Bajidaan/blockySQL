/**
 * @module validator
 *
 * Performs semantic validation on the SQL AST by walking each
 * {@link SelectQueryNode} and checking for logical errors that cannot
 * be caught by Blockly's connection-type system alone.
 *
 * Each issue includes the `blockId` of the offending Blockly block so that
 * `main.ts` can attach a visual warning icon directly to it.
 *
 * ## Validation Rules
 *
 * | # | Rule | Severity |
 * |---|------|----------|
 * | 1 | Missing FROM clause | warning |
 * | 2 | Unresolved column reference (table or column not in schema) | error |
 * | 3 | Type mismatch in comparisons (e.g. INTEGER vs TEXT) | warning |
 * | 4 | Aggregation without GROUP BY | warning |
 * | 5 | Non-aggregated column in a grouped query | error |
 */

import type { ASTNode, SelectQueryNode, ColumnNode } from './ast';
import type { Schema } from './ast-builder';

/**
 * A single validation issue found during semantic analysis.
 *
 * @property blockId  - The Blockly block ID where the issue originates.
 * @property message  - Human-readable description of the problem.
 * @property severity - `'error'` for logical errors, `'warning'` for suspicious patterns.
 */
export interface ValidationIssue {
  blockId: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate an array of query ASTs against the given schema.
 *
 * @param ast    - Array of {@link SelectQueryNode} trees produced by `buildAST`.
 * @param schema - Table/column metadata produced by `buildSchema`.
 * @returns An array of {@link ValidationIssue} objects (empty if no problems found).
 *
 * @example
 * ```ts
 * const ast = buildAST(workspace);
 * const schema = buildSchema(workspace);
 * const issues = validateQuery(ast, schema);
 * // issues: [{ blockId: "abc123", message: "Column 'foo' does not exist…", severity: "error" }]
 * ```
 */
export function validateQuery(ast: SelectQueryNode[], schema: Schema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const query of ast) {
    // Rule 1: Missing FROM clause
    if (query.from.length === 0 && query.blockId) {
      issues.push({
        blockId: query.blockId,
        message: 'Query has no FROM clause. Is this intended?',
        severity: 'warning'
      });
    }

    // Build a lookup of table names/aliases available in this query scope
    const availableTables = new Map<string, string>();
    for (const f of query.from) {
      availableTables.set(f.alias || f.name, f.name);
    }
    for (const j of query.joins) {
      availableTables.set(j.table.alias || j.table.name, j.table.name);
    }

    walkAST(query, query, schema, availableTables, issues);
  }

  return issues;
}

/**
 * Recursively walk an AST subtree, applying validation rules to each node.
 *
 * @param node            - The current AST node being inspected.
 * @param query           - The root {@link SelectQueryNode} (for aggregation context).
 * @param schema          - Table/column metadata from the workspace schema definitions.
 * @param availableTables - Map of `alias|name → actualTableName` for scope resolution.
 * @param issues          - Accumulator array; issues are pushed here as they are found.
 */
function walkAST(
  node: ASTNode,
  query: SelectQueryNode,
  schema: Schema,
  availableTables: Map<string, string>,
  issues: ValidationIssue[]
) {
  // ── Rule 2: Unresolved column reference ────────────────────────────────
  if (node.type === 'Column') {
    if (node.table && node.column) {
      const actualTableName = availableTables.get(node.table);
      if (!actualTableName) {
        if (node.blockId) {
          issues.push({
            blockId: node.blockId,
            message: `Table alias/name '${node.table}' not found in FROM/JOIN.`,
            severity: 'error'
          });
        }
      } else {
        const tableSchema = schema[actualTableName];
        if (tableSchema && !tableSchema.columns[node.column]) {
          if (node.blockId) {
            issues.push({
              blockId: node.blockId,
              message: `Column '${node.column}' does not exist in table '${actualTableName}'.`,
              severity: 'error'
            });
          }
        }
      }
    }
  }

  // ── Rule 3: Type mismatch in comparisons ───────────────────────────────
  if (node.type === 'BinaryExpression') {
    // Column vs Literal
    if (node.left.type === 'Column' && node.right.type === 'Literal') {
      checkColumnLiteralMismatch(node.left, node.right, node.blockId, schema, availableTables, issues);
    }
    if (node.right.type === 'Column' && node.left.type === 'Literal') {
      checkColumnLiteralMismatch(node.right, node.left, node.blockId, schema, availableTables, issues);
    }
    // Column vs Column
    if (node.left.type === 'Column' && node.right.type === 'Column') {
      const typeLeft = getColumnType(node.left, schema, availableTables);
      const typeRight = getColumnType(node.right, schema, availableTables);
      if (typeLeft && typeRight && typeLeft !== typeRight) {
        if (node.blockId) {
          issues.push({
            blockId: node.blockId,
            message: `Type mismatch: comparing '${typeLeft}' column to '${typeRight}' column.`,
            severity: 'warning'
          });
        }
      }
    }
  }

  // ── Recurse into child nodes ───────────────────────────────────────────
  switch (node.type) {
    case 'SelectQuery':
      for (const c of node.columns) walkAST(c, query, schema, availableTables, issues);
      for (const j of node.joins) walkAST(j.on, query, schema, availableTables, issues);
      if (node.where) walkAST(node.where, query, schema, availableTables, issues);
      for (const g of node.groupBy) walkAST(g, query, schema, availableTables, issues);
      if (node.having) walkAST(node.having, query, schema, availableTables, issues);
      for (const o of node.orderBy) walkAST(o.expr, query, schema, availableTables, issues);

      // Rules 4 & 5: Aggregation checks (only at query level)
      checkAggregationRules(node, issues);
      break;
    case 'BinaryExpression':
      walkAST(node.left, query, schema, availableTables, issues);
      walkAST(node.right, query, schema, availableTables, issues);
      break;
    case 'UnaryExpression':
    case 'Aggregate':
      walkAST(node.argument, query, schema, availableTables, issues);
      break;
    case 'OrderBy':
      walkAST(node.expr, query, schema, availableTables, issues);
      break;
  }
}

/**
 * Check if a column-to-literal comparison has a type mismatch.
 * E.g. comparing an INTEGER column to a non-numeric string literal.
 */
function checkColumnLiteralMismatch(
  col: ColumnNode,
  lit: import('./ast').LiteralNode,
  blockId: string | undefined,
  schema: Schema,
  availableTables: Map<string, string>,
  issues: ValidationIssue[]
) {
  const type = getColumnType(col, schema, availableTables);
  if (type === 'INTEGER' || type === 'REAL') {
    if (typeof lit.value === 'string' && !lit.value.match(/^['"]?\d+(\.\d+)?['"]?$/)) {
      if (blockId) {
        issues.push({
          blockId,
          message: `Type mismatch: comparing numeric column to a string.`,
          severity: 'warning'
        });
      }
    }
  } else if (type === 'TEXT') {
    if (typeof lit.value === 'number') {
      if (blockId) {
        issues.push({
          blockId,
          message: `Type mismatch: comparing TEXT column to a number.`,
          severity: 'warning'
        });
      }
    }
  }
}

/**
 * Look up the declared data type of a column from the schema.
 *
 * @param col             - The column node to look up.
 * @param schema          - The workspace schema.
 * @param availableTables - Alias-to-name mapping for scope resolution.
 * @returns The column type string (e.g. `'INTEGER'`, `'TEXT'`), or `null` if not found.
 */
function getColumnType(
  col: ColumnNode,
  schema: Schema,
  availableTables: Map<string, string>
): string | null {
  if (!col.table) return null;
  const actualTableName = availableTables.get(col.table);
  if (!actualTableName) return null;
  const tableSchema = schema[actualTableName];
  if (!tableSchema) return null;
  const colDef = tableSchema.columns[col.column];
  if (!colDef) return null;
  return colDef.type;
}

/**
 * Check aggregation-related semantic rules (Rules 4 and 5).
 *
 * - **Rule 4**: Mixing aggregates and raw columns without GROUP BY.
 * - **Rule 5**: Selecting a column that isn't in the GROUP BY clause.
 *
 * @param query  - The {@link SelectQueryNode} to analyse.
 * @param issues - Accumulator array for found issues.
 */
function checkAggregationRules(query: SelectQueryNode, issues: ValidationIssue[]) {
  let hasAggregate = false;
  let hasRawColumn = false;
  const rawColumnNodes: ColumnNode[] = [];

  for (const c of query.columns) {
    if (c.type === 'Aggregate') {
      hasAggregate = true;
    } else if (c.type === 'Column') {
      hasRawColumn = true;
      rawColumnNodes.push(c);
    } else if (c.type === 'Literal' && c.value === '*') {
      hasRawColumn = true;
    }
  }

  // Rule 4: Aggregation without GROUP BY
  if (hasAggregate && query.groupBy.length === 0 && hasRawColumn) {
    for (const c of query.columns) {
      if (c.type === 'Aggregate' && c.blockId) {
        issues.push({
          blockId: c.blockId,
          message: 'Query mixes raw columns and aggregates without a GROUP BY clause.',
          severity: 'warning'
        });
      }
    }
  }

  // Rule 5: Non-aggregated column in grouped query
  if (query.groupBy.length > 0 && hasRawColumn) {
    const groupedCols = new Set<string>();
    for (const g of query.groupBy) {
      if (g.type === 'Column') {
        groupedCols.add(`${g.table}.${g.column}`);
      }
    }

    for (const rawCol of rawColumnNodes) {
      const colIdentifier = `${rawCol.table}.${rawCol.column}`;
      if (!groupedCols.has(colIdentifier) && rawCol.blockId) {
        issues.push({
          blockId: rawCol.blockId,
          message: `Column '${rawCol.column}' must appear in the GROUP BY clause or be used in an aggregate function.`,
          severity: 'error'
        });
      }
    }
  }
}
