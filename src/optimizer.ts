import type {
  ASTNode,
  SelectQueryNode,
  LiteralNode
} from './ast';

export function optimizeAST(queries: SelectQueryNode[]): SelectQueryNode[] {
  return queries.map(optimizeQuery);
}

function optimizeQuery(query: SelectQueryNode): SelectQueryNode {
  return {
    ...query,
    columns: optimizeColumns(query.columns),
    where: query.where ? optimizeExpression(query.where) : null,
    groupBy: query.groupBy.map(optimizeExpression),
    having: query.having ? optimizeExpression(query.having) : null
  };
}

function optimizeColumns(columns: ASTNode[]): ASTNode[] {
  // Deduplicate columns
  const seen = new Set<string>();
  const uniqueColumns: ASTNode[] = [];

  for (const col of columns) {
    let key = '';
    if (col.type === 'Column') {
      key = `col:${col.table}.${col.column}`;
    } else if (col.type === 'Literal') {
      key = `lit:${col.value}`;
    } else if (col.type === 'Aggregate') {
      // simplified key for aggregate
      key = `agg:${col.func}(${JSON.stringify(col.argument)})`;
    } else {
      key = JSON.stringify(col);
    }

    if (!seen.has(key)) {
      seen.add(key);
      uniqueColumns.push(col);
    }
  }

  // If there's a '*' in columns, often we might want to just keep '*' if it's the only thing,
  // but for now deduplication is enough to satisfy the requirement.
  return uniqueColumns;
}

function optimizeExpression(node: ASTNode): ASTNode {
  if (node.type === 'BinaryExpression') {
    let left = optimizeExpression(node.left);
    let right = optimizeExpression(node.right);

    // Constant Folding & Tautology
    if (left.type === 'Literal' && right.type === 'Literal') {
      return foldConstants(left, right, node.operator, node.blockId);
    }

    // Boolean Simplification
    const op = node.operator.toUpperCase();
    if (op === 'AND') {
      if (isEqual(left, right)) return left; // x AND x -> x
      if (isLiteralBoolean(left, true)) return right; // TRUE AND x -> x
      if (isLiteralBoolean(right, true)) return left; // x AND TRUE -> x
      if (isLiteralBoolean(left, false)) return left; // FALSE AND x -> FALSE
      if (isLiteralBoolean(right, false)) return right; // x AND FALSE -> FALSE
    } else if (op === 'OR') {
      if (isEqual(left, right)) return left; // x OR x -> x
      if (isLiteralBoolean(left, true)) return left; // TRUE OR x -> TRUE
      if (isLiteralBoolean(right, true)) return right; // x OR TRUE -> TRUE
      if (isLiteralBoolean(left, false)) return right; // FALSE OR x -> x
      if (isLiteralBoolean(right, false)) return left; // x OR FALSE -> x
    }

    return { ...node, left, right };
  }

  if (node.type === 'UnaryExpression') {
    let argument = optimizeExpression(node.argument);

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
      
      // NOT NOT x -> x
      if (argument.type === 'UnaryExpression' && argument.operator.toUpperCase() === 'NOT') {
        return argument.argument;
      }
    }

    return { ...node, argument };
  }

  return node;
}

function foldConstants(left: LiteralNode, right: LiteralNode, operator: string, blockId?: string): LiteralNode {
  let lVal: any = left.value;
  let rVal: any = right.value;

  // normalize booleans
  if (typeof lVal === 'string') {
    if (lVal.toUpperCase() === 'TRUE') lVal = true;
    if (lVal.toUpperCase() === 'FALSE') lVal = false;
  }
  if (typeof rVal === 'string') {
    if (rVal.toUpperCase() === 'TRUE') rVal = true;
    if (rVal.toUpperCase() === 'FALSE') rVal = false;
  }

  let result: any = null;
  switch (operator) {
    case '=': result = lVal === rVal; break;
    case '!=': result = lVal !== rVal; break;
    case '<': result = lVal < rVal; break;
    case '<=': result = lVal <= rVal; break;
    case '>': result = lVal > rVal; break;
    case '>=': result = lVal >= rVal; break;
    case 'AND': result = Boolean(lVal && rVal); break;
    case 'OR': result = Boolean(lVal || rVal); break;
  }

  if (result !== null) {
    // convert back to string TRUE/FALSE for our AST literal representation if it's a boolean
    if (typeof result === 'boolean') {
      result = result ? 'TRUE' : 'FALSE';
    }
    return { type: 'Literal', value: result, blockId };
  }

  return { type: 'Literal', value: 'NULL', blockId };
}

function isLiteralBoolean(node: ASTNode, val: boolean): boolean {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value.toUpperCase() === (val ? 'TRUE' : 'FALSE');
  }
  return false;
}

function isEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false;
  }
  const keysA = Object.keys(a).filter(k => k !== 'blockId');
  const keysB = Object.keys(b).filter(k => k !== 'blockId');
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!isEqual(a[key], b[key])) return false;
  }
  return true;
}
