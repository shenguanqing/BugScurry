import { drawBug } from "../core/renderer";
import { registerSpecies } from "./registry";

/** First shipped species. Renderer currently owns the drawing; this entry
 *  exists so later species can plug in without touching the main loop. */
registerSpecies({
  id: "cockroach",
  label: "蟑螂",
  draw(ctx, bug) {
    drawBug(ctx, bug);
  },
});
