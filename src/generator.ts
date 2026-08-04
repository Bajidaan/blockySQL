import * as Blockly from 'blockly';

export const generator = new Blockly.Generator('SQL');

generator.INDENT = '  ';

generator.scrub_ = function(block: Blockly.Block, code: string, thisOnly?: boolean): string {
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  let nextCode = '';
  if (nextBlock && !thisOnly) {
    nextCode = generator.blockToCode(nextBlock) as string;
  }
  return code + nextCode;
};

// https://developers.google.com/blockly/guides/create-custom-blocks/generating-code


generator.forBlock['sql_define_table'] = function (): string {
  return '';
};

generator.forBlock['sql_define_column'] = function (): string {
  return '';
};

// Block for SELECT statement
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
    .split(',\n')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0)
    .join(', ');

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

// Block for all columns
generator.forBlock['sql_all_columns'] = function (): string {
  return '*,\n';
};

// sql_select_item: wraps an expression with an optional alias
generator.forBlock['sql_select_item'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  const alias = block.getFieldValue('ALIAS').trim();

  const sql = alias.length > 0 ? `${expr} AS ${alias}` : expr;
  return sql + ',\n';
};

// sql_column_expr: returns table.column as a value
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

// Block for table name
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

// WHERE Clause and Conditions
generator.forBlock['sql_where'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const condition = generator.valueToCode(block, 'CONDITION', 0) || 'TRUE';
  return `WHERE ${condition}\n`;
};

generator.forBlock['sql_comparison'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const left = generator.valueToCode(block, 'LEFT', 0) || 'NULL';
  const right = generator.valueToCode(block, 'RIGHT', 0) || 'NULL';
  const op = block.getFieldValue('OP');
  return [`${left} ${op} ${right}`, 0];
};

generator.forBlock['sql_logical'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const left = generator.valueToCode(block, 'LEFT', 0) || 'TRUE';
  const right = generator.valueToCode(block, 'RIGHT', 0) || 'TRUE';
  const op = block.getFieldValue('OP');
  return [`(${left} ${op} ${right})`, 0];
};

generator.forBlock['sql_not'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'TRUE';
  return [`NOT ${expr}`, 0];
};

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

// JOIN Support
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

  return sql + ',\n';
};

// GROUP BY
generator.forBlock['sql_group_by'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  return expr + ',\n';
};

//  HAVING
generator.forBlock['sql_having'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const condition = generator.valueToCode(block, 'CONDITION', 0) || 'TRUE';
  return `HAVING ${condition}\n`;
};

// ORDER BY
generator.forBlock['sql_order_by'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  const dir = block.getFieldValue('DIR');
  return `${expr} ${dir},\n`;
};

// LIMIT
generator.forBlock['sql_limit'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): string {
  const num = generator.valueToCode(block, 'NUM', 0) || '0';
  return `LIMIT ${num}\n`;
};

generator.forBlock['sql_agg_func'] = function (
  block: Blockly.Block,
  generator: Blockly.Generator
): [string, number] {
  const func = block.getFieldValue('FUNC');
  const expr = generator.valueToCode(block, 'EXPR', 0) || 'NULL';
  return [`${func}(${expr})`, 0];
};
