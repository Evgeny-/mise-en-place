/**
 * World-space placement of the kitchen (XZ plane, Y up; +Z is down on screen, towards the chef).
 * One chef's counter (worktop at y = 0) fills the screen below the guests and runs on past its
 * bottom edge, to where the chef stands. From the top of the screen down: the dining-room wall,
 * the guests on their stools, the low serving ledge along the far side of the counter, the
 * cutting board with the counter slots, the pantry columns.
 */
export interface Layout {
  tilt: number;
  /** pantry */
  colX: number[];
  colPitch: number;
  tile: number;
  /** z of the front row (top items); deeper rows go towards +z */
  rowZ0: number;
  rowStep: number;
  rows: number;
  /** chef's counter */
  slotX: number[];
  slotZ: number;
  slotPitch: number;
  /** guests */
  seatX: number[];
  seatZ: number;
  /** the guests' serving ledge: front edge z, back edge z, top height above the worktop */
  barFrontZ: number;
  barBackZ: number;
  barTop: number;
  /** the dining-room floor the guests' stools stand on, below the worktop */
  floorY: number;
  /** where a served dish is put down in front of a guest */
  plateZ: number;
  wallZ: number;
  /** half width of the content */
  halfW: number;
  /** extremes for the camera fit */
  minZ: number;
  maxZ: number;
}

export interface LayoutInput {
  /** landscape: tickets go beside the guests, so seats are wider apart */
  wide?: boolean;
  columns: number;
  rows: number;
  slots: number;
  seats: number;
}

export const TILT = 0.62;
/** Guests are modelled at seat scale 1 (head top ~1.57); in the game they sit a little larger. */
export const GUEST_SCALE = 1.22;

function spread(n: number, pitch: number): number[] {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * pitch);
}

export function computeLayout(inp: LayoutInput): Layout {
  const colPitch = inp.columns >= 6 ? 1.1 : 1.2;
  const tile = colPitch * 0.86;
  const rowStep = 1.0;
  const rows = Math.max(3, inp.rows);
  const rowZ0 = 0;
  const slotPitch = inp.slots >= 6 ? 1.12 : 1.26;
  const slotZ = -1.5;
  const seatPitch = inp.wide ? 3.6 : inp.seats >= 3 ? 2.3 : 2.5;
  const seatZ = -4.18;
  // the ledge is deep enough for the paws and the placemat in front of them
  const barFrontZ = -2.6;
  const barBackZ = seatZ + 0.27 * GUEST_SCALE;
  // a low ledge, like at a sushi bar: the guests eat at the same counter the chef works on
  const barTop = 0.2;
  // placemats a little in front of the paws, so the paws rest on the bare ledge
  const plateZ = seatZ + 0.82 * GUEST_SCALE + 0.16;
  const wallZ = -5.15;
  const halfW = Math.max(
    (inp.columns * colPitch) / 2 + 0.25,
    (inp.slots * slotPitch) / 2 + 0.35,
    (Math.max(2, inp.seats) * seatPitch) / 2,
    2.95,
  );
  return {
    tilt: TILT,
    colX: spread(inp.columns, colPitch),
    colPitch,
    tile,
    rowZ0,
    rowStep,
    rows,
    slotX: spread(inp.slots, slotPitch),
    slotZ,
    slotPitch,
    seatX: spread(inp.seats, seatPitch),
    seatZ,
    barFrontZ,
    barBackZ,
    barTop,
    floorY: barTop - 0.62,
    plateZ,
    wallZ,
    halfW,
    minZ: seatZ,
    maxZ: rowZ0 + (rows - 1) * rowStep + 0.75,
  };
}

/** Screen-up coordinate of a world point for the play camera (larger = higher on screen). */
export function screenUp(y: number, z: number, tilt = TILT): number {
  return -z * Math.cos(tilt) + y * Math.sin(tilt);
}
