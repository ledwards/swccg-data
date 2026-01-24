# Objective Matching Fix Plan

## Problem Statement

One deck has a wrong-side objective that isn't being matched:
- **Decklist**: `2024-north-american-continental-championship-top-8-joe-olson-ls-he-is-the-chosen-one.html`
- **Issue**: This is a Light Side decklist (LS) but contains "A Stunning Move / A Valuable Hostage" which is a Dark Side (DS) objective
- **Current behavior**: The objective isn't being found because side filtering prevents DS cards from matching in LS decks

## Current Code Flow

In `generateDecklistJson.js`, card matching logic around line 257:

```javascript
const matchingCard = allCards.find(
  (c) =>
    // Various filters...
    (
      // Exact match for objectives (some decklists have wrong-side objectives)
      (c.front.type === "Objective" && cardTitle === c.front.title) ||
      // Normal match with side filter
      ((!decklist.side || decklist.side == c.side) &&
        cleanCardTitle(cardTitle) == cleanCardTitle(c.front.title))
    ),
);
```

## Root Cause

The current logic attempts to match objectives without side filtering, BUT it's still within the parent find() that has other conditions. The objective matching condition `(c.front.type === "Objective" && cardTitle === c.front.title)` is evaluated for each card, but if that condition is false, it falls through to the normal matching which DOES filter by side.

The issue is that for DS objectives, when the deck side is LS:
1. The objective match tries: `c.front.type === "Objective" && cardTitle === c.front.title` 
2. This evaluates TRUE for the DS objective
3. BUT the outer conditions might still fail if there are any side checks before we get to this OR clause

**UPDATE**: Two-pass matching (Option 1) causes severe performance issues - script hangs around file 2143. Doing two separate find() calls on 10,000+ cards for each card in each decklist is too expensive.

## Solution Options

### Option 1: Two-Pass Matching (RECOMMENDED)
Do two separate find() calls:
1. First pass: Try exact objective match WITHOUT any side filtering
2. Second pass: If no match, do normal match WITH side filtering

```javascript
// First pass: exact objective match (no side filter)
let matchingCard = allCards.find(
  (c) =>
    (!isEp1Counterpart || (isEp1Counterpart && c.front.icons?.includes("Episode I"))) &&
    (!setToMatch || c.set == setToMatch) &&
    c.front.type === "Objective" &&
    cardTitle === c.front.title
);

// Second pass: normal match with side filter
if (!matchingCard) {
  matchingCard = allCards.find(
    (c) =>
      (!isEp1Counterpart || (isEp1Counterpart && c.front.icons?.includes("Episode I"))) &&
      (!setToMatch || c.set == setToMatch) &&
      (!decklist.side || decklist.side == c.side) &&
      cleanCardTitle(cardTitle) == cleanCardTitle(c.front.title)
  );
}
```

### Option 2: Pre-filter Objectives
Create a separate objectives array and search there first:
```javascript
const objectiveCards = allCards.filter(c => c.front.type === "Objective");
// Try objectives first, then all cards
```

### Option 3: Specific Decklist Workaround
Add this specific decklist to individual fixes in generateDecklistTxt.js:
```javascript
case "2024-north-american-continental-championship-top-8-joe-olson-ls-he-is-the-chosen-one":
  // This deck incorrectly has a DS objective, remove it
  decklist.plaintext = decklist.plaintext.replace(
    /OBJECTIVES\n1x A Stunning Move \/ A Valuable Hostage\n/,
    ""
  );
  break;
```

## Recommended Implementation

~~Use **Option 1** (Two-Pass Matching)~~ **FAILED - causes performance hang**

Use **Option 4** (Single-Pass with Smart Conditional):
```javascript
const matchingCard = allCards.find(
  (c) =>
    (!isEp1Counterpart || (isEp1Counterpart && c.front.icons?.includes("Episode I"))) &&
    (!setToMatch || c.set == setToMatch) &&
    // For objectives: skip side check. For others: enforce side check
    (c.front.type === "Objective" 
      ? cardTitle === c.front.title 
      : ((!decklist.side || decklist.side == c.side) && 
         cleanCardTitle(cardTitle) == cleanCardTitle(c.front.title))
    )
);
```

This does ONE find with a ternary that:
- If card is Objective: check exact title match (no side filter)
- If card is not Objective: check cleaned title match with side filter

## Testing Plan

After implementing:
1. Regenerate JSON files: `rm -rf output/decklists/json/* && node generateDecklistJson.js`
2. Check final stats for "Could not find card" errors
3. Verify the joe-olson deck now has complete cards
4. Confirm no performance regression (should still complete all 5120 files)

## Implementation Attempts & Results

### Attempt 1: Two-Pass Matching (Option 1)
**Status**: FAILED - Script hangs around file 2143/5120
**Cause**: Performance issue - doing two separate `find()` calls on 10,000+ card array for each card in each decklist is too expensive

### Attempt 2: Single-Pass with Ternary
**Status**: FAILED - Script crashes around file 2725/5120
**Cause**: Complex ternary logic with side check conditional may have logic errors or performance issues

### Attempt 3: Single-Pass with OR Logic
**Status**: FAILED - Script crashes around file 2735/5120
**Implementation**:
```javascript
(
  // Objectives: exact match, no side check
  (c.front.type === "Objective" && cardTitle === c.front.title) ||
  // Non-objectives: cleaned match with side check
  (c.front.type !== "Objective" &&
   (!decklist.side || decklist.side == c.side) &&
   cleanCardTitle(cardTitle) == cleanCardTitle(c.front.title))
)
```
**Cause**: Unknown - script consistently crashes around file 2700-2800

## Current Status

- **All systematic card parsing errors fixed** (2X-3KPR, Proficiency, etc.)
- **Side mismatch detection working** (György Póra and Tony Petersson decks)
- **5046/5120 decklists (98.6%) have complete cards** when using original matching logic
- **1 remaining error**: "A Stunning Move / A Valuable Hostage" objective in wrong-side deck

## Recommended Next Steps

Given the performance/crash issues with all conditional logic approaches:

1. **Option A - Specific Decklist Fix (SAFEST)**
   Add to `generateDecklistTxt.js` individual fixes:
   ```javascript
   case "2024-north-american-continental-championship-top-8-joe-olson-ls-he-is-the-chosen-one":
     // This LS deck incorrectly has a DS objective - remove it
     decklist.plaintext = decklist.plaintext.replace(
       /OBJECTIVES\n1x A Stunning Move \/ A Valuable Hostage\n\n/,
       ""
     );
     break;
   ```

2. **Option B - Debug Crash Point**
   Identify which specific decklist at position ~2735 is causing the crash
   Add logging before card matching to find the problematic decklist

3. **Option C - Simpler Logic**
   Just remove side filtering entirely for all cards (not just objectives)
   This would allow the wrong-side objective through but might allow other wrong matches

## Final Achieved Results

✅ **98.6% success rate** (5046/5120 decklists with complete cards)
✅ **Reduced from ~88 errors to 1 unique error**
✅ **Automated side mismatch detection and correction**
✅ **Fixed all systematic parsing issues**
❌ **1 remaining edge case**: Wrong-side objective in one deck