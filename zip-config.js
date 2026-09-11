// This file is deliberately shared by the browser and Worker. The Worker enforces it.
export const SERVICE_NOW_ZIPS = ["33606", "33609", "33611", "33616", "33621", "33629"];
export const BORDER_ZIPS = ["33602", "33607"];
export const FUTURE_EXPANSION_ZIPS = [
  "33603", "33604", "33605", "33614", "33615", "33617", "33619",
  "33626", "33634", "33635"
];

export function zipGate(zip) {
  if (SERVICE_NOW_ZIPS.includes(zip)) return "service_now";
  if (BORDER_ZIPS.includes(zip)) return "border";
  return "waitlist";
}
