import { describe, it, expect, beforeAll } from 'vitest';
import * as Blockly from 'blockly';
import { defineBlocks } from '../src/blocks';
import { generator } from '../src/generator';

// ── Step 1 – Block Definitions ───────────────────────────────────────────

describe('Step 1 – Block Definitions', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_define_table block exists with TABLE_NAME field and COLUMNS statement input', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(
      () => { block = ws.newBlock('sql_define_table'); },
      'sql_define_table block type must be registered inside defineBlocks()'
    ).not.toThrow();
    expect(
      block.getField('TABLE_NAME'),
      'sql_define_table must declare a field named TABLE_NAME'
    ).not.toBeNull();
    expect(
      block.getInput('COLUMNS'),
      'sql_define_table must declare a statement input named COLUMNS'
    ).not.toBeNull();
    ws.dispose();
  });

  it('sql_define_column block exists with COL_NAME field and COL_TYPE dropdown', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(
      () => { block = ws.newBlock('sql_define_column'); }
    ).not.toThrow();
    expect(block.getField('COL_NAME')).not.toBeNull();
    expect(block.getField('COL_TYPE')).not.toBeNull();

    for (const value of ['TEXT', 'INTEGER', 'REAL', 'BOOLEAN']) {
      block.setFieldValue(value, 'COL_TYPE');
      expect(block.getFieldValue('COL_TYPE')).toBe(value);
    }
    ws.dispose();
  });

  it('sql_define_column has schema_column statement connections', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_define_column');
    expect(block.previousConnection?.getCheck()).toContain('schema_column');
    expect(block.nextConnection?.getCheck()).toContain('schema_column');
    ws.dispose();
  });

  it('sql_query block exists with COLUMNS and FROM statement inputs', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(
      () => { block = ws.newBlock('sql_query'); }
    ).not.toThrow();
    expect(block.getField('DISTINCT')).not.toBeNull();
    expect(block.getInput('COLUMNS')?.connection?.getCheck()).toContain('select_item');
    expect(block.getInput('FROM')?.connection?.getCheck()).toContain('from_item');
    ws.dispose();
  });

  it('sql_all_columns block exists with select_item connections', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_all_columns');
    expect(block.previousConnection?.getCheck()).toContain('select_item');
    expect(block.nextConnection?.getCheck()).toContain('select_item');
    ws.dispose();
  });

  it('sql_from_table block exists with TABLE field and from_item connections', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(
      () => { block = ws.newBlock('sql_from_table'); }
    ).not.toThrow();
    expect(block.getField('TABLE')).not.toBeNull();
    expect(block.getField('ALIAS')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('from_item');
    expect(block.nextConnection?.getCheck()).toContain('from_item');
    ws.dispose();
  });
});

// ── Step 2 – Per-Block Code Generation ───────────────────────────────────

describe('Step 2 – Per-Block Code Generation', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_define_table generates empty string (schema only)', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_define_table');
    block.setFieldValue('employees', 'TABLE_NAME');
    generator.init(ws);
    const code = generator.blockToCode(block);
    generator.finish('');
    expect(code).toBe('');
    ws.dispose();
  });

  it('sql_define_column generates empty string (schema only)', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_define_column');
    block.setFieldValue('name', 'COL_NAME');
    block.setFieldValue('TEXT', 'COL_TYPE');
    generator.init(ws);
    const code = generator.blockToCode(block);
    generator.finish('');
    expect(code).toBe('');
    ws.dispose();
  });

  it('sql_all_columns generates "*" for list building', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_all_columns');
    generator.init(ws);
    const code = generator.blockToCode(block);
    generator.finish('');
    expect(code).toMatch(/\*/);
    ws.dispose();
  });

  it('sql_from_table generates empty string when no table is selected (NONE)', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_from_table');
    generator.init(ws);
    const code = generator.blockToCode(block) as string;
    generator.finish('');
    // Dynamic dropdown defaults to NONE in headless tests → generator returns ''
    expect(code).toBe('');
    ws.dispose();
  });

  it('sql_query generates a SELECT statement', () => {
    const ws = new Blockly.Workspace();
    const queryBlock = ws.newBlock('sql_query');
    generator.init(ws);
    const code = generator.blockToCode(queryBlock) as string;
    generator.finish('');
    expect(code).toMatch(/SELECT/);
    ws.dispose();
  });
});

// ── Phase 1 – Column Expressions & Select Items ─────────────────────────

