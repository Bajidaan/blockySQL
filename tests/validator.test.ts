import { describe, it, expect } from 'vitest';
import { validateQuery } from '../src/validator';
import type { SelectQueryNode } from '../src/ast';
import type { Schema } from '../src/ast-builder';

describe('Phase 6 – Semantic Validation', () => {
  const schema: Schema = {
    users: {
      columns: {
        id: { type: 'INTEGER' },
        name: { type: 'TEXT' },
        age: { type: 'INTEGER' }
      }
    },
    orders: {
      columns: {
        id: { type: 'INTEGER' },
        user_id: { type: 'INTEGER' },
        amount: { type: 'REAL' }
      }
    }
  };

  it('Rule 1: Warns on missing FROM clause', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Literal', value: 1 }],
      from: [],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null,
      blockId: 'q1'
    };

    const issues = validateQuery([query], schema);
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('no FROM clause');
    expect(issues[0].severity).toBe('warning');
  });

  it('Rule 2: Errors on unresolved table/column reference', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [
        { type: 'Column', table: 'users', column: 'non_existent_col', alias: null, blockId: 'c1' },
        { type: 'Column', table: 'missing_table', column: 'id', alias: null, blockId: 'c2' }
      ],
      from: [{ type: 'Table', name: 'users', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const issues = validateQuery([query], schema);
    expect(issues.length).toBe(2);
    expect(issues.some(i => i.message.includes('non_existent_col'))).toBe(true);
    expect(issues.some(i => i.message.includes('missing_table'))).toBe(true);
  });

  it('Rule 3: Warns on type mismatch in comparisons', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [{ type: 'Literal', value: '*' }],
      from: [{ type: 'Table', name: 'users', alias: null }],
      joins: [],
      where: {
        type: 'BinaryExpression',
        operator: '=',
        left: { type: 'Column', table: 'users', column: 'age', alias: null },
        right: { type: 'Literal', value: 'twenty' }, // string compared to INTEGER
        blockId: 'b1'
      },
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    const issues = validateQuery([query], schema);
    expect(issues.some(i => i.message.includes('Type mismatch'))).toBe(true);
    
    // Test comparing Column to Column
    query.where = {
      type: 'BinaryExpression',
      operator: '=',
      left: { type: 'Column', table: 'users', column: 'age', alias: null, blockId: 'b2' },
      right: { type: 'Column', table: 'users', column: 'name', alias: null, blockId: 'b3' }, // INTEGER compared to TEXT
      blockId: 'b1'
    };
    
    const issues2 = validateQuery([query], schema);
    expect(issues2.some(i => i.message.includes("comparing 'INTEGER' column to 'TEXT' column"))).toBe(true);
  });

  it('Rule 4 & 5: Validates aggregation and GROUP BY rules', () => {
    const query: SelectQueryNode = {
      type: 'SelectQuery',
      distinct: false,
      columns: [
        { type: 'Column', table: 'users', column: 'name', alias: null, blockId: 'c1' },
        { type: 'Aggregate', func: 'COUNT', argument: { type: 'Literal', value: '*' }, alias: null, blockId: 'a1' }
      ],
      from: [{ type: 'Table', name: 'users', alias: null }],
      joins: [],
      where: null,
      groupBy: [],
      having: null,
      orderBy: [],
      limit: null
    };

    let issues = validateQuery([query], schema);
    // Should warn about mixing raw columns and aggregates without GROUP BY
    expect(issues.some(i => i.message.includes('mixes raw columns and aggregates'))).toBe(true);

    // Now add a GROUP BY on 'age' (which is not 'name')
    query.groupBy = [{ type: 'Column', table: 'users', column: 'age', alias: null }];
    issues = validateQuery([query], schema);
    // Should error because 'name' is in SELECT but not GROUP BY
    expect(issues.some(i => i.message.includes('must appear in the GROUP BY'))).toBe(true);
  });
});
