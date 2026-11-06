# POS Cart Redesign Design

## Intent

Make the Android POS cart easier to scan and faster to use at checkout, based on the approved mockup. Keep the current cart behavior and API flow intact.

## Goals

- Use a denim header with one clear cart title and item count.
- Present products in aligned name, quantity, and total columns.
- Keep quantity editing through the existing keyboard input.
- Keep customer, discount, hold/resume, remove, and payment actions available.
- Keep the payment total visible at the bottom without hiding the cart list.

## Non-goals

- No new transaction fields or backend endpoints.
- No restaurant-specific In/Away mode.
- No delivery, referral, or sharing workflow until those business rules exist.

## Approach

Use a targeted evolution of the existing `_CartSheet` and `_CartLine` widgets. Recompose the current bottom sheet into a denim header, compact customer row, aligned item rows, a compact action tray, and a sticky total/payment footer. This preserves the existing POS navigation and all checkout callbacks.

## Design decisions

- Primary accent: denim `#1E3A5F`, with existing Anyostore light/dark tokens for surfaces and text.
- Quantity remains an editable text field with numeric keyboard.
- Advanced options remain collapsed behind `Lainnya`/options to avoid vertical clutter.
- The existing `Tahan` and `Ambil Tahan` actions remain available from the action tray.

