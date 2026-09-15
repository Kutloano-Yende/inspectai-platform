import { Id } from "@inspectai/contracts";
import type { InspectionPlan, RoomCategory } from "@inspectai/contracts";

type RoomCategoryValue = RoomCategory;

/**
 * Seeded default MOVE_OUT plan (SRS FR-006 rooms). Phase 1 has no template
 * builder; the plan is snapshotted onto each inspection at creation, so later
 * changes here never rewrite history.
 */
export function defaultMoveOutPlan(): InspectionPlan {
  let n = 0;
  const cp = (roomCategory: RoomCategoryValue, prompt: string, mandatory = true) => ({
    id: Id.parse(`cp-${++n}`),
    roomCategory,
    prompt,
    mandatory,
    position: n,
  });
  return {
    rooms: [
      { label: "Entrance", roomCategory: "ENTRANCE", checkpoints: [cp("ENTRANCE", "Photograph the entrance door, front and edge")] },
      { label: "Lounge", roomCategory: "LOUNGE", checkpoints: [cp("LOUNGE", "Photograph the lounge walls from the doorway"), cp("LOUNGE", "Photograph the lounge floor")] },
      { label: "Kitchen", roomCategory: "KITCHEN", checkpoints: [cp("KITCHEN", "Photograph the kitchen worktops and sink"), cp("KITCHEN", "Photograph inside the oven and hob")] },
      { label: "Bathroom", roomCategory: "BATHROOM", checkpoints: [cp("BATHROOM", "Photograph the bathroom basin, bath and shower")] },
      { label: "Bedrooms", roomCategory: "BEDROOM", checkpoints: [cp("BEDROOM", "Photograph the walls in each bedroom"), cp("BEDROOM", "Photograph built-in cupboards, open")] },
      { label: "Garden", roomCategory: "GARDEN", checkpoints: [cp("GARDEN", "Photograph the garden and exterior walls", false)] },
    ],
  };
}
