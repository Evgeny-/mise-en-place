/**
 * Animal guests sitting across the counter: procedural chibi bear, cat, fox, bunny, panda, frog, pig
 * and raccoon with idle life, look-at, anticipation, eating, delight, arrival and goodbye.
 *
 *   const guest = new Guest('fox');
 *   guest.group.position.set(seatX, seatY, seatZ); // centre of the seat, facing +z
 *   scene.add(guest.group);
 *   guest.arrive();
 *   // every frame: guest.update(dt, time);
 */
export { Guest, ARRIVE_DURATION, LEAVE_DURATION, EAT_DURATION, DELIGHT_DURATION, type GuestState } from './Guest';
export { GUEST_KINDS, GUEST_LAYOUT, type GuestKind } from './species';
export { createStool } from './stool';
export { guestMaterials, disposeGuestMaterials } from './materials';
