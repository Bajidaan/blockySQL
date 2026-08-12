import { describe, it, expect } from 'vitest';
import { emitSQL } from '../src/sql-emitter';
import type { SelectQueryNode } from '../src/ast';

describe('SQL Emitter', () => {
  it('returns placeholder for empty array', () => {
    expect(emitSQL([])).toBe('-- No query blocks in workspace');
  });

  it('emits SELECT * when columns are empty', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [],
      from: [{ type: 'Table', name: 'employees', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toBe('SELECT *\nFROM employees;');
  });

  it('emits DISTINCT when enabled', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: true,
      columns: [{ type: 'Column', table: 'emp', column: 'name', alias: null }],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toBe('SELECT DISTINCT emp.name\nFROM emp;');
  });

  it('emits table alias correctly', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [],
      from: [{ type: 'Table', name: 'employees', alias: 'e' }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toBe('SELECT *\nFROM employees AS e;');
  });

  it('emits NULL literal', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [],
      from: [{ type: 'Table', name: 't', alias: null }],
      joins: [],
      where: { type: 'Literal', value: null },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toContain('WHERE NULL');
  });

  it('emits boolean literals', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [],
      from: [{ type: 'Table', name: 't', alias: null }],
      joins: [],
      where: { type: 'Literal', value: true },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toContain('WHERE TRUE');
  });

  it('emits unqualified column', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Column', table: null, column: 'id', alias: null }],
      from: [{ type: 'Table', name: 't', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toBe('SELECT id\nFROM t;');
  });

  it('emits column alias', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Column', table: 'emp', column: 'salary', alias: 'pay' }],
      from: [{ type: 'Table', name: 'emp', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toBe('SELECT emp.salary AS pay\nFROM emp;');
  });

  it('wraps AND/OR in parentheses', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [],
      from: [{ type: 'Table', name: 't', alias: null }],
      joins: [],
      where: {
        type: 'BinaryExpression',
        operator: 'AND',
        left: { type: 'Literal', value: 1 },
        right: { type: 'Literal', value: 2 }
      },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toContain('WHERE (1 AND 2)');
  });

  it('emits JOIN correctly', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [],
      from: [{ type: 'Table', name: 'a', alias: null }],
      joins: [{
        type: 'Join',
        joinType: 'LEFT JOIN',
        table: { type: 'Table', name: 'b', alias: 'bb' },
        on: {
          type: 'BinaryExpression',
          operator: '=',
          left: { type: 'Column', table: 'a', column: 'id', alias: null },
          right: { type: 'Column', table: 'bb', column: 'a_id', alias: null }
        }
      }],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    const sql = emitSQL([query]);
    expect(sql).toContain('LEFT JOIN b AS bb ON a.id = bb.a_id');
  });

  it('emits aggregate with alias', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Aggregate', func: 'COUNT', argument: { type: 'Literal', value: '*' }, alias: 'total' }],
      from: [{ type: 'Table', name: 't', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };
    expect(emitSQL([query])).toBe('SELECT COUNT(*) AS total\nFROM t;');
  });

  it('emits full query with all clauses', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: true,
      columns: [{ type: 'Column', table: 'e', column: 'dept', alias: null }],
      from: [{ type: 'Table', name: 'employees', alias: 'e' }],
      joins: [],
      where: { type: 'BinaryExpression', operator: '>', left: { type: 'Column', table: 'e', column: 'salary', alias: null }, right: { type: 'Literal', value: 50000 } },
      groupBy: [{ type: 'Column', table: 'e', column: 'dept', alias: null }],
      having: { type: 'BinaryExpression', operator: '>', left: { type: 'Aggregate', func: 'COUNT', argument: { type: 'Literal', value: '*' }, alias: null }, right: { type: 'Literal', value: 5 } },
      orderBy: [{ type: 'OrderBy', expr: { type: 'Column', table: 'e', column: 'dept', alias: null }, direction: 'ASC' }],
      limit: { type: 'Limit', value: 10 }
    };
    const sql = emitSQL([query]);
    expect(sql).toContain('SELECT DISTINCT');
    expect(sql).toContain('FROM employees AS e');
    expect(sql).toContain('WHERE e.salary > 50000');
    expect(sql).toContain('GROUP BY e.dept');
    expect(sql).toContain('HAVING COUNT(*) > 5');
    expect(sql).toContain('ORDER BY e.dept ASC');
    expect(sql).toContain('LIMIT 10');
  });
});
