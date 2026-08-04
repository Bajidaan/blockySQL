import * as Blockly from 'blockly';

export function defineBlocks() {
  Blockly.defineBlocksWithJsonArray([
    // https://developers.google.com/blockly/guides/create-custom-blocks/define/block-definitions

    // sql_define_table Block
    // Define a table schema
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

    // sql_define_column 
    // Define a column in a table schema
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

    // sql_query
    // SELECT statement
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

    // sql_all_columns 
    // Block for all columns
    {
      "type": "sql_all_columns",
      "message0": "ALL COLUMNS (*)",
      "previousStatement": "select_item",
      "nextStatement": "select_item",
      "colour": 210
    },

    // sql_select_item
    // A single expression in the SELECT list with optional alias
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

    //WHERE Clause and Conditions
    {
      "type": "sql_where",
      "message0": "WHERE %1",
      "args0": [
        { "type": "input_value", "name": "CONDITION", "check": "sql_expr" }
      ],
      "previousStatement": "where_clause",
      "colour": 230
    },
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
    {
      "type": "sql_not",
      "message0": "NOT %1",
      "args0": [
        { "type": "input_value", "name": "EXPR", "check": "sql_expr" }
      ],
      "output": "sql_expr",
      "colour": 210
    },
    {
      "type": "sql_value",
      "message0": "%1",
      "args0": [
        { "type": "field_input", "name": "VALUE", "text": "0" }
      ],
      "output": "sql_expr",
      "colour": 160
    },
    
    // GROUP BY
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

    // HAVING
    {
      "type": "sql_having",
      "message0": "HAVING %1",
      "args0": [
        { "type": "input_value", "name": "CONDITION", "check": "sql_expr" }
      ],
      "previousStatement": "having_clause",
      "colour": 230
    },

    // ORDER BY
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

    // LIMIT
    {
      "type": "sql_limit",
      "message0": "LIMIT %1",
      "args0": [
        { "type": "input_value", "name": "NUM", "check": "sql_expr" }
      ],
      "previousStatement": "limit_clause",
      "colour": 230
    },
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

  // sql_from_table 
  // Block for dynamic dropdown of table names
  Blockly.Blocks['sql_from_table'] = {
    init: function (this: Blockly.Block) {

      const tableOptions: Blockly.MenuGeneratorFunction = () => {
        const workspace = Blockly.getMainWorkspace();
        if (!workspace) return [['<No Tables>', 'NONE']];

        const tableDefs = workspace.getBlocksByType('sql_define_table');
        if (tableDefs.length === 0) {
          return [['<No Tables Defined>', 'NONE']];
        }

        return tableDefs.map((block): Blockly.MenuOption => {
          const name = String(block.getFieldValue('TABLE_NAME') || 'unnamed');
          return [name, name];
        });
      };

      this.appendDummyInput()
        .appendField('FROM')
        .appendField(new Blockly.FieldDropdown(tableOptions), 'TABLE')
        .appendField('AS')
        .appendField(new Blockly.FieldTextInput(''), 'ALIAS');

      this.setPreviousStatement(true, 'from_item');
      this.setNextStatement(true, 'from_item');
      this.setColour(120);
    }
  };

  // sql_column_expr
  // Dynamic column reference: table.column
  Blockly.Blocks['sql_column_expr'] = {
    init: function (this: Blockly.Block) {
      // First dropdown: table names (same pattern as sql_from_table)
      const tableOptions: Blockly.MenuGeneratorFunction = () => {
        const workspace = Blockly.getMainWorkspace();
        if (!workspace) return [['<No Tables>', 'NONE']];

        const tableDefs = workspace.getBlocksByType('sql_define_table');
        if (tableDefs.length === 0) return [['<No Tables>', 'NONE']];

        return tableDefs.map((block): Blockly.MenuOption => {
          const name = String(block.getFieldValue('TABLE_NAME') || 'unnamed');
          return [name, name];
        });
      };

      // Second dropdown: columns belonging to the selected table
      const columnOptions: Blockly.MenuGeneratorFunction = () => {
        const workspace = Blockly.getMainWorkspace();
        if (!workspace) return [['<No Columns>', 'NONE']];

        const selectedTable = this.getFieldValue('TABLE');
        if (!selectedTable || selectedTable === 'NONE') {
          return [['<Select a Table>', 'NONE']];
        }

        // Find the matching sql_define_table block
        const tableDefs = workspace.getBlocksByType('sql_define_table');
        const tableBlock = tableDefs.find(
          (b) => b.getFieldValue('TABLE_NAME') === selectedTable
        );
        if (!tableBlock) return [['<Table Not Found>', 'NONE']];

        // Walk the COLUMNS statement input to collect column names
        const columns: Blockly.MenuOption[] = [];
        let current: Blockly.Block | null = tableBlock.getInputTargetBlock('COLUMNS');
        while (current) {
          const colName = String(current.getFieldValue('COL_NAME') || 'col');
          columns.push([colName, colName]);
          current = current.getNextBlock();
        }

        return columns.length > 0 ? columns : [['<No Columns Defined>', 'NONE']];
      };

      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown(tableOptions), 'TABLE')
        .appendField('.')
        .appendField(new Blockly.FieldDropdown(columnOptions), 'COLUMN');

      this.setOutput(true, 'sql_expr');
      this.setColour(160);
    }
  };

  // JOIN Support
  // sql_join
  // Block for joining tables
  Blockly.Blocks['sql_join'] = {
    init: function (this: Blockly.Block) {
      const tableOptions: Blockly.MenuGeneratorFunction = () => {
        const workspace = Blockly.getMainWorkspace();
        if (!workspace) return [['<No Tables>', 'NONE']];

        const tableDefs = workspace.getBlocksByType('sql_define_table');
        if (tableDefs.length === 0) return [['<No Tables Defined>', 'NONE']];

        return tableDefs.map((block): Blockly.MenuOption => {
          const name = String(block.getFieldValue('TABLE_NAME') || 'unnamed');
          return [name, name];
        });
      };

      this.appendDummyInput()
        .appendField(new Blockly.FieldDropdown([
          ['INNER JOIN', 'INNER JOIN'],
          ['LEFT JOIN', 'LEFT JOIN'],
          ['RIGHT JOIN', 'RIGHT JOIN'],
          ['FULL JOIN', 'FULL JOIN']
        ]), 'JOIN_TYPE')
        .appendField(new Blockly.FieldDropdown(tableOptions), 'TABLE')
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
