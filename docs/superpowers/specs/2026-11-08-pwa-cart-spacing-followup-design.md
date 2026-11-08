# PWA Cart Spacing Follow-up Design

## Intent

Make the mobile PWA cart match the compact screenshot: product A100/A101 stay adjacent, the transaction date follows the list immediately, and the payment footer remains fixed and usable.

## Goals

- Use a mobile cart content column with `flex-direction: column` and start-aligned content so free height appears only after the content.
- Keep each product row fixed at 72–85 px, with 16 px horizontal page padding, thin separators, and vertical-only scrolling.
- Make QTY 56–64 px wide and 40–44 px high; select all on focus, use the numeric keyboard, and scroll the focused field into view.
- Make the owner-only native date input 40–44 px high, directly below the product list, and hide the non-essential helper text.
- Keep total calculation, product data, cart actions, payment, and checkout behavior unchanged.

## Non-goals

- No API, state model, price, discount, payment, or product data changes.
- No Android UI changes and no changes to unrelated pages.

## Approaches

1. **Final mobile CSS override plus one focus helper (chosen).** Convert the mobile cart scroll region to a start-aligned flex column, set explicit product grid rows, and add `scrollIntoView` to the existing QTY focus handler. This fixes the grid stretching with the smallest surface area and preserves all current markup and logic.
2. **Restructure the cart markup into a new mobile-only component.** Gives maximum layout control but duplicates the existing cart structure and risks drifting from desktop/payment behavior.
3. **Measure available height in JavaScript and assign row sizes dynamically.** Could react to device sizes, but adds resize/keyboard state and recreates the adaptive behavior that caused the bug.

The chosen approach is the smallest safe change because the cart already has the required sections and the defect is caused by mobile layout tracks stretching, not by transaction logic.

## Constraints

- Product rows remain fixed and compact for 1, 2, 5, or 20 items.
- The cart list can scroll vertically but must not scroll horizontally.
- The footer must respect the device safe area.
- Native `input type="date"` remains the date control.
