import type { ASTNode, SelectQueryNode } from './ast';
import type { Schema } from './ast-builder';

export interface ValidationIssue {
  blockId: string;
  message: string;
  severity: 'error' | 'warning';
}

export function validateQuery(ast: SelectQueryNode[], schema: Schema): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const query of ast) {
    // Missing FROM: SELECT without a FROM clause -> warning
    if (query.from.length === 0 && query.blockId) {
      issues.push({
        blockId: query.blockId,
        message: 'Query has no FROM clause. Is this intended?',
        severity: 'warning'
      });
    }

    // Build a set of available tables/aliases in this query
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

function walkAST(
  node: ASTNode,
  query: SelectQueryNode,
  schema: Schema,
  availableTables: Map<string, string>,
  issues: ValidationIssue[]
) {
  if (node.type === 'Column') {
    // Unresolved column reference
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

  if (node.type === 'BinaryExpression') {
    // Type mismatch in comparisons
    if (node.left.type === 'Column' && node.right.type === 'Literal') {
      const type = getColumnType(node.left, schema, availableTables);
      if (type === 'INTEGER' || type === 'REAL') {
        if (typeof node.right.value === 'string' && !node.right.value.match(/^['"]?\d+(\.\d+)?['"]?$/)) {
          if (node.blockId) {
            issues.push({
              blockId: node.blockId,
              message: `Type mismatch: comparing numeric column to a string.`,
              severity: 'warning'
            });
          }
        }
      }
    }
    if (node.right.type === 'Column' && node.left.type === 'Literal') {
      const type = getColumnType(node.right, schema, availableTables);
      if (type === 'INTEGER' || type === 'REAL') {
        if (typeof node.left.value === 'string' && !node.left.value.match(/^['"]?\d+(\.\d+)?['"]?$/)) {
          if (node.blockId) {
            issues.push({
              blockId: node.blockId,
              message: `Type mismatch: comparing numeric column to a string.`,
              severity: 'warning'
            });
          }
        }
      }
    }
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

  switch (node.type) {
    case 'SelectQuery':
      for (const c of node.columns) walkAST(c, query, schema, availableTables, issues);
      for (const j of node.joins) walkAST(j.on, query, schema, availableTables, issues);
      if (node.where) walkAST(node.where, query, schema, availableTables, issues);
      for (const g of node.groupBy) walkAST(g, query, schema, availableTables, issues);
      if (node.having) walkAST(node.having, query, schema, availableTables, issues);
      for (const o of node.orderBy) walkAST(o.expr, query, schema, availableTables, issues);

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

function getColumnType(col: import('./ast').ColumnNode, schema: Schema, availableTables: Map<string, string>): string | null {
  if (!col.table) return null;
  const actualTableName = availableTables.get(col.table);
  if (!actualTableName) return null;
  const tableSchema = schema[actualTableName];
  if (!tableSchema) return null;
  const colDef = tableSchema.columns[col.column];
  if (!colDef) return null;
  return colDef.type;
}

function checkAggregationRules(query: SelectQueryNode, issues: ValidationIssue[]) {
  let hasAggregate = false;
  let hasRawColumn = false;
  const rawColumnNodes: import('./ast').ColumnNode[] = [];

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

  // Aggregation without GROUP BY 
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

  // Non-aggregated column in grouped query
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
