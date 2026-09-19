import { z } from "zod";

const localTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
});
const nullableNumber = z.number().finite().nullable();
export const locationSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1).max(120),
  region: z.string().max(120),
  country: z.string().max(120),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timezone,
});
export type WeatherLocation = z.infer<typeof locationSchema>;
export const BALTIMORE: WeatherLocation = {
  id: 4347778,
  name: "Baltimore",
  region: "Maryland",
  country: "United States",
  latitude: 39.29038,
  longitude: -76.61219,
  timezone: "America/New_York",
};
const hourSchema = z.object({
  time: localTime,
  temperature: nullableNumber,
  code: z.number().int().nullable(),
  isDay: z.number().min(0).max(1).nullable(),
  probability: z.number().min(0).max(100).nullable(),
  precipitation: z.number().min(0).nullable(),
});
const currentSchema = z.object({
  time: localTime,
  temperature: z.number().finite(),
  code: z.number().int().nullable(),
  isDay: z.number().min(0).max(1),
  windSpeed: z.number().min(0).nullable(),
  windDirection: z.number().min(0).max(360).nullable(),
});
const snapshotSchema = z.object({
  location: locationSchema,
  fetchedAt: z.number().positive(),
  timezone,
  current: currentSchema,
  hours: z.array(hourSchema).min(24).max(72),
});
export type WeatherSnapshot = z.infer<typeof snapshotSchema>;
export type WeatherHour = z.infer<typeof hourSchema>;
const responseSchema = z.object({
  timezone,
  current_units: z.object({
    temperature_2m: z.literal("°F"),
    wind_speed_10m: z.literal("mp/h"),
  }),
  hourly_units: z.object({
    temperature_2m: z.literal("°F"),
    precipitation: z.literal("inch"),
    precipitation_probability: z.literal("%"),
  }),
  current: z.object({
    time: localTime,
    temperature_2m: z.number().finite(),
    weather_code: z.number().int().nullable(),
    is_day: z.number().min(0).max(1),
    wind_speed_10m: z.number().min(0).nullable(),
    wind_direction_10m: z.number().min(0).max(360).nullable(),
  }),
  hourly: z
    .object({
      time: z.array(localTime).min(24).max(72),
      temperature_2m: z.array(nullableNumber),
      weather_code: z.array(z.number().int().nullable()),
      is_day: z.array(z.number().min(0).max(1).nullable()),
      precipitation_probability: z.array(z.number().min(0).max(100).nullable()),
      precipitation: z.array(z.number().min(0).nullable()),
    })
    .refine(
      (hours) =>
        Object.values(hours).every(
          (values) => values.length === hours.time.length,
        ) &&
        hours.time.every(
          (time, index) => index === 0 || time > hours.time[index - 1],
        ),
    ),
});

export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const CACHE_LIFETIME = 24 * 60 * 60 * 1000;
const LOCATION_KEY = "harvest-weather-location-v1";
const requests = new Map<string, Promise<WeatherSnapshot>>();
const memoryCache = new Map<string, WeatherSnapshot>();
export const locationKey = (location: WeatherLocation) =>
  `${location.latitude},${location.longitude},${location.timezone}`;
const cacheKey = (location: WeatherLocation) =>
  `harvest-weather-v1:${locationKey(location)}`;

export function readWeatherLocation(): WeatherLocation {
  try {
    return locationSchema.parse(
      JSON.parse(localStorage.getItem(LOCATION_KEY) || "null"),
    );
  } catch {
    return BALTIMORE;
  }
}
export function saveWeatherLocation(location: WeatherLocation) {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
  } catch {
    // Location selection still works for this session if storage is full.
  }
}
export function decodeWeatherCache(
  raw: string | null,
  location: WeatherLocation,
  now = Date.now(),
) {
  try {
    const data = snapshotSchema.parse(JSON.parse(raw || "null"));
    if (
      locationKey(data.location) !== locationKey(location) ||
      data.timezone !== location.timezone ||
      now - data.fetchedAt > CACHE_LIFETIME ||
      data.fetchedAt > now + 60_000
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
export function readWeatherCache(
  location: WeatherLocation,
): WeatherSnapshot | null {
  const memory = memoryCache.get(locationKey(location));
  if (memory && Date.now() - memory.fetchedAt <= CACHE_LIFETIME) return memory;
  try {
    return decodeWeatherCache(
      localStorage.getItem(cacheKey(location)),
      location,
    );
  } catch {
    return null;
  }
}
export function parseForecast(
  raw: unknown,
  location: WeatherLocation,
  now = Date.now(),
): WeatherSnapshot {
  const data = responseSchema.parse(raw);
  if (data.timezone !== location.timezone)
    throw new Error("The forecast returned a different time zone.");
  return {
    location,
    fetchedAt: now,
    timezone: data.timezone,
    current: {
      time: data.current.time,
      temperature: data.current.temperature_2m,
      code: data.current.weather_code,
      isDay: data.current.is_day,
      windSpeed: data.current.wind_speed_10m,
      windDirection: data.current.wind_direction_10m,
    },
    hours: data.hourly.time.map((time, i) => ({
      time,
      temperature: data.hourly.temperature_2m[i],
      code: data.hourly.weather_code[i],
      isDay: data.hourly.is_day[i],
      probability: data.hourly.precipitation_probability[i],
      precipitation: data.hourly.precipitation[i],
    })),
  };
}

export function forecastUrl(location: WeatherLocation) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current:
      "temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m",
    hourly:
      "temperature_2m,weather_code,is_day,precipitation_probability,precipitation",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: location.timezone,
    forecast_days: "2",
  }).toString();
  return url;
}
export async function fetchForecast(
  location: WeatherLocation,
  request: typeof fetch = fetch,
) {
  const response = await request(forecastUrl(location), {
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error("Weather is temporarily unavailable. Try again shortly.");
  try {
    return parseForecast(await response.json(), location);
  } catch {
    throw new Error(
      "The weather provider returned an incomplete forecast. Try again shortly.",
    );
  }
}
export async function loadForecast(
  location: WeatherLocation,
  force = false,
): Promise<WeatherSnapshot> {
  const cached = readWeatherCache(location);
  if (!force && cached && Date.now() - cached.fetchedAt < WEATHER_REFRESH_MS)
    return cached;
  const key = locationKey(location);
  const existing = requests.get(key);
  if (existing) return existing;
  const request = fetchForecast(location)
    .then((data) => {
      memoryCache.set(key, data);
      try {
        localStorage.setItem(cacheKey(location), JSON.stringify(data));
      } catch {
        // Keep the live response in memory when device storage is unavailable.
      }
      return data;
    })
    .finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}
export async function searchLocations(
  query: string,
): Promise<WeatherLocation[]> {
  const name = query.trim();
  if (name.length < 2) return [];
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name,
    count: "6",
    language: "en",
    format: "json",
  }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok)
    throw new Error("Location search is unavailable. Please try again.");
  const data = z
    .object({
      results: z
        .array(
          z.object({
            id: z.number().int(),
            name: z.string(),
            admin1: z.string().optional(),
            country: z.string().optional(),
            latitude: z.number(),
            longitude: z.number(),
            timezone,
          }),
        )
        .default([]),
    })
    .parse(await response.json());
  return data.results.map((result) =>
    locationSchema.parse({
      id: result.id,
      name: result.name,
      region: result.admin1 || "",
      country: result.country || "",
      latitude: result.latitude,
      longitude: result.longitude,
      timezone: result.timezone,
    }),
  );
}

