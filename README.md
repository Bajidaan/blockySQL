# blockySQL — Visual SQL Query Builder

A visual, block-based SQL query builder powered by [Google Blockly](https://developers.google.com/blockly). Users construct SQL queries by dragging and connecting blocks, while a multi-stage compiler pipeline generates, validates, and optimises the SQL in real time.

## Features

- **17 block types** covering the full SQL `SELECT` statement (columns, WHERE, JOIN, GROUP BY, HAVING, ORDER BY, LIMIT, aggregates)
- **Dynamic dropdowns** — table and column selectors auto-populate from user-defined schema blocks
- **3-stage compiler pipeline** — AST generation → semantic validation → query optimisation
- **Live validation** — 5 semantic rules with visual warnings attached directly to offending blocks
- **AST-based optimiser** — constant folding, boolean simplification, tautology elimination, column deduplication
- **Workspace persistence** — auto-saves to `localStorage`

## Architecture

```
┌──────────────────────────────┐
│     Blockly Workspace        │  ← User drags & connects blocks
└──────────────┬───────────────┘
               │
    ┌──────────▼──────────┐
    │   blocks.ts         │  Block definitions (JSON + dynamic JS)
    │   generator.ts      │  Raw SQL string generation (Original Query)
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   ast-builder.ts    │  Walk workspace → typed AST (ast.ts)
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   validator.ts      │  Semantic analysis → warnings on blocks
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   optimizer.ts      │  AST-to-AST transformations
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   sql-emitter.ts    │  AST → SQL string (Optimised Query)
    └──────────┴──────────┘
```

### Source Files

| File                 | Purpose                                                                |
| -------------------- | ---------------------------------------------------------------------- |
| `src/ast.ts`         | TypeScript interfaces defining the AST node types                      |
| `src/ast-builder.ts` | Walks the Blockly workspace to build the AST; also extracts the schema |
| `src/blocks.ts`      | All 17 Blockly block definitions (static JSON + dynamic JS)            |
| `src/constants.ts`   | Centralised block type names and sentinel values                       |
| `src/generator.ts`   | Blockly string-based SQL code generator                                |
| `src/main.ts`        | Entry point — workspace setup, pipeline orchestration, persistence     |
| `src/optimizer.ts`   | AST-to-AST optimisation passes                                         |
| `src/sql-emitter.ts` | Converts AST back to a formatted SQL string                            |
| `src/validator.ts`   | Semantic validation with 5 rules                                       |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm (comes with Node.js)

### Installation

```bash
git clone <repo-url>
cd blockySQL
npm install
```

### Development Server

```bash
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

### Running Tests

```bash
npm test
```

50 unit tests across 4 test files covering blocks, AST, validation, and optimisation.

## Validation Rules

| #   | Rule                                   | Severity | Example                                  |
| --- | -------------------------------------- | -------- | ---------------------------------------- |
| 1   | Missing FROM clause                    | Warning  | `SELECT *` with no FROM                  |
| 2   | Unresolved column/table reference      | Error    | Column `foo` not in any schema           |
| 3   | Type mismatch in comparisons           | Warning  | Comparing INTEGER to TEXT                |
| 4   | Aggregation without GROUP BY           | Warning  | `SELECT name, COUNT(*)` without GROUP BY |
| 5   | Non-aggregated column in grouped query | Error    | `SELECT name … GROUP BY dept`            |

## Optimisation Passes

| Pass                   | Before                          | After                  |
| ---------------------- | ------------------------------- | ---------------------- |
| Constant folding       | `WHERE 5 > 3`                   | `WHERE TRUE`           |
| Boolean simplification | `WHERE TRUE AND salary > 50000` | `WHERE salary > 50000` |
| Duplicate elimination  | `WHERE x = 1 AND x = 1`         | `WHERE x = 1`          |
| Column deduplication   | `SELECT a, b, a`                | `SELECT a, b`          |

## Extending with New Blocks

1. **Define the block** in `src/blocks.ts` (JSON or dynamic JS)
2. **Add a generator** in `src/generator.ts` (`generator.forBlock['your_block'] = ...`)
3. **Add an AST handler** in `src/ast-builder.ts` (inside `buildExprNode` or similar)
4. **Update the emitter** in `src/sql-emitter.ts` if a new node type is introduced
5. **Add to the toolbox** in `src/main.ts`
6. **Write tests** in `tests/`

## Tech Stack

- **[Blockly](https://developers.google.com/blockly)** — Visual block editor
- **TypeScript** — Type-safe source code
- **[Vite](https://vitejs.dev/)** — Dev server and bundler
- **[Vitest](https://vitest.dev/)** — Unit testing framework
