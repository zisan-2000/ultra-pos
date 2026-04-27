# Owner Copilot UI/UX Spec

## Goal

Owner-facing copilot should feel reliable without forcing users to understand internal engine names like `LLM`, `Tool mode`, or `Rule`.

## User-facing principles

1. Default mode is `Auto`
2. Technical engine names are hidden
3. Trust is communicated in plain language
4. Write actions always show a confirmation card before save
5. Response preference is optional and uses business language, not AI jargon

## Response preference selector

Visible above the ask box as 3 cards:

1. `Auto`
   - Default and recommended
   - Best overall balance between speed and verification

2. `ডাটা দিয়ে যাচাই`
   - Prefer shop-data-backed answers first
   - Best when user wants confidence over flexibility

3. `দ্রুত উত্তর`
   - Prefer quick deterministic answers first
   - Best for simple sales/cash/due questions

## Routing behavior

### Auto

Execution order:

1. Action draft / clarification
2. Tool-backed answer
3. Context-only LLM answer
4. Rule answer
5. Unsupported fallback

### ডাটা দিয়ে যাচাই

Execution order:

1. Action draft / clarification
2. Tool-backed answer
3. Rule answer
4. Context-only LLM answer
5. Unsupported fallback

### দ্রুত উত্তর

Execution order:

1. Action draft / clarification
2. Rule answer
3. Tool-backed answer
4. Context-only LLM answer
5. Unsupported fallback

## Trust labels

Use these badges instead of internal engine names:

1. `ডাটা দিয়ে যাচাই করা`
2. `AI উত্তর`
3. `Confirm দরকার`
4. `কাজ সম্পন্ন`
5. `আরও তথ্য দরকার`
6. `এখন unavailable`

Optional secondary status:

1. `বিকল্প পথে উত্তর`

## Confirmation card copy

Header:

- `Confirmation Needed`

Safety badge:

- `Confirm না করা পর্যন্ত কিছু save হবে না`

## Conversation UI

1. Top-right latest-status badge shows trust label only
2. Message badges show:
   - trust label
   - selected response preference (`Auto`, `ডাটা দিয়ে যাচাই`, `দ্রুত উত্তর`)
   - optional fallback badge
3. Provider and tool names are hidden from owner-facing UI

## Why this is better

1. User can choose style without learning AI internals
2. Reliability signals are clear
3. Support/debug complexity stays in backend
4. Owner experience remains simple and trustworthy
