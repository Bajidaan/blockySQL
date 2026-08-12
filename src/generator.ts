/**
 * @module generator
 *
 * Blockly code generator that produces raw SQL strings directly from the
 * block tree using Blockly's built-in string-concatenation generator API.
 *
 * This is the "direct" code path that runs in parallel with the AST pipeline.
 * It serves as the **Original Query** output in the UI.
 *
 * Each block type has a `forBlock` handler that returns either:
 * - A `string` (for statement blocks that stack vertically), or
 * - A `[string, number]` tuple (for value blocks, where the number is precedence).
 *
 * @see {@link ast-builder} for the AST-based alternative pipeline.
 */

import * as Blockly from 'blockly';

export const generator = new Blockly.Generator('SQL');

/** Use two-space indentation for nested SQL (not currently used but available). */
generator.INDENT = '  ';

/**
 * Blockly's `scrub_` hook is called after every block's code is generated.
 * It appends the code from the next connected block in a statement stack.
 */
generator.scrub_ = function (block: Blockly.Block, code: string, thisOnly?: boolean): string {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  let nextCode = '';
  if (nextBlock && !thisOnly) {
    nextCode = generator.blockToCode(nextBlock) as string;
  }
  return code + nextCode;
};

// ── Schema Blocks (no SQL output) ────────────────────────────────────────

/** Schema definitions produce no SQL output. */
generator.forBlock['sql_define_table'] = function (): string {
  return '';
};

/** Schema definitions produce no SQL output. */
generator.forBlock['sql_define_column'] = function (): string {
  return '';
};

// ── SELECT Query ─────────────────────────────────────────────────────────

/**
 * Generate a complete `SELECT ... FROM ... WHERE ...` statement.
 * Assembles all clause sub-generators into a single SQL string.
 */
