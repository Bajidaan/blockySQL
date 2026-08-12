/**
 * @module blocks
 *
 * Defines all custom Blockly block types used in the visual SQL query builder.
 * Blocks are grouped into five categories:
 *
 * - **Schema**: `sql_define_table`, `sql_define_column` — declare table structures
 * - **Query**:  `sql_query`, `sql_all_columns`, `sql_select_item`, etc. — query clauses
 * - **Conditions**: `sql_comparison`, `sql_logical`, `sql_not` — WHERE predicates
 * - **Expressions**: `sql_column_expr`, `sql_value`, `sql_agg_func` — value expressions
 * - **Tables**: `sql_from_table`, `sql_join` — table references with dynamic dropdowns
 *
 * Static blocks are defined via JSON; dynamic blocks (those with runtime-generated
 * dropdown options) are defined imperatively with `Blockly.Blocks[...]`.
 *
 * @see {@link generator} for how these blocks generate SQL strings.
 * @see {@link ast-builder} for how these blocks are converted to AST nodes.
 */

import * as Blockly from 'blockly';
import { BLOCK_DEFINE_TABLE, NONE_SENTINEL } from './constants';

// ── Shared Helpers ──────────────────────────────────────────────────────

/**
 * Create a Blockly {@link Blockly.MenuGeneratorFunction} that dynamically
 * lists all table names from `sql_define_table` blocks in the workspace.
 *
 * This is shared by `sql_from_table`, `sql_column_expr`, and `sql_join`
 * to avoid duplicating the same lookup logic in three places.
 *
 * @returns A function compatible with {@link Blockly.FieldDropdown}.
 */
function createTableDropdown(): Blockly.MenuGeneratorFunction {
  return () => {
    const workspace = Blockly.getMainWorkspace();
    if (!workspace) return [['<No Tables>', NONE_SENTINEL]];

    const tableDefs = workspace.getBlocksByType(BLOCK_DEFINE_TABLE);
    if (tableDefs.length === 0) return [['<No Tables Defined>', NONE_SENTINEL]];

    return tableDefs.map((block): Blockly.MenuOption => {
      const name = String(block.getFieldValue('TABLE_NAME') || 'unnamed');
      return [name, name];
    });
  };
}

// ── Block Definitions ─────────────────────────────────────────────────────

/**
 * Register all custom SQL block types with Blockly.
 * Must be called once before the workspace is created.
 */
