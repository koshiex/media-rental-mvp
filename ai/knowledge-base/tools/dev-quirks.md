# Development quirks

## Tests

`npm test` runs `node --test "test/*.test.js"`. Plain `node --test` treats every file under `test/`
as a test file, including `test/helpers.js`. `test/http.test.js` starts a server on `127.0.0.1:0`, so
it fails in environments that forbid binding local ports.

## CSP and the damage photo

The return dialog previews the photo through `URL.createObjectURL`, and the CSP in `src/http/app.js`
must allow `img-src ... blob:`. Without it the image fails to load and the dialog shows
«Не удалось прочитать изображение». Photos are downscaled in the browser to JPEG ≤ 1280 px before
upload; the server accepts only `data:image/(png|jpeg|webp);base64` up to 3 MB of text.

## Switching roles in browser automation

The signed-in user is `localStorage['media-rental.user']`. After a demo reset, user ids follow
`USERS` order in `src/seed-data.js`: 1 Иван (recipient), 2 Анна, 3 Кирилл (no clearance), 4 Мария
(staff), 5 Дмитрий (admin), 6 Елена (support), 7 Ольга (manager). Equipment ids follow `EQUIPMENT`
order (2 = Canon EOS R6, which has a pending request tomorrow — handy for showing the overlap check).

Set the id and reload with the target hash already in place. Changing the hash first triggers the
route guard for the previous role and redirects to that role's home page.

## Resetting data

`npm run seed` or `POST /api/demo/reset` (button on the sign-in screen) rebuilds the demo set relative
to today. The reset endpoint is public by design for recording demos; the server binds to
`127.0.0.1` by default.
