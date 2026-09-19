import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BALTIMORE,
  decodeWeatherCache,
  fetchForecast,
  forecastUrl,
  formatWeatherHour,
  isWeatherFresh,
  localNow,
  parseForecast,
  precipitationOutlook,
  timelineHours,
  upcomingHours,
  weatherCondition,
  windDirection,
} from "./weather.ts";

const now = Date.parse("2026-09-19T17:30:00Z");
function response() {
  return {
    timezone: "America/New_York",
    current_units: { temperature_2m: "°F", wind_speed_10m: "mp/h" },
    hourly_units: {
      temperature_2m: "°F",
      precipitation: "inch",
      precipitation_probability: "%",
    },
    current: {
      time: "2026-09-19T13:30",
      temperature_2m: 76.5,
      weather_code: 2,
      is_day: 1,
      wind_speed_10m: 5.3,
      wind_direction_10m: 75,
    },
    hourly: {
      time: Array.from(
        { length: 48 },
        (_, i) =>
          `2026-09-${i < 24 ? "19" : "20"}T${String(i % 24).padStart(2, "0")}:00`,
      ),
      temperature_2m: Array<number | null>(48).fill(76),
      weather_code: Array<number | null>(48).fill(2),
      is_day: Array<number | null>(48).fill(1),
      precipitation_probability: Array<number | null>(48).fill(10),
      precipitation: Array<number | null>(48).fill(0),
    },
  };
}

test("live weather requests the user's location, local times, Fahrenheit and mph", () => {
  const url = forecastUrl(BALTIMORE);
  assert.equal(url.hostname, "api.open-meteo.com");
  assert.equal(url.searchParams.get("latitude"), "39.29038");
  assert.equal(url.searchParams.get("longitude"), "-76.61219");
  assert.equal(url.searchParams.get("temperature_unit"), "fahrenheit");
  assert.equal(url.searchParams.get("wind_speed_unit"), "mph");
  assert.equal(url.searchParams.get("timezone"), "America/New_York");
  const data = parseForecast(response(), BALTIMORE, now);
  assert.equal(data.current.temperature, 76.5);
  assert.equal(data.current.windSpeed, 5.3);
  assert.equal(data.hours.length, 48);
});

test("API outages and invalid payloads cannot become successful sample forecasts", async () => {
  const failed = (async () =>
    new Response("Unavailable", { status: 503 })) as typeof fetch;
  await assert.rejects(
    () => fetchForecast(BALTIMORE, failed),
    /temporarily unavailable/,
  );
  const malformed = (async () =>
    Response.json({ current: { temperature_2m: 64 } })) as typeof fetch;
  await assert.rejects(
    () => fetchForecast(BALTIMORE, malformed),
    /incomplete forecast/,
  );
  const wrongUnits = response();
  wrongUnits.current_units.temperature_2m = "°C";
  assert.throws(() => parseForecast(wrongUnits, BALTIMORE, now));
  const unequal = response();
  unequal.hourly.temperature_2m.pop();
  assert.throws(() => parseForecast(unequal, BALTIMORE, now));
});

test("missing precipitation values remain unknown instead of becoming a dry forecast", () => {
  const raw = response();
  raw.hourly.precipitation_probability.fill(null);
  raw.hourly.precipitation.fill(null);
  const outlook = precipitationOutlook(
    upcomingHours(parseForecast(raw, BALTIMORE, now), now),
  );
  assert.equal(outlook.peak, null);
  assert.equal(outlook.first, undefined);
  assert.equal(outlook.complete, false);
  const zero = response();
  zero.hourly.precipitation_probability.fill(0);
  const dry = precipitationOutlook(
    upcomingHours(parseForecast(zero, BALTIMORE, now), now),
  );
  assert.equal(dry.peak, 0);
  assert.equal(dry.complete, true);
});

test("precipitation risk uses future hourly probabilities and amounts, not a fixed rain time", () => {
  const raw = response();
  raw.hourly.precipitation_probability[5] = 90;
  raw.hourly.precipitation_probability[16] = 70;
  const outlook = precipitationOutlook(
    upcomingHours(parseForecast(raw, BALTIMORE, now), now),
  );
  assert.equal(outlook.first?.time, "2026-09-19T16:00");
  assert.equal(outlook.peak, 70);
  raw.hourly.precipitation[14] = 0.02;
  assert.equal(
    precipitationOutlook(upcomingHours(parseForecast(raw, BALTIMORE, now), now))
      .first?.time,
    "2026-09-19T14:00",
  );
});

test("display times use the farm's zone, including next-day forecasts and winter offsets", () => {
  assert.equal(localNow("America/New_York", now), "2026-09-19T13:30");
  assert.equal(
    localNow("America/New_York", Date.parse("2026-12-19T17:30Z")),
    "2026-12-19T12:30",
  );
  assert.equal(formatWeatherHour("2026-09-20T00:00"), "12 AM");
  assert.equal(formatWeatherHour("2026-09-19T13:30"), "1:30 PM");
  const raw = response();
  raw.current.time = "2026-09-19T23:30";
  const late = Date.parse("2026-09-20T03:30Z");
  const data = parseForecast(raw, BALTIMORE, late);
  assert.deepEqual(
    timelineHours(data, late).map((hour) => hour.time),
    [
      "2026-09-20T00:00",
      "2026-09-20T03:00",
      "2026-09-20T06:00",
      "2026-09-20T09:00",
    ],
  );
});

test("cache rejects another location, malformed data, future dates and forecasts older than 24 hours", () => {
  const data = parseForecast(response(), BALTIMORE, now);
  const raw = JSON.stringify(data);
  assert.deepEqual(decodeWeatherCache(raw, BALTIMORE, now + 60_000), data);
  assert.equal(
    decodeWeatherCache(raw, { ...BALTIMORE, latitude: 40 }, now),
    null,
  );
  assert.equal(decodeWeatherCache(raw, BALTIMORE, now + 25 * 3600_000), null);
  assert.equal(decodeWeatherCache(raw, BALTIMORE, now - 3600_000), null);
  assert.equal(decodeWeatherCache("{bad", BALTIMORE, now), null);
});

test("a recent fetch cannot label an old model reading as current weather", () => {
  const data = parseForecast(response(), BALTIMORE, now);
  assert.equal(isWeatherFresh(data, now), true);
  assert.equal(isWeatherFresh(data, now + 31 * 60_000), false);
  const raw = response();
  raw.current.time = "2026-09-19T08:00";
  assert.equal(isWeatherFresh(parseForecast(raw, BALTIMORE, now), now), false);
});

test("night, rain, snow, storms and unknown codes have distinct truthful labels", () => {
  assert.equal(weatherCondition(0, 0).icon, "moon");
  assert.equal(weatherCondition(61).label, "Rain");
  assert.equal(weatherCondition(73).icon, "snow");
  assert.equal(weatherCondition(95).icon, "storm");
  assert.equal(weatherCondition(999).label, "Conditions unavailable");
  assert.equal(windDirection(360), "N");
  assert.equal(windDirection(75), "E");
});
