/**
 * @module ast
 *
 * TypeScript interfaces defining the Abstract Syntax Tree (AST) for SQL
 * SELECT queries. Each node type maps directly to a SQL construct
 * (e.g., {@link ColumnNode} → `table.column`, {@link JoinNode} → `JOIN ... ON ...`).
 *
 * The AST is produced by {@link ast-builder.buildAST} and consumed by:
 * - {@link sql-emitter.emitSQL} to generate a SQL string
 * - {@link validator.validateQuery} for semantic analysis
 * - {@link optimizer.optimizeAST} for query simplification
 */

/**
 * Base interface shared by all AST nodes.
 *
 * @property blockId - Optional Blockly block ID that produced this node.
 *   Used by the validator to attach warnings directly to blocks in the UI.
 */
export interface BaseNode {
  blockId?: string;
}

/**
 * Discriminated union of every node type that can appear in the AST.
 * The `type` field acts as the discriminant for exhaustive pattern matching.
 */
export type ASTNode =
  | SelectQueryNode
  | ColumnNode
  | TableNode
  | JoinNode
  | BinaryExpressionNode
  | UnaryExpressionNode
  | LiteralNode
  | AggregateNode
  | OrderByNode
  | LimitNode;

/**
 * Root node representing a complete `SELECT` query.
 *
 * @example
 * ```sql
 * SELECT DISTINCT col1, col2
 * FROM table1
 * INNER JOIN table2 ON table1.id = table2.fk
 * WHERE col1 > 10
 * GROUP BY col1
 * HAVING COUNT(*) > 5
 * ORDER BY col1 ASC
 * LIMIT 100
 * ```
 */
export interface SelectQueryNode extends BaseNode {
  type: 'SelectQuery';
  /** Whether the DISTINCT keyword is applied to the SELECT. */
  distinct: boolean;
  /** The expressions in the SELECT list (columns, aggregates, or `*`). */
  columns: ASTNode[];
  /** Tables referenced in the FROM clause. */
  from: TableNode[];
  /** JOIN clauses attached after the FROM tables. */
  joins: JoinNode[];
  /** The WHERE condition expression, or `null` if omitted. */
  where: ASTNode | null;
  /** Expressions in the GROUP BY clause. */
  groupBy: ASTNode[];
  /** The HAVING condition expression, or `null` if omitted. */
  having: ASTNode | null;
  /** ORDER BY items with direction (ASC/DESC). */
  orderBy: OrderByNode[];
  /** LIMIT clause, or `null` if omitted. */
  limit: LimitNode | null;
}

/**
 * A column reference, e.g. `employees.salary` or `salary`.
 *
 * @property table  - Qualifying table name/alias, or `null` for unqualified.
 * @property column - The column name.
 * @property alias  - Optional AS alias, or `null`.
 */
export interface ColumnNode extends BaseNode {
  type: 'Column';
  table: string | null;
  column: string;
  alias: string | null;
}

/**
 * A table reference in the FROM clause, e.g. `employees AS e`.
 *
 * @property name  - The table name as defined in the schema.
 * @property alias - Optional AS alias, or `null`.
 */
export interface TableNode extends BaseNode {
  type: 'Table';
  name: string;
  alias: string | null;
}

/**
 * A JOIN clause, e.g. `INNER JOIN departments AS d ON e.dept_id = d.id`.
 *
 * @property joinType - One of 'INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL JOIN'.
 * @property table    - The table being joined.
 * @property on       - The ON condition expression.
 */
export interface JoinNode extends BaseNode {
  type: 'Join';
  joinType: string;
  table: TableNode;
  on: ASTNode;
}

/**
 * A binary expression such as `a = b`, `x AND y`, or `price > 100`.
 *
 * @property operator - The SQL operator ('=', '!=', '<', '>', '<=', '>=', 'AND', 'OR').
 * @property left     - Left-hand operand.
 * @property right    - Right-hand operand.
 */
export interface BinaryExpressionNode extends BaseNode {
  type: 'BinaryExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

/**
 * A unary expression such as `NOT condition`.
 *
 * @property operator - The SQL unary operator (currently only 'NOT').
 * @property argument - The operand expression.
 */
export interface UnaryExpressionNode extends BaseNode {
  type: 'UnaryExpression';
  operator: string;
  argument: ASTNode;
}

/**
 * A literal value: number, string, boolean, `null`, or the special `'*'` wildcard.
 *
 * @property value - The literal's JavaScript value. Strings representing SQL
 *   keywords (TRUE/FALSE/NULL) are stored as their JS equivalents (`true`/`false`/`null`).
 */
export interface LiteralNode extends BaseNode {
  type: 'Literal';
  value: string | number | boolean | null;
}

/**
 * An aggregate function call, e.g. `COUNT(*)`, `SUM(salary)`.
 *
 * @property func     - The aggregate function name ('COUNT', 'SUM', 'AVG', 'MIN', 'MAX').
 * @property argument - The expression inside the parentheses.
 * @property alias    - Optional AS alias, or `null`.
 */
export interface AggregateNode extends BaseNode {
  type: 'Aggregate';
  func: string;
  argument: ASTNode;
  alias: string | null;
}

/**
 * An ORDER BY item with a direction, e.g. `salary DESC`.
 *
 * @property expr      - The expression to sort by.
 * @property direction - Sort direction, either 'ASC' or 'DESC'.
 */
export interface OrderByNode extends BaseNode {
  type: 'OrderBy';
  expr: ASTNode;
  direction: 'ASC' | 'DESC';
}

/**
 * A LIMIT clause, e.g. `LIMIT 100`.
 *
 * @property value - The maximum number of rows to return.
 */
export interface LimitNode extends BaseNode {
  type: 'Limit';
  value: number;
}