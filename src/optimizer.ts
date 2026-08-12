/**
 * @module optimizer
 *
 * AST-to-AST transformation passes that simplify SQL queries before
 * they are emitted as SQL strings.  The optimizer sits between the
 * validator and the emitter in the compiler pipeline:
 *
 * ```
 * Blocks → AST → Validator → **Optimizer** → SQL Emitter
 * ```
 *
 * ## Optimization Passes
 *
 * | Pass | Description | Example |
 * |------|-------------|---------|
 * | Constant folding | Evaluate static comparisons at compile time | `5 > 3` → `TRUE` |
 * | Boolean simplification | Remove identity / annihilator elements | `TRUE AND x` → `x` |
 * | Duplicate elimination | Collapse identical sub-trees in AND/OR | `x AND x` → `x` |
 * | Column deduplication | Remove duplicate columns in SELECT | `a, b, a` → `a, b` |
 */

import type {
  ASTNode,
  SelectQueryNode,
  LiteralNode
} from './ast';

/**
 * Optimise an array of query ASTs by applying all transformation passes.
 *
 * @param queries - The unoptimised AST trees from `buildAST`.
 * @returns A new array of optimised AST trees (originals are not mutated).
 *
 * @example
 * ```ts
 * const ast = buildAST(workspace);
 * const optimised = optimizeAST(ast);
 * const sql = emitSQL(optimised); // cleaner SQL
 * ```
 */
export function optimizeAST(queries: SelectQueryNode[]): SelectQueryNode[] {
  return queries.map(optimizeQuery);
}

/**
 * Apply all optimisation passes to a single query node.
 * Returns a shallow copy with optimised children — the original is not mutated.
 */
function optimizeQuery(query: SelectQueryNode): SelectQueryNode {
  return {
    ...query,
    columns: deduplicateColumns(query.columns),
    where: query.where ? optimizeExpression(query.where) : null,
    groupBy: query.groupBy.map(optimizeExpression),
    having: query.having ? optimizeExpression(query.having) : null
  };
}

// ── Column Deduplication ──────────────────────────────────────────────────

/**
 * Remove duplicate columns from the SELECT list.
 * Two columns are considered equal if they reference the same `table.column`.
 *
 * @param columns - The original column list.
 * @returns A new array with duplicates removed (first occurrence kept).
 */
function deduplicateColumns(columns: ASTNode[]): ASTNode[] {
  const seen = new Set<string>();
  const unique: ASTNode[] = [];

  for (const col of columns) {
    const key = columnKey(col);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(col);
    }
  }

  return unique;
}

/**
 * Produce a canonical string key for a column node so duplicates can be detected.
 */
function columnKey(col: ASTNode): string {
  switch (col.type) {
    case 'Column':    return `col:${col.table}.${col.column}`;
    case 'Literal':   return `lit:${col.value}`;
    case 'Aggregate': return `agg:${col.func}(${JSON.stringify(col.argument)})`;
    default:          return JSON.stringify(col);
  }
}

// ── Expression Optimisation ───────────────────────────────────────────────

/**
 * Recursively optimise an expression subtree.
 * Applies constant folding, boolean simplification, and NOT elimination.
 *
 * @param node - Any expression AST node.
 * @returns An optimised replacement node (may be the same reference if unchanged).
 */
