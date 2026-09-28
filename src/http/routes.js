import { listAudit } from '../domain/audit.js';
import {
  approveBooking, cancelBooking, clarifyBooking, createBooking, issueBooking,
  rejectBooking, remindBooking, resubmitBooking, returnBooking,
} from '../domain/bookings.js';
import { getBooking, listBookings, listOverdue } from '../domain/bookings-query.js';
import { createEquipment, getEquipment, listEquipment, updateEquipment } from '../domain/equipment.js';
import { listNotifications, markAllRead } from '../domain/notifications.js';
import { permissionsOf } from '../domain/permissions.js';
import { buildReport } from '../domain/reports.js';
import {
  createProblem, createTicket, listProblems, listTickets, updateProblem, updateTicket,
} from '../domain/support.js';
import { listUsers, updateUser } from '../domain/users.js';
import { seedDatabase } from '../seed.js';

const BOOKING_COMMANDS = {
  approve: approveBooking,
  reject: rejectBooking,
  clarify: clarifyBooking,
  resubmit: resubmitBooking,
  cancel: cancelBooking,
  issue: issueBooking,
  return: returnBooking,
  remind: remindBooking,
};

export function registerRoutes(router) {
  router.get('/api/session/users', ({ ctx }) => listUsers(ctx), { public: true });
  router.get('/api/me', ({ actor }) => ({ ...actor, permissions: permissionsOf(actor) }));
  router.post('/api/demo/reset', ({ ctx }) => {
    seedDatabase(ctx.db, ctx.clock.today());
    return { ok: true };
  }, { public: true });

  router.get('/api/equipment', ({ ctx, actor, query }) => listEquipment(ctx, actor, query));
  router.post('/api/equipment', ({ ctx, actor, body }) => createEquipment(ctx, actor, body), { status: 201 });
  router.get('/api/equipment/:id', ({ ctx, actor, params }) => getEquipment(ctx, actor, params.id));
  router.patch('/api/equipment/:id', ({ ctx, actor, params, body }) => updateEquipment(ctx, actor, params.id, body));

  router.get('/api/bookings', ({ ctx, actor, query }) => listBookings(ctx, actor, query));
  router.post('/api/bookings', ({ ctx, actor, body }) => createBooking(ctx, actor, body), { status: 201 });
  router.get('/api/bookings/overdue', ({ ctx, actor }) => listOverdue(ctx, actor));
  router.get('/api/bookings/:id', ({ ctx, actor, params }) => getBooking(ctx, actor, params.id));
  for (const [command, handler] of Object.entries(BOOKING_COMMANDS)) {
    router.post(`/api/bookings/:id/${command}`, ({ ctx, actor, params, body }) => handler(ctx, actor, params.id, body));
  }

  router.get('/api/notifications', ({ ctx, actor }) => listNotifications(ctx, actor));
  router.post('/api/notifications/read', ({ ctx, actor }) => markAllRead(ctx, actor));

  router.get('/api/tickets', ({ ctx, actor }) => listTickets(ctx, actor));
  router.post('/api/tickets', ({ ctx, actor, body }) => createTicket(ctx, actor, body), { status: 201 });
  router.patch('/api/tickets/:id', ({ ctx, actor, params, body }) => updateTicket(ctx, actor, params.id, body));
  router.get('/api/problems', ({ ctx, actor }) => listProblems(ctx, actor));
  router.post('/api/problems', ({ ctx, actor, body }) => createProblem(ctx, actor, body), { status: 201 });
  router.patch('/api/problems/:id', ({ ctx, actor, params, body }) => updateProblem(ctx, actor, params.id, body));

  router.get('/api/users', ({ ctx }) => listUsers(ctx));
  router.patch('/api/users/:id', ({ ctx, actor, params, body }) => updateUser(ctx, actor, params.id, body));
  router.get('/api/reports', ({ ctx, actor, query }) => buildReport(ctx, actor, query));
  router.get('/api/audit', ({ ctx, actor, query }) => listAudit(ctx, actor, query));
  router.get('/api/sla', ({ metrics }) => metrics.snapshot(), { public: true });
}
