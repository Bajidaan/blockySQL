/**
 * @module main
 *
 * Application entry point.  Initialises the Blockly workspace, wires up
 * the full compiler pipeline (code generation → AST → validation →
 * optimisation → display), and manages workspace persistence via localStorage.
 *
 * ## Compiler Pipeline (executed on every workspace change)
 *
 * ```
 * ┌──────────────────────────┐
 * │   Blockly Workspace      │
 * └──────────┬───────────────┘
 *            │
 *   ┌────────▼────────┐   ┌──────────────────┐
 *   │ generator.ts    │   │ ast-builder.ts   │
 *   │ (Raw SQL)       │   │ (AST)            │
 *   └────────┬────────┘   └────────┬─────────┘
 *            │                     │
 *            │            ┌────────▼─────────┐
 *            │            │ validator.ts     │
 *            │            │ (block warnings) │
 *            │            └────────┬─────────┘
 *            │            ┌────────▼─────────┐
 *            │            │ optimizer.ts     │
 *            │            │ (simplify AST)   │
 *            │            └────────┬─────────┘
 *            │            ┌────────▼─────────┐
 *            │            │ sql-emitter.ts   │
 *            │            │ (Optimised SQL)  │
 *            │            └────────┬─────────┘
 *   ┌────────▼────────┐  ┌────────▼─────────┐
 *   │ Original Query  │  │ Optimised Query  │
 *   │ (left pane)     │  │ (right pane)     │
 *   └─────────────────┘  └──────────────────┘
 * ```
 */

import * as Blockly from 'blockly';
import { defineBlocks } from './blocks';
import { generator } from './generator';
import { buildAST, buildSchema } from './ast-builder';
import { emitSQL } from './sql-emitter';
import { validateQuery } from './validator';
import { optimizeAST } from './optimizer';
import { BLOCK_QUERY, STORAGE_KEY } from './constants';

// ── Initialisation ────────────────────────────────────────────────────────

/** Register all custom block definitions before creating the workspace. */
defineBlocks();

/** The Blockly workspace with a categorised toolbox. */
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

// ── DOM References ────────────────────────────────────────────────────────

const codeOutput = document.getElementById('codeOutput');
const optimizedOutput = document.getElementById('optimizedOutput');
const errorOutput = document.getElementById('errorOutput');

// ── Workspace Change Handler ──────────────────────────────────────────────

/**
 * Guard flag to prevent re-entrant calls.
 * `block.setWarningText()` fires a workspace change event, which would
 * trigger this handler recursively without this guard.
 */
let isValidating = false;

/**
 * Main event handler — runs the full compiler pipeline whenever the
 * workspace changes (block added, moved, connected, field edited, etc.).
 *
 * Steps:
 * 1. Generate raw SQL via the Blockly string generator (Original Query).
 * 2. Build the AST from the workspace.
 * 3. Run the optimiser and emit the optimised SQL (Optimised Query).
 * 4. Run the validator and attach warnings to offending blocks.
 * 5. Auto-save the workspace to localStorage (for non-UI events only).
 *
 * @param event - The Blockly event that triggered the change.
 */
function handleWorkspaceChange(event: Blockly.Events.Abstract) {
  if (isValidating) return;
  
  try {
    isValidating = true;
    try {
      // Step 1: Raw string generation (only from sql_query blocks)
      let code = '';
      const topBlocks = workspace.getTopBlocks(true);
      for (const block of topBlocks) {
        if (block.type === BLOCK_QUERY) {
          code += generator.blockToCode(block) + '\n';
        }
      }
      code = code.trim();
      
      if (codeOutput) codeOutput.textContent = code || '-- No query blocks in workspace';
      
      // Step 2: AST generation
      const ast = buildAST(workspace);

      // Step 3: Optimisation
      const optimizedAST = optimizeAST(ast);
      const optimizedCode = emitSQL(optimizedAST);
      if (optimizedOutput) optimizedOutput.textContent = optimizedCode || '-- No query blocks in workspace';

      // Step 4: Validation
      const schema = buildSchema(workspace);
      const issues = validateQuery(ast, schema);

      // Map issues by blockId for O(1) lookup
      const issueMap = new Map<string, string>();
      for (const issue of issues) {
        issueMap.set(issue.blockId, issue.message);
      }

      // Update warning text on every block (set or clear)
      const allBlocks = workspace.getAllBlocks(false);
      for (const block of allBlocks) {
        const newWarning = issueMap.get(block.id) || null;
        block.setWarningText(newWarning);
      }

      // Update the error output panel
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

  // Step 5: Auto-save (skip UI-only events like clicking or scrolling)
  if (!event.isUiEvent) {
    const state = Blockly.serialization.workspaces.save(workspace);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

// ── Workspace Restoration ─────────────────────────────────────────────────

/** Restore previously saved workspace state from localStorage, if available. */
const savedState = localStorage.getItem(STORAGE_KEY);
if (savedState) {
  try {
    Blockly.serialization.workspaces.load(JSON.parse(savedState), workspace);
  } catch (e) {
    console.error('Failed to restore workspace:', e);
  }
}

// ── Event Binding ─────────────────────────────────────────────────────────

workspace.addChangeListener(handleWorkspaceChange);