describe('Phase 1 – Block Definitions', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_select_item block exists with EXPR value input and ALIAS field', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_select_item'); }).not.toThrow();
    expect(block.getInput('EXPR')).not.toBeNull();
    expect(block.getField('ALIAS')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('select_item');
    expect(block.nextConnection?.getCheck()).toContain('select_item');
    ws.dispose();
  });

  it('sql_column_expr block exists with TABLE and COLUMN fields and sql_expr output', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_column_expr'); }).not.toThrow();
    expect(block.getField('TABLE')).not.toBeNull();
    expect(block.getField('COLUMN')).not.toBeNull();
    expect(block.outputConnection?.getCheck()).toContain('sql_expr');
    ws.dispose();
  });
});

describe('Phase 1 – Code Generation', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_select_item generates "NULL,\\n" when EXPR slot is empty', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_select_item');
    generator.init(ws);
    const code = generator.blockToCode(block) as string;
    generator.finish('');
    expect(code).toContain('NULL');
    ws.dispose();
  });

  it('sql_select_item includes alias when ALIAS is set', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_select_item');
    block.setFieldValue('total', 'ALIAS');
    generator.init(ws);
    const code = generator.blockToCode(block) as string;
    generator.finish('');
    expect(code).toContain('AS total');
    ws.dispose();
  });

  it('sql_column_expr generates NULL when no table is selected (headless)', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_column_expr');
    generator.init(ws);
    const code = generator.blockToCode(block);
    generator.finish('');
    // In headless tests, dynamic dropdown defaults to NONE → returns ['NULL', 0]
    expect(code).toContain('NULL');
    ws.dispose();
  });
});

// ── Phase 2 – WHERE Clause and Conditions ────────────────────────────────

describe('Phase 2 – Block Definitions', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_where block exists with CONDITION value input and where_clause connections', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_where'); }).not.toThrow();
    expect(block.getInput('CONDITION')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('where_clause');
    ws.dispose();
  });

  it('sql_comparison block exists with LEFT, RIGHT, OP and sql_expr output', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_comparison'); }).not.toThrow();
    expect(block.getInput('LEFT')).not.toBeNull();
    expect(block.getInput('RIGHT')).not.toBeNull();
    expect(block.getField('OP')).not.toBeNull();
    expect(block.outputConnection?.getCheck()).toContain('sql_expr');
    ws.dispose();
  });

  it('sql_logical block exists with LEFT, RIGHT, OP and sql_expr output', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_logical'); }).not.toThrow();
    expect(block.getInput('LEFT')).not.toBeNull();
    expect(block.getInput('RIGHT')).not.toBeNull();
    expect(block.getField('OP')).not.toBeNull();
    expect(block.outputConnection?.getCheck()).toContain('sql_expr');
    ws.dispose();
  });

  it('sql_not block exists with EXPR and sql_expr output', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_not'); }).not.toThrow();
    expect(block.getInput('EXPR')).not.toBeNull();
    expect(block.outputConnection?.getCheck()).toContain('sql_expr');
    ws.dispose();
  });

  it('sql_value block exists with VALUE field and sql_expr output', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_value'); }).not.toThrow();
    expect(block.getField('VALUE')).not.toBeNull();
    expect(block.outputConnection?.getCheck()).toContain('sql_expr');
    ws.dispose();
  });
});

describe('Phase 2 – Code Generation', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_where generates WHERE TRUE when empty', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_where');
    generator.init(ws);
    const code = generator.blockToCode(block) as string;
    generator.finish('');
    expect(code).toContain('WHERE TRUE');
    ws.dispose();
  });

  it('sql_comparison generates NULL = NULL when empty', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_comparison');
    block.setFieldValue('=', 'OP');
    generator.init(ws);
    const code = generator.blockToCode(block);
    generator.finish('');
    expect(code[0]).toBe('NULL = NULL');
    ws.dispose();
  });

  it('sql_logical generates (TRUE AND TRUE) when empty', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_logical');
    block.setFieldValue('AND', 'OP');
    generator.init(ws);
    const code = generator.blockToCode(block);
    generator.finish('');
    expect(code[0]).toBe('(TRUE AND TRUE)');
    ws.dispose();
  });

  it('sql_not generates NOT TRUE when empty', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_not');
    generator.init(ws);
    const code = generator.blockToCode(block);
    generator.finish('');
    expect(code[0]).toBe('NOT TRUE');
    ws.dispose();
  });

  it('sql_value handles numbers, booleans, and strings', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_value');
    generator.init(ws);
    
    // Number
    block.setFieldValue('42', 'VALUE');
    expect(generator.blockToCode(block)[0]).toBe('42');
    
    // Boolean
    block.setFieldValue('TRUE', 'VALUE');
    expect(generator.blockToCode(block)[0]).toBe('TRUE');
    
    // String
    block.setFieldValue('hello', 'VALUE');
    expect(generator.blockToCode(block)[0]).toBe("'hello'");
    
    // Already quoted string
    block.setFieldValue("'world'", 'VALUE');
    expect(generator.blockToCode(block)[0]).toBe("'world'");
    
    ws.dispose();
  });
});

