# Owner Copilot Phase 8

Phase 8 keeps the existing `LLM + safe tool registry` architecture and expands coverage by adding high-confidence business tools instead of letting the model query arbitrary data.

## Goal

Cover the most common shop-owner questions with deterministic, shop-scoped, testable tools. The model should only:

- understand the user's question
- choose the right read-only tool(s)
- summarize results in simple Bangla
- ask for clarification or fall back when a tool does not exist

## Rollout Order

### Batch 1: Inventory Intelligence

- total product count
- active vs inactive product count
- tracked vs untracked product count
- out-of-stock count
- low-stock count
- highest stock items
- lowest stock items
- no-sales / dead-stock items in the last N days

Examples:

- `এই দোকানে মোট কয়টা product আছে?`
- `active আর inactive product কয়টা?`
- `out of stock কয়টা?`
- `সবচেয়ে কম stock কোনগুলো?`
- `৩০ দিনে বিক্রি হয়নি কোন পণ্যগুলো?`

### Batch 2: Sales Intelligence

- category-wise sales
- payment-method breakdown
- average order value
- best selling categories
- weak sales days
- sales trend for a product or category

### Batch 3: Customer Intelligence

- total customers
- active customers
- repeat customers
- highest due customers
- customers with no recent activity

### Batch 4: Supplier and Purchase Intelligence

- supplier count
- top suppliers
- payable by supplier
- recent purchases
- items not purchased recently

### Batch 5: Profitability Intelligence

- top profit products
- low margin products
- margin by category
- estimated margin trend

### Batch 6: Safe Action Expansion

- due collection draft
- supplier payment draft
- stock adjustment draft
- simple product draft

## Guardrails

- no raw database access from the model
- no dynamic SQL generation by the model
- every tool must be shop-scoped and permission-safe
- write actions must stay confirmation-based
- unsupported questions should produce an honest fallback

## Phase 8 Start

This initial implementation starts with Batch 1 inventory intelligence tools.
