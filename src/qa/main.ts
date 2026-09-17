import { initEventsQa } from "./events";
import { initSpeciesQa } from "./species";
import { initWeatherQa } from "./weather";
import { stopRainAudio } from "../core/rainAudio";

const events = initEventsQa();
const species = initSpeciesQa();
const weather = initWeatherQa();
const requestedPanel = new URLSearchParams(location.search).get("panel");
let selected = requestedPanel === "weather" || requestedPanel === "events" ? requestedPanel : "species";
let raf = 0;
let last = performance.now();
let speciesTime = 0;

function select(panel: string) {
  selected = panel;
  for (const name of ["species", "weather", "events"]) {
    document.getElementById(`${name}-panel`)!.hidden = name !== panel;
    document.getElementById(`${name}-tab`)!.setAttribute("aria-pressed", String(name === panel));
  }
  weather.setActive(panel === "weather" && !document.hidden);
  events.setActive(panel === "events" && !document.hidden);
  if (panel === "species") species.draw();
  const url = new URL(location.href);
  url.searchParams.set("panel", panel);
  history.replaceState(null, "", url);
}
for (const panel of ["species", "weather", "events"]) document.getElementById(`${panel}-tab`)!.onclick = () => select(panel);

function frame(now: number) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (selected === "weather") weather.frame(dt);
  else if (selected === "events") events.frame(dt);
  else { speciesTime += dt * 1000; species.frame(speciesTime); }
  raf = requestAnimationFrame(frame);
}
function suspend() { cancelAnimationFrame(raf); weather.setActive(false); events.setActive(false); stopRainAudio(); }
function resume() {
  cancelAnimationFrame(raf);
  last = performance.now();
  weather.setActive(selected === "weather");
  events.setActive(selected === "events");
  raf = requestAnimationFrame(frame);
}
document.addEventListener("visibilitychange", () => { if (document.hidden) suspend(); else resume(); });
window.addEventListener("pagehide", suspend);
window.addEventListener("pageshow", () => { if (!document.hidden) resume(); });
if (import.meta.hot) import.meta.hot.dispose(() => { suspend(); weather.dispose(); events.dispose(); });
select(selected);
if (!document.hidden) resume();
