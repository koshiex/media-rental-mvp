# Domain invariants

## Equipment status is stored, not derived

`equipment.status` is a column that booking commands update as side effects
(`src/domain/bookings.js`, via `changeEquipmentStatus` in `src/domain/equipment.js`):

| Event | Equipment status after |
|---|---|
| Approve booking | `available` → `reserved` (other statuses unchanged) |
| Reject / cancel | `reserved` → `available` only if no other `approved` booking remains |
| Issue | `issued` |
| Return, full kit | `reserved` if another booking is `approved`, else `available` |
| Return, shortage or damage | `inspection` |

Admin manual changes (`updateEquipment`) cannot set `issued` and cannot change the status while an
`issued` booking exists — otherwise the column and the bookings table disagree. Any new command that
moves a booking between statuses must keep this table true and write an audit entry.

Availability for dates is computed from active bookings (`new`, `clarification`, `approved`, `issued`),
not from `equipment.status`. An overdue `issued` booking keeps the item busy through today
(`effectiveEnd` in `equipment.js`).

## Overlap rule (FR-06, NFR-03)

The conflict check and the insert run inside one `BEGIN IMMEDIATE` transaction (`inTransaction` in
`src/db.js`). `new` requests also block the period, not only approved ones. The client-side calendar
highlight in `public/js/views/equipment-card.js` is advisory; the server is the source of truth and
answers 409.

## Audit and notification order

Seed data inserts audit rows booking by booking, so row ids are not chronological. Audit and
notification queries sort by `created_at DESC, id DESC`; keep that order in new queries.
Seed timestamps are local dates with a `Z` suffix, so seeded events display 3 hours later in
Moscow time than their literal value.
