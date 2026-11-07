# Transfer Cancellation Design

## Intent

Add a safe “Batalkan Transfer” action for completed stock transfers. The
original transfer remains visible for audit, its status changes to `cancelled`,
and the stock movement is reversed atomically.

## Goals

- Allow only `owner` and `gudang` to cancel a transfer.
- Reverse both sides of same-branch and inter-store transfers.
- Reject cancellation when the destination no longer has enough stock to undo
  the transfer; no partial changes may remain.
- Make cancellation idempotent: a cancelled transfer cannot be cancelled again.
- Preserve the original transfer number, items, route, and history entry.
- Add confirmation and optional reason in the web and Android transfer history.

## Non-goals

- Do not delete transfer records or product/catalog records.
- Do not change the existing transfer creation flow or permissions.
- Do not create a second user-visible transfer record for the reversal.
- Do not cancel pending/approved legacy transfers; only `completed` transfers
  created by the current flow are eligible.

## Chosen approach

Use an authenticated `POST /api/inventory-control/transfers/:id/cancel`
endpoint. It locks the transfer and its items, verifies the caller scope and
status, reverses destination quantities first and source quantities second via
the existing `adjustStock()` path, writes `stock_mutations` with
`reference_type = 'transfer_cancel'`, updates the transfer to `cancelled`, and
records `cancelled_by`, `cancelled_at`, and an optional reason. All work runs in
one database transaction.

This is preferred over a new inverse transfer because it keeps one audit row
and makes the original history card immediately explain its final state.

## API contract

`POST /api/inventory-control/transfers/:id/cancel`

Request body:

```json
{ "reason": "Salah pilih gudang tujuan" }
```

Success response:

```json
{
  "success": true,
  "data": { "id": 42, "status": "cancelled" }
}
```

Errors: `403` for roles/scope without permission, `404` for an unknown
transfer, `409` for an already-cancelled transfer, and `400` for a transfer
that is not `completed` or whose destination stock cannot be restored.

## UI behavior

- Web history cards show “Batalkan transfer” only for owner/gudang and
  `completed` rows. Confirmation asks for an optional reason and refreshes the
  list after success.
- Android history cards use the same status and permission rule, with a
  confirmation dialog and optional reason field.
- Cancelled rows keep their original route and item details and show the
  existing “Dibatalkan” status label.

## Verification

- Backend route tests cover permission, same-branch reversal, inter-store
  product/variant mapping, insufficient destination stock rollback, and repeat
  cancellation.
- Web and Android tests cover visibility, confirmation, request payload, and
  refresh behavior.
- Existing backend/frontend/mobile relevant suites and release builds remain
  the final gate.
