import { describe, it, expect } from 'vitest';
import { optimizeAST } from '../src/optimizer';
import type { SelectQueryNode } from '../src/ast';
import { emitSQL } from '../src/sql-emitter';

describe('Query Optimization', () => {
  it('deduplicates columns in SELECT', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [
        { type: 'Column', table: 'emp', column: 'name', alias: null },
        { type: 'Column', table: 'emp', column: 'name', alias: null },
        { type: 'Column', table: 'emp', column: 'age', alias: null }
      ],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const optimized = optimizeAST([query])[0];
    expect(optimized.columns.length).toBe(2);
    expect(emitSQL([optimized])).toBe('SELECT emp.name, emp.age\nFROM emp;');
  });

  it('folds boolean tautologies (1 = 1)', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Column', table: null, column: '*', alias: null }],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: {
        type: 'BinaryExpression',
        operator: '=',
        left: { type: 'Literal', value: 1 },
        right: { type: 'Literal', value: 1 }
      },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const optimized = optimizeAST([query])[0];
    expect(emitSQL([optimized])).toBe('SELECT *\nFROM emp\nWHERE TRUE;');
  });

  it('simplifies TRUE AND x -> x', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Column', table: null, column: '*', alias: null }],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: {
        type: 'BinaryExpression',
        operator: 'AND',
        left: { type: 'Literal', value: 'TRUE' },
        right: {
          type: 'BinaryExpression',
          operator: '>',
          left: { type: 'Column', table: null, column: 'age', alias: null },
          right: { type: 'Literal', value: 18 }
        }
      },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const optimized = optimizeAST([query])[0];
    expect(emitSQL([optimized])).toBe('SELECT *\nFROM emp\nWHERE age > 18;');
  });

  it('simplifies NOT FALSE -> TRUE', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Column', table: null, column: '*', alias: null }],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: {
        type: 'UnaryExpression',
        operator: 'NOT',
        argument: { type: 'Literal', value: false }
      },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const optimized = optimizeAST([query])[0];
    expect(emitSQL([optimized])).toBe('SELECT *\nFROM emp\nWHERE TRUE;');
  });

  it('folds constants like 5 > 3 -> TRUE', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Column', table: null, column: '*', alias: null }],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: {
        type: 'BinaryExpression',
        operator: '>',
        left: { type: 'Literal', value: 5 },
        right: { type: 'Literal', value: 3 }
      },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const optimized = optimizeAST([query])[0];
    expect(emitSQL([optimized])).toBe('SELECT *\nFROM emp\nWHERE TRUE;');
  });

  it('simplifies x AND x -> x', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Column', table: null, column: '*', alias: null }],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: {
        type: 'BinaryExpression',
        operator: 'AND',
        left: {
          type: 'BinaryExpression',
          operator: '=',
          left: { type: 'Column', table: 'departments', column: 'id', alias: null },
          right: { type: 'Literal', value: 0 }
        },
        right: {
          type: 'BinaryExpression',
          operator: '=',
          left: { type: 'Column', table: 'departments', column: 'id', alias: null },
          right: { type: 'Literal', value: 0 }
        }
      },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const optimized = optimizeAST([query])[0];
    expect(emitSQL([optimized])).toBe('SELECT *\nFROM emp\nWHERE departments.id = 0;');
  });
});