// ── Phase 3 – JOIN Support ───────────────────────────────────────────────────

describe('Phase 3 – Block Definitions', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_join block exists with correct fields and connections', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_join'); }).not.toThrow();
    expect(block.getField('JOIN_TYPE')).not.toBeNull();
    expect(block.getField('TABLE')).not.toBeNull();
    expect(block.getField('ALIAS')).not.toBeNull();
    expect(block.getInput('ON')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('from_item');
    expect(block.nextConnection?.getCheck()).toContain('from_item');
    ws.dispose();
  });
});

describe('Phase 3 – Code Generation', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_join generates empty string when no table is selected (headless)', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_join');
    generator.init(ws);
    const code = generator.blockToCode(block) as string;
    generator.finish('');
    // Dynamic dropdown defaults to NONE → returns empty string
    expect(code).toBe('');
    ws.dispose();
  });
});

// ── Phase 4 – GROUP BY, HAVING, ORDER BY, LIMIT ──────────────────────────────

describe('Phase 4 – Block Definitions', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_group_by block exists with EXPR and group_clause connections', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_group_by'); }).not.toThrow();
    expect(block.getInput('EXPR')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('group_clause');
    expect(block.nextConnection?.getCheck()).toContain('group_clause');
    ws.dispose();
  });

  it('sql_having block exists with CONDITION and having_clause connection', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_having'); }).not.toThrow();
    expect(block.getInput('CONDITION')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('having_clause');
    ws.dispose();
  });

  it('sql_order_by block exists with EXPR, DIR, and order_clause connections', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_order_by'); }).not.toThrow();
    expect(block.getInput('EXPR')).not.toBeNull();
    expect(block.getField('DIR')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('order_clause');
    expect(block.nextConnection?.getCheck()).toContain('order_clause');
    ws.dispose();
  });

  it('sql_limit block exists with NUM and limit_clause connection', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_limit'); }).not.toThrow();
    expect(block.getInput('NUM')).not.toBeNull();
    expect(block.previousConnection?.getCheck()).toContain('limit_clause');
    ws.dispose();
  });

  it('sql_agg_func block exists with FUNC, EXPR, and sql_expr output', () => {
    const ws = new Blockly.Workspace();
    let block!: Blockly.Block;
    expect(() => { block = ws.newBlock('sql_agg_func'); }).not.toThrow();
    expect(block.getField('FUNC')).not.toBeNull();
    expect(block.getInput('EXPR')).not.toBeNull();
    expect(block.outputConnection?.getCheck()).toContain('sql_expr');
    ws.dispose();
  });
});

describe('Phase 4 – Code Generation', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('sql_group_by generates correctly', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_group_by');
    generator.init(ws);
    expect(generator.blockToCode(block)).toBe('NULL,\n');
    ws.dispose();
  });

  it('sql_having generates correctly', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_having');
    generator.init(ws);
    expect(generator.blockToCode(block)).toBe('HAVING TRUE\n');
    ws.dispose();
  });

  it('sql_order_by generates correctly', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_order_by');
    block.setFieldValue('DESC', 'DIR');
    generator.init(ws);
    expect(generator.blockToCode(block)).toBe('NULL DESC,\n');
    ws.dispose();
  });

  it('sql_limit generates correctly', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_limit');
    generator.init(ws);
    expect(generator.blockToCode(block)).toBe('LIMIT 0\n');
    ws.dispose();
  });

  it('sql_agg_func generates correctly', () => {
    const ws = new Blockly.Workspace();
    const block = ws.newBlock('sql_agg_func');
    block.setFieldValue('SUM', 'FUNC');
    generator.init(ws);
    expect((generator.blockToCode(block) as string[])[0]).toBe('SUM(NULL)');
    ws.dispose();
  });
});