export function localNow(timeZone: string, now = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}
export function isWeatherFresh(data: WeatherSnapshot, now = Date.now()) {
  const modelAge =
    Date.parse(`${localNow(data.timezone, now)}Z`) -
    Date.parse(`${data.current.time}Z`);
  return (
    now - data.fetchedAt < WEATHER_REFRESH_MS * 2 &&
    modelAge >= -60_000 &&
    modelAge < 90 * 60_000
  );
}
export function upcomingHours(data: WeatherSnapshot, now = Date.now()) {
  const reference = isWeatherFresh(data, now)
    ? localNow(data.timezone, now)
    : data.current.time;
  return data.hours
    .filter((hour) => hour.time >= reference.slice(0, 13) + ":00")
    .slice(0, 12);
}
export function timelineHours(data: WeatherSnapshot, now = Date.now()) {
  const reference = isWeatherFresh(data, now)
    ? localNow(data.timezone, now)
    : data.current.time;
  return data.hours
    .filter((hour) => hour.time >= reference)
    .filter((_, i) => i % 3 === 0)
    .slice(0, 4);
}
export function formatWeatherHour(time: string) {
  const hour = Number(time.slice(11, 13));
  const minute = time.slice(14, 16);
  return `${hour % 12 || 12}${minute === "00" ? "" : `:${minute}`} ${hour >= 12 ? "PM" : "AM"}`;
}
export function formatWeatherDate(time: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${time.slice(0, 10)}T12:00:00Z`));
}
export function windDirection(degrees: number) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][
    Math.round(degrees / 45) % 8
  ];
}
export function weatherCondition(
  code: number | null,
  isDay: number | null = 1,
) {
  if (code === 0)
    return {
      label: isDay === 0 ? "Clear night" : "Clear sky",
      icon: isDay === 0 ? "moon" : "sun",
    } as const;
  if (code === 1)
    return {
      label: "Mainly clear",
      icon: isDay === 0 ? "moon" : "sun",
    } as const;
  if (code === 2)
    return {
      label: "Partly cloudy",
      icon: isDay === 0 ? "cloud" : "partly",
    } as const;
  if (code === 3) return { label: "Overcast", icon: "cloud" } as const;
  if (code === 45 || code === 48)
    return { label: "Fog", icon: "cloud" } as const;
  if (code !== null && [51, 53, 55].includes(code))
    return { label: "Drizzle", icon: "rain" } as const;
  if (code !== null && [56, 57, 66, 67].includes(code))
    return { label: "Freezing precipitation", icon: "snow" } as const;
  if (code !== null && [61, 63, 65].includes(code))
    return { label: "Rain", icon: "rain" } as const;
  if (code !== null && [80, 81, 82].includes(code))
    return { label: "Rain showers", icon: "rain" } as const;
  if (code !== null && [71, 73, 75, 77, 85, 86].includes(code))
    return { label: "Snow", icon: "snow" } as const;
  if (code !== null && [95, 96, 99].includes(code))
    return { label: "Thunderstorms", icon: "storm" } as const;
  return { label: "Conditions unavailable", icon: "cloud" } as const;
}
export function precipitationOutlook(hours: WeatherHour[]) {
  const probabilities = hours
    .map((hour) => hour.probability)
    .filter((value): value is number => value !== null);
  const peak = probabilities.length ? Math.max(...probabilities) : null;
  const first = hours.find(
    (hour) =>
      (hour.probability !== null && hour.probability >= 40) ||
      (hour.precipitation !== null && hour.precipitation >= 0.004),
  );
  return {
    first,
    peak,
    complete: hours.length >= 12 && probabilities.length === hours.length,
  };
}
