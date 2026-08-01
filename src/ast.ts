export interface BaseNode {
  blockId?: string;
}

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

export interface SelectQueryNode extends BaseNode {
  type: 'SelectQuery';
  distinct: boolean;
  columns: ASTNode[];
  from: TableNode[];
  joins: JoinNode[];
  where: ASTNode | null;
  groupBy: ASTNode[];
  having: ASTNode | null;
  orderBy: OrderByNode[];
  limit: LimitNode | null;
}

export interface ColumnNode extends BaseNode {
  type: 'Column';
  table: string | null;
  column: string;
  alias: string | null;
}

export interface TableNode extends BaseNode {
  type: 'Table';
  name: string;
  alias: string | null;
}

export interface JoinNode extends BaseNode {
  type: 'Join';
  joinType: string;
  table: TableNode;
  on: ASTNode;
}

export interface BinaryExpressionNode extends BaseNode {
  type: 'BinaryExpression';
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryExpressionNode extends BaseNode {
  type: 'UnaryExpression';
  operator: string;
  argument: ASTNode;
}

export interface LiteralNode extends BaseNode {
  type: 'Literal';
  value: string | number | boolean | null;
}

export interface AggregateNode extends BaseNode {
  type: 'Aggregate';
  func: string;
  argument: ASTNode;
  alias: string | null;
}

export interface OrderByNode extends BaseNode {
  type: 'OrderBy';
  expr: ASTNode;
  direction: 'ASC' | 'DESC';
}

export interface LimitNode extends BaseNode {
  type: 'Limit';
  value: number;
}
