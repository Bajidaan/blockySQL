import * as Blockly from 'blockly';
import { defineBlocks } from './blocks';
import { generator } from './generator';
import { buildAST, buildSchema } from './ast-builder';
import { emitSQL } from './sql-emitter';
import { validateQuery } from './validator';
import { optimizeAST } from './optimizer';

// define blocks
defineBlocks();

// workspace
const workspace = Blockly.inject('blocklyDiv', {
  toolbox: {
    "kind": "categoryToolbox",
    "contents": [
      {
        "kind": "category", "name": "Schema", "colour": "65",
        "contents": [
          { "kind": "block", "type": "sql_define_table" },
          { "kind": "block", "type": "sql_define_column" }
        ]
      },
      {
        "kind": "category", "name": "Query", "colour": "230",
        "contents": [
          { "kind": "block", "type": "sql_query" },
          { "kind": "block", "type": "sql_all_columns" },
          { "kind": "block", "type": "sql_select_item" },
          { "kind": "block", "type": "sql_where" },
          { "kind": "block", "type": "sql_group_by" },
          { "kind": "block", "type": "sql_having" },
          { "kind": "block", "type": "sql_order_by" },
          { "kind": "block", "type": "sql_limit" }
        ]
      },
      {
        "kind": "category", "name": "Conditions", "colour": "210",
        "contents": [
          { "kind": "block", "type": "sql_comparison" },
          { "kind": "block", "type": "sql_logical" },
          { "kind": "block", "type": "sql_not" }
        ]
      },
      {
        "kind": "category", "name": "Expressions", "colour": "160",
        "contents": [
          { "kind": "block", "type": "sql_column_expr" },
          { "kind": "block", "type": "sql_value" },
          { "kind": "block", "type": "sql_agg_func" }
        ]
      },
      {
        "kind": "category", "name": "Tables", "colour": "120",
        "contents": [
          { "kind": "block", "type": "sql_from_table" },
          { "kind": "block", "type": "sql_join" }
        ]
      }
    ]
  }
});

// show code and errors
const codeOutput = document.getElementById('codeOutput');
const optimizedOutput = document.getElementById('optimizedOutput');
const errorOutput = document.getElementById('errorOutput');

let isValidating = false;

// generate code and auto-save whenever the workspace changes
function handleWorkspaceChange(event: Blockly.Events.Abstract) {
  if (isValidating) return;
  
  try {
    isValidating = true;
    try {
      // 1. Raw string generation
      let code = '';
      const topBlocks = workspace.getTopBlocks(true);
      for (const block of topBlocks) {
        if (block.type === 'sql_query') {
          code += generator.blockToCode(block) + '\n';
        }
      }
      code = code.trim();
      
      if (codeOutput) codeOutput.textContent = code || '-- No query blocks in workspace';
      
      // 2. AST generation & Validation
      const ast = buildAST(workspace);

      // 3. Optimization
      const optimizedAST = optimizeAST(ast);
      const optimizedCode = emitSQL(optimizedAST);
      if (optimizedOutput) optimizedOutput.textContent = optimizedCode || '-- No query blocks in workspace';

      const schema = buildSchema(workspace);
      const issues = validateQuery(ast, schema);

      // Map issues by blockId
      const issueMap = new Map<string, string>();
      for (const issue of issues) {
        issueMap.set(issue.blockId, issue.message);
      }

      // Update warnings on all blocks ONLY if they have changed
      // This prevents unnecessary UI updates and infinite loops
      const allBlocks = workspace.getAllBlocks(false);
      for (const block of allBlocks) {
        const newWarning = issueMap.get(block.id) || null;
        block.setWarningText(newWarning);
      }

      if (errorOutput) {
        if (issues.length > 0) {
          errorOutput.textContent = `Found ${issues.length} issue(s). Check blocks for warnings.`;
          errorOutput.style.color = 'orange';
        } else {
          errorOutput.textContent = 'No errors found.';
          errorOutput.style.color = 'green';
        }
      }
    } finally {
      isValidating = false;
    }
  } catch (e) {
    if (errorOutput) {
      errorOutput.textContent = e instanceof Error ? e.message : String(e);
      errorOutput.style.color = 'red';
    }
  }

  // Auto-save to localStorage if this is a functional change (not just clicking/scrolling)
  if (!event.isUiEvent) {
    const state = Blockly.serialization.workspaces.save(workspace);
    localStorage.setItem('blockySQL_workspace', JSON.stringify(state));
  }
}

// Load saved workspace from localStorage
const savedState = localStorage.getItem('blockySQL_workspace');
if (savedState) {
  try {
    Blockly.serialization.workspaces.load(JSON.parse(savedState), workspace);
  } catch (e) {
    console.error('Failed to restore workspace:', e);
  }
}

// listen to changes
workspace.addChangeListener(handleWorkspaceChange);
