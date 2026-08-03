import { describe, it, expect, beforeAll } from 'vitest';
import * as Blockly from 'blockly';
import { defineBlocks } from '../src/blocks';
import { buildAST } from '../src/ast-builder';
import { emitSQL } from '../src/sql-emitter';

describe('Phase 5 – AST Generation', () => {
  beforeAll(() => {
    defineBlocks();
  });

  it('buildAST returns empty array for empty workspace', () => {
    const ws = new Blockly.Workspace();
    const ast = buildAST(ws);
    expect(ast).toEqual([]);
    ws.dispose();
  });

  it('buildAST correctly parses a basic SELECT * FROM query', () => {
    const ws = new Blockly.Workspace();
    
    // Create query block
    const queryBlock = ws.newBlock('sql_query');
    
    // Add ALL COLUMNS
    const allColsBlock = ws.newBlock('sql_all_columns');
    queryBlock.getInput('COLUMNS')!.connection!.connect(allColsBlock.previousConnection!);

    // Add FROM table
    const fromBlock = ws.newBlock('sql_from_table');
    // Mock getFieldValue because dynamic dropdowns rely on getMainWorkspace() which fails headless
    fromBlock.getFieldValue = (name: string) => {
      if (name === 'TABLE') return 'users';
      if (name === 'ALIAS') return 'u';
      return null;
    };
    queryBlock.getInput('FROM')!.connection!.connect(fromBlock.previousConnection!);

    const ast = buildAST(ws);
    
    expect(ast.length).toBe(1);
    expect(ast[0].type).toBe('SelectQuery');
    expect(ast[0].columns.length).toBe(1);
    expect(ast[0].columns[0]).toEqual(expect.objectContaining({ type: 'Literal', value: '*' }));
    expect(ast[0].from.length).toBe(1);
    expect(ast[0].from[0]).toEqual(expect.objectContaining({ type: 'Table', name: 'users', alias: 'u' }));

    const sql = emitSQL(ast);
    expect(sql).toBe('SELECT *\nFROM users AS u;');
    
    ws.dispose();
  });
});