export function defineBlocks() {
  Blockly.defineBlocksWithJsonArray([
    // ── Schema Blocks ──────────────────────────────────────────────────

    /** Define a table schema with a name and a list of column definitions. */
    {
      "type": "sql_define_table",
      "message0": "DEFINE TABLE %1 %2 COLUMNS %3",
      "args0": [
        { "type": "field_input", "name": "TABLE_NAME", "text": "tableName" },
        { "type": "input_dummy" },
        { "type": "input_statement", "name": "COLUMNS", "check": "schema_column" }
      ],
      "colour": 65
    },

    /** Define a column within a table schema (name + data type). */
    {
      "type": "sql_define_column",
      "message0": "column %1 type %2",
      "args0": [
        { "type": "field_input", "name": "COL_NAME", "text": "id" },
        {
          "type": "field_dropdown",
          "name": "COL_TYPE",
          "options": [
            ["TEXT", "TEXT"],
            ["INTEGER", "INTEGER"],
            ["REAL", "REAL"],
            ["BOOLEAN", "BOOLEAN"]
          ]
        }
      ],
      "previousStatement": "schema_column",
      "nextStatement": "schema_column",
      "colour": 65
    },

    // ── Query Structure Blocks ─────────────────────────────────────────

    /**
     * Top-level SELECT statement with slots for all SQL clauses:
     * COLUMNS, FROM, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT.
     */
    {
      "type": "sql_query",
      "message0": "SELECT %1 %2 FROM %3 %4 %5 %6 %7 %8",
      "args0": [
        { "type": "field_checkbox", "name": "DISTINCT", "checked": false },
        { "type": "input_statement", "name": "COLUMNS", "check": "select_item" },
        { "type": "input_statement", "name": "FROM", "check": "from_item" },
        { "type": "input_statement", "name": "WHERE", "check": "where_clause" },
        { "type": "input_statement", "name": "GROUP_BY", "check": "group_clause" },
        { "type": "input_statement", "name": "HAVING", "check": "having_clause" },
        { "type": "input_statement", "name": "ORDER_BY", "check": "order_clause" },
        { "type": "input_statement", "name": "LIMIT", "check": "limit_clause" }
      ],
      "colour": 230
    },

    /** Selects all columns (`*`) in the SELECT list. */
    {
      "type": "sql_all_columns",
      "message0": "ALL COLUMNS (*)",
      "previousStatement": "select_item",
      "nextStatement": "select_item",
      "colour": 210
    },

    /** A single expression in the SELECT list with an optional AS alias. */
    {
      "type": "sql_select_item",
      "message0": "column %1 AS %2",
      "args0": [
        { "type": "input_value", "name": "EXPR", "check": "sql_expr" },
        { "type": "field_input", "name": "ALIAS", "text": "" }
      ],
      "previousStatement": "select_item",
      "nextStatement": "select_item",
      "colour": 210
    },

    // ── Condition Blocks ───────────────────────────────────────────────

    /** WHERE clause wrapper — accepts a single condition expression. */
    {
      "type": "sql_where",
      "message0": "WHERE %1",
      "args0": [
        { "type": "input_value", "name": "CONDITION", "check": "sql_expr" }
      ],
      "previousStatement": "where_clause",
      "colour": 230
    },

    /** Binary comparison: `left OP right` (=, !=, <, >, <=, >=). */
    {
      "type": "sql_comparison",
      "message0": "%1 %2 %3",
      "args0": [
        { "type": "input_value", "name": "LEFT", "check": "sql_expr" },
        {
          "type": "field_dropdown",
          "name": "OP",
          "options": [
            ["=", "="], ["!=", "!="], ["<", "<"], [">", ">"], ["<=", "<="], [">=", ">="]
          ]
        },
        { "type": "input_value", "name": "RIGHT", "check": "sql_expr" }
      ],
      "inputsInline": true,
      "output": "sql_expr",
      "colour": 210
    },

    /** Logical operator: `left AND/OR right`. */
    {
      "type": "sql_logical",
      "message0": "%1 %2 %3",
      "args0": [
        { "type": "input_value", "name": "LEFT", "check": "sql_expr" },
        {
          "type": "field_dropdown",
          "name": "OP",
          "options": [
            ["AND", "AND"], ["OR", "OR"]
          ]
        },
        { "type": "input_value", "name": "RIGHT", "check": "sql_expr" }
      ],
      "inputsInline": true,
      "output": "sql_expr",
      "colour": 210
    },

    /** Logical negation: `NOT expr`. */
    {
      "type": "sql_not",
      "message0": "NOT %1",
      "args0": [
        { "type": "input_value", "name": "EXPR", "check": "sql_expr" }
      ],
      "output": "sql_expr",
      "colour": 210
    },

    /** Literal value input (text, number, or boolean keyword). */
    {
      "type": "sql_value",
      "message0": "%1",
      "args0": [
        { "type": "field_input", "name": "VALUE", "text": "0" }
      ],
      "output": "sql_expr",
      "colour": 160
    },
    
    // ── Clause Blocks ──────────────────────────────────────────────────

    /** GROUP BY clause — accepts a column expression to group on. */
    {
      "type": "sql_group_by",
      "message0": "GROUP BY %1",
      "args0": [
        { "type": "input_value", "name": "EXPR", "check": "sql_expr" }
      ],
      "previousStatement": "group_clause",
      "nextStatement": "group_clause",
      "colour": 230
    },

    /** HAVING clause — accepts a condition to filter grouped rows. */
    {
      "type": "sql_having",
      "message0": "HAVING %1",
      "args0": [
        { "type": "input_value", "name": "CONDITION", "check": "sql_expr" }
      ],
      "previousStatement": "having_clause",
      "colour": 230
    },

    /** ORDER BY clause — column expression with ASC/DESC direction. */
    {
      "type": "sql_order_by",
      "message0": "ORDER BY %1 %2",
      "args0": [
        { "type": "input_value", "name": "EXPR", "check": "sql_expr" },
        { "type": "field_dropdown", "name": "DIR", "options": [["ASC", "ASC"], ["DESC", "DESC"]] }
      ],
      "previousStatement": "order_clause",
      "nextStatement": "order_clause",
      "colour": 230
    },

    /** LIMIT clause — restricts the number of returned rows. */
    {
      "type": "sql_limit",
      "message0": "LIMIT %1",
      "args0": [
        { "type": "input_value", "name": "NUM", "check": "sql_expr" }
      ],
      "previousStatement": "limit_clause",
      "colour": 230
    },

    /** Aggregate function: COUNT, SUM, AVG, MIN, or MAX. */
    {
      "type": "sql_agg_func",
      "message0": "%1 ( %2 )",
      "args0": [
        { "type": "field_dropdown", "name": "FUNC", "options": [["COUNT", "COUNT"], ["SUM", "SUM"], ["AVG", "AVG"], ["MIN", "MIN"], ["MAX", "MAX"]] },
        { "type": "input_value", "name": "EXPR", "check": "sql_expr" }
      ],
      "output": "sql_expr",
      "colour": 160
    }
  ]);

  // ── Dynamic Blocks (imperative definitions) ──────────────────────────

  /**
   * `sql_from_table` — Table reference in the FROM clause.
   * Uses a dynamic dropdown that lists all `sql_define_table` blocks.
   */
  Blockly.Blocks['sql_from_table'] = {
    init: function (this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('FROM')
        .appendField(new Blockly.FieldDropdown(createTableDropdown()), 'TABLE')
        .appendField('AS')
        .appendField(new Blockly.FieldTextInput(''), 'ALIAS');

      this.setPreviousStatement(true, 'from_item');
      this.setNextStatement(true, 'from_item');
      this.setColour(120);
    }
  };

  /**
   * `sql_column_expr` — Column reference: `table.column`.
   * First dropdown lists tables (via shared helper), second dropdown
   * dynamically lists columns belonging to the selected table.
   */
  Blockly.Blocks['sql_column_expr'] = {
    init: function (this: Blockly.Block) {
      // Second dropdown: columns belonging to the selected table
      const columnOptions: Blockly.MenuGeneratorFunction = () => {
        const workspace = Blockly.getMainWorkspace();
        if (!workspace) return [['<No Columns>', NONE_SENTINEL]];

        const selectedTable = this.getFieldValue('TABLE');
        if (!selectedTable || selectedTable === NONE_SENTINEL) {
          return [['<Select a Table>', NONE_SENTINEL]];
        }

        // Find the matching sql_define_table block and walk its columns
        const tableDefs = workspace.getBlocksByType(BLOCK_DEFINE_TABLE);
        const tableBlock = tableDefs.find(
          (b) => b.getFieldValue('TABLE_NAME') === selectedTable
        );
        if (!tableBlock) return [['<Table Not Found>', NONE_SENTINEL]];

        const columns: Blockly.MenuOption[] = [];
        let current: Blockly.Block | null = tableBlock.getInputTargetBlock('COLUMNS');
        while (current) {
          const colName = String(current.getFieldValue('COL_NAME') || 'col');
          columns.push([colName, colName]);
          current = current.getNextBlock();
        }

        return columns.length > 0 ? columns : [['<No Columns Defined>', NONE_SENTINEL]];
      };

      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(createTableDropdown()), 'TABLE')
        .appendField('.')
        .appendField(new Blockly.FieldDropdown(columnOptions), 'COLUMN');

      this.setOutput(true, 'sql_expr');
      this.setColour(160);
    }
  };

  /**
   * `sql_join` — JOIN clause with type selector (INNER/LEFT/RIGHT/FULL),
   * a dynamic table dropdown, optional alias, and an ON condition slot.
   */
  Blockly.Blocks['sql_join'] = {
    init: function (this: Blockly.Block) {
      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['INNER JOIN', 'INNER JOIN'],
          ['LEFT JOIN', 'LEFT JOIN'],
          ['RIGHT JOIN', 'RIGHT JOIN'],
          ['FULL JOIN', 'FULL JOIN']
        ]), 'JOIN_TYPE')
        .appendField(new Blockly.FieldDropdown(createTableDropdown()), 'TABLE')
        .appendField('AS')
        .appendField(new Blockly.FieldTextInput(''), 'ALIAS');

      this.appendValueInput('ON')
        .setCheck('sql_expr')
        .appendField('ON');

      this.setPreviousStatement(true, 'from_item');
      this.setNextStatement(true, 'from_item');
      this.setColour(120);
    }
  };
}