generator.forBlock['sql_query'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const distinct = block.getFieldValue('DISTINCT') === 'TRUE' ? 'DISTINCT ' : '';

  const columnsRaw = generator.statementToCode(block, 'COLUMNS');
  const columns = columnsRaw.split(',\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .join(', ');

  const fromRaw = generator.statementToCode(block, 'FROM');
  const from = fromRaw
    .split('\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .join('\n');

  const whereRaw = generator.statementToCode(block, 'WHERE');
  const where = whereRaw.trim();

  const groupByRaw = generator.statementToCode(block, 'GROUP_BY');
  const groupBy = groupByRaw
    .split(',\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .join(', ');

  const havingRaw = generator.statementToCode(block, 'HAVING');
  const having = havingRaw.trim();

  const orderByRaw = generator.statementToCode(block, 'ORDER_BY');
  const orderBy = orderByRaw
    .split(',\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .join(', ');

  const limitRaw = generator.statementToCode(block, 'LIMIT');
  const limit = limitRaw.trim();

  let sql = `SELECT ${distinct}${columns || '*'}`;

  if (from) {
    sql += `\nFROM ${from}`;
  }

  if (where) {
    sql += `\n${where}`;
  }

  if (groupBy) {
    sql += `\nGROUP BY ${groupBy}`;
  }

  if (having) {
    sql += `\n${having}`;
  }

  if (orderBy) {
    sql += `\nORDER BY ${orderBy}`;
  }

  if (limit) {
    sql += `\n${limit}`;
  }

  return sql + ';\n';
};

// ── SELECT List Blocks ───────────────────────────────────────────────────

/** Generate `*` for ALL COLUMNS. */
generator.forBlock['sql_all_columns'] = function (): string {
  return '*,\n';
};

/** Generate `expr` or `expr AS alias` for a select item. */
generator.forBlock['sql_select_item'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  const alias = block.getFieldValue('ALIAS').trim();

  const sql = alias.length > 0 ? `${expr} AS ${alias}` : expr;
  return sql + ',\n';
};

/** Generate `table.column` as a value expression. */
generator.forBlock['sql_column_expr'] = function (
  block: Blockly.Block
): [string, number] {
  const table = block.getFieldValue('TABLE');
  const column = block.getFieldValue('COLUMN');

  if (!table || table === 'NONE' || !column || column === 'NONE') {
    return ['NULL', 0];
  }

  return [`${table}.${column}`, 0];
};

// ── FROM / JOIN Blocks ───────────────────────────────────────────────────

/** Generate `tableName` or `tableName AS alias` for a FROM table reference. */
generator.forBlock['sql_from_table'] = function (
  block: Blockly.Block,
): string {
  const table = block.getFieldValue('TABLE');
  const alias = block.getFieldValue('ALIAS');

  if (!table || table === 'NONE') {
    return '';
  }

  let sql = table;
  if (alias && alias.trim().length > 0) {
    sql += ` AS ${alias.trim()}`;
  }

  const nextBlock = block.getNextBlock();
  if (nextBlock && nextBlock.type === 'sql_join') {
    return sql + '\n';
  }

  return sql + ',\n';
};

/** Generate `JOIN_TYPE table [AS alias] ON condition`. */
generator.forBlock['sql_join'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const joinType = block.getFieldValue('JOIN_TYPE');
  const table = block.getFieldValue('TABLE');
  const alias = block.getFieldValue('ALIAS');
  const onCondition = generator.valueToCode(block, 'ON', 0) || 'TRUE';

  if (!table || table === 'NONE') {
    return '';
  }

  let sql = `${joinType} ${table}`;
  if (alias && alias.trim().length > 0) {
    sql += ` AS ${alias.trim()}`;
  }

  sql += ` ON ${onCondition}`;

  const nextBlock = block.getNextBlock();
  if (nextBlock && nextBlock.type === 'sql_join') {
    return sql + '\n';
  }

  return sql + '\n';
};

// ── WHERE / Condition Blocks ─────────────────────────────────────────────

/** Generate `WHERE condition`. */
generator.forBlock['sql_where'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const condition = generator.valueToCode(block, 'CONDITION', 0) || 'TRUE';
  return `WHERE ${condition}\n`;
};

/** Generate `left OP right` for comparison operators. */
generator.forBlock['sql_comparison'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const left = generator.valueToCode(block, 'LEFT', 0) || 'NULL';
  const right = generator.valueToCode(block, 'RIGHT', 0) || 'NULL';
  const op = block.getFieldValue('OP');
  return [`${left} ${op} ${right}`, 0];
};

/** Generate `(left AND/OR right)` for logical operators. */
generator.forBlock['sql_logical'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const left = generator.valueToCode(block, 'LEFT', 0) || 'TRUE';
  const right = generator.valueToCode(block, 'RIGHT', 0) || 'TRUE';
  const op = block.getFieldValue('OP');
  return [`(${left} ${op} ${right})`, 0];
};

/** Generate `NOT expr` for logical negation. */
generator.forBlock['sql_not'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'TRUE';
  return [`NOT ${expr}`, 0];
};

/**
 * Generate a literal value, auto-detecting the type:
 * - Numbers are emitted as-is
 * - TRUE/FALSE/NULL are uppercased SQL keywords
 * - Other strings are single-quoted
 */
generator.forBlock['sql_value'] = function (
  block: Blockly.Block
): [string, number] {
  const value = block.getFieldValue('VALUE');

  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    return [String(num), 0];
  }

  const upper = value.toUpperCase();
  if (upper === 'TRUE' || upper === 'FALSE' || upper === 'NULL') {
    return [upper, 0];
  }

  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
    return [value, 0];
  }

  return [`'${value}'`, 0];
};

// ── Clause Blocks ────────────────────────────────────────────────────────

/** Generate a GROUP BY expression item. */
generator.forBlock['sql_group_by'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  return expr + ',\n';
};

/** Generate `HAVING condition`. */
generator.forBlock['sql_having'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const condition = generator.valueToCode(block, 'CONDITION', 0) || 'TRUE';
  return `HAVING ${condition}\n`;
};

/** Generate `expr ASC/DESC` for an ORDER BY item. */
generator.forBlock['sql_order_by'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  const dir = block.getFieldValue('DIR');
  return `${expr} ${dir},\n`;
};

/** Generate `LIMIT n`. */
generator.forBlock['sql_limit'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const num = generator.valueToCode(block, 'NUM', 0) || '0';
  return `LIMIT ${num}\n`;
};

/** Generate `FUNC(expr)` for aggregate functions. */
generator.forBlock['sql_agg_func'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const func = block.getFieldValue('FUNC');
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  return [`${func}(${expr})`, 0];
};