function optimizeExpression(node: ASTNode): ASTNode {
  if (node.type === 'BinaryExpression') {
    const left = optimizeExpression(node.left);
    const right = optimizeExpression(node.right);

    // Constant folding: both sides are literals → evaluate at compile time
    if (left.type === 'Literal' && right.type === 'Literal') {
      return foldConstants(left, right, node.operator, node.blockId);
    }

    // Boolean simplification for AND / OR
    const op = node.operator.toUpperCase();
    if (op === 'AND') {
      if (isDeepEqual(left, right)) return left;          // x AND x → x
      if (isLiteralBoolean(left, true)) return right;     // TRUE AND x → x
      if (isLiteralBoolean(right, true)) return left;     // x AND TRUE → x
      if (isLiteralBoolean(left, false)) return left;     // FALSE AND x → FALSE
      if (isLiteralBoolean(right, false)) return right;   // x AND FALSE → FALSE
    } else if (op === 'OR') {
      if (isDeepEqual(left, right)) return left;          // x OR x → x
      if (isLiteralBoolean(left, true)) return left;      // TRUE OR x → TRUE
      if (isLiteralBoolean(right, true)) return right;    // x OR TRUE → TRUE
      if (isLiteralBoolean(left, false)) return right;    // FALSE OR x → x
      if (isLiteralBoolean(right, false)) return left;    // x OR FALSE → x
    }

    return { ...node, left, right };
  }

  if (node.type === 'UnaryExpression') {
    const argument = optimizeExpression(node.argument);

    // NOT simplification
    if (node.operator.toUpperCase() === 'NOT') {
      if (argument.type === 'Literal') {
        const val = argument.value;
        if (typeof val === 'string') {
          if (val.toUpperCase() === 'TRUE') return { type: 'Literal', value: 'FALSE', blockId: node.blockId };
          if (val.toUpperCase() === 'FALSE') return { type: 'Literal', value: 'TRUE', blockId: node.blockId };
        } else if (typeof val === 'boolean') {
          return { type: 'Literal', value: !val, blockId: node.blockId };
        }
      }
      
      // NOT NOT x → x (double negation elimination)
      if (argument.type === 'UnaryExpression' && argument.operator.toUpperCase() === 'NOT') {
        return argument.argument;
      }
    }

    return { ...node, argument };
  }

  return node;
}

// ── Constant Folding ──────────────────────────────────────────────────────

/**
 * Evaluate a binary expression where both operands are literal values.
 * Supports comparison operators (`=`, `!=`, `<`, `>`, `<=`, `>=`)
 * and logical operators (`AND`, `OR`).
 *
 * @param left     - Left literal operand.
 * @param right    - Right literal operand.
 * @param operator - The SQL operator.
 * @param blockId  - Optional block ID to preserve for UI warnings.
 * @returns A new {@link LiteralNode} containing the folded result.
 */
function foldConstants(left: LiteralNode, right: LiteralNode, operator: string, blockId?: string): LiteralNode {
  let lVal: string | number | boolean | null = left.value;
  let rVal: string | number | boolean | null = right.value;

  // Normalise boolean string representations to native booleans
  if (typeof lVal === 'string') {
    const upper = lVal.toUpperCase();
    if (upper === 'TRUE') lVal = true;
    else if (upper === 'FALSE') lVal = false;
  }
  if (typeof rVal === 'string') {
    const upper = rVal.toUpperCase();
    if (upper === 'TRUE') rVal = true;
    else if (upper === 'FALSE') rVal = false;
  }

  let result: boolean | null = null;
  switch (operator) {
    case '=':   result = lVal === rVal; break;
    case '!=':  result = lVal !== rVal; break;
    case '<':   result = (lVal as number) < (rVal as number); break;
    case '<=':  result = (lVal as number) <= (rVal as number); break;
    case '>':   result = (lVal as number) > (rVal as number); break;
    case '>=':  result = (lVal as number) >= (rVal as number); break;
    case 'AND': result = Boolean(lVal && rVal); break;
    case 'OR':  result = Boolean(lVal || rVal); break;
  }

  if (result !== null) {
    return { type: 'Literal', value: result ? 'TRUE' : 'FALSE', blockId };
  }

  return { type: 'Literal', value: 'NULL', blockId };
}

// ── Helper Utilities ──────────────────────────────────────────────────────

/**
 * Check whether a node is a literal boolean with the given truth value.
 * Only matches string representations (`'TRUE'` / `'FALSE'`).
 */
function isLiteralBoolean(node: ASTNode, val: boolean): boolean {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value.toUpperCase() === (val ? 'TRUE' : 'FALSE');
  }
  return false;
}

/**
 * Deep structural equality check for two AST subtrees.
 * Ignores `blockId` fields so that structurally identical nodes from
 * different Blockly blocks are considered equal.
 *
 * Used to detect `x AND x → x` simplifications.
 */
function isDeepEqual(a: ASTNode, b: ASTNode): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keysA = Object.keys(a).filter(k => k !== 'blockId');
  const keysB = Object.keys(b).filter(k => k !== 'blockId');
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!isDeepEqual((a as unknown as Record<string, unknown>)[key] as ASTNode, (b as unknown as Record<string, unknown>)[key] as ASTNode)) return false;
  }
  return true;
}
