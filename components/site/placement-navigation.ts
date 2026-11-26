/** Shared by the placement camera and the gumball so a handle drag does not orbit. */

let suspended = false;
let suppressClick = false;

export function setPlacementCameraSuspended(value: boolean) {
  suspended = value;
}

export function placementCameraSuspended() {
  return suspended;
}

export function markPlacementDrag() {
  suppressClick = true;
}

export function placementClickSuppressed() {
  if (!suppressClick) return false;
  suppressClick = false;
  return true;
}
