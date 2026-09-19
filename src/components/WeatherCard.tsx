import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudRain,
  Location,
  Moon,
  PartlyCloudy,
  Refresh,
  Search,
  Snow,
  Storm,
  Sun,
  WifiOff,
  X,
} from "../icons";
import { formatHour } from "../lib/planning";
import {
  formatWeatherDate,
  formatWeatherHour,
  isWeatherFresh,
  loadForecast,
  locationKey,
  precipitationOutlook,
  readWeatherCache,
  readWeatherLocation,
  saveWeatherLocation,
  searchLocations,
  timelineHours,
  upcomingHours,
  weatherCondition,
  WEATHER_REFRESH_MS,
  windDirection,
} from "../lib/weather";
import type { WeatherLocation, WeatherSnapshot } from "../lib/weather";

const icons = {
  sun: Sun,
  moon: Moon,
  partly: PartlyCloudy,
  cloud: Cloud,
  rain: CloudRain,
  snow: Snow,
  storm: Storm,
};
function WeatherSymbol({
  code,
  isDay,
  size = 21,
}: {
  code: number | null;
  isDay: number | null;
  size?: number;
}) {
  const condition = weatherCondition(code, isDay);
  const Icon = icons[condition.icon];
  return (
    <span
      className={`weather-symbol ${condition.icon}`}
      role="img"
      aria-label={condition.label}
    >
      <Icon size={size} />
    </span>
  );
}

function LocationDialog({
  onSelect,
  onClose,
}: {
  onSelect: (location: WeatherLocation) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const requestId = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = ref.current!;
    element.showModal();
    element.querySelector("input")?.focus();
    return () => {
      requestId.current++;
      element.close();
    };
  }, []);
  async function search(event: FormEvent) {
    event.preventDefault();
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const locations = await searchLocations(query);
      if (id === requestId.current) {
        setResults(locations);
        setSearched(true);
      }
    } catch {
      if (id === requestId.current)
        setError(
          "We couldn’t search locations. Check your connection and try again.",
        );
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="dialog weather-location-dialog"
      aria-labelledby="weather-location-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="dialog-header">
        <div>
          <p className="eyebrow">WEATHER</p>
          <h2 id="weather-location-title">Farm location</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close location search"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">
        <p className="dialog-description">
          Choose the city closest to your fields.
        </p>
        <form className="weather-search-form" onSubmit={search}>
          <label className="form-field">
            City or ZIP code
            <input
              value={query}
              maxLength={100}
              minLength={2}
              required
              placeholder="e.g. Baltimore or 21201"
              onChange={(event) => {
                requestId.current++;
                setBusy(false);
                setSearched(false);
                setResults([]);
                setError("");
                setQuery(event.target.value);
              }}
            />
          </label>
          <button
            className="button primary"
            type="submit"
            disabled={busy || query.trim().length < 2}
          >
            <Search size={16} />
            {busy ? "Searching…" : "Search"}
          </button>
        </form>
        <div className="weather-location-results" aria-live="polite">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {searched && !results.length && !error && (
            <p className="weather-search-empty">
              No matching locations. Try a city name with its state or country.
            </p>
          )}
          {results.map((location) => (
            <button key={location.id} onClick={() => onSelect(location)}>
              <Location size={19} />
              <span>
                <strong>{location.name}</strong>
                <small>
                  {[location.region, location.country]
                    .filter(Boolean)
                    .join(", ")}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        <p className="weather-location-credit">
          Location search by{" "}
          <a
            href="https://open-meteo.com/en/docs/geocoding-api"
            target="_blank"
            rel="noreferrer"
          >
            Open-Meteo
          </a>{" "}
          ·{" "}
          <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
            GeoNames
          </a>
        </p>
      </div>
    </dialog>
  );
}

export function WeatherCard({
  cutoff,
  onEditCutoff,
}: {
  cutoff: number;
  onEditCutoff: () => void;
}) {
  const [location, setLocation] = useState(readWeatherLocation);
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(() =>
    readWeatherCache(location),
  );
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [selecting, setSelecting] = useState(false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    let active = true;
    setSnapshot(readWeatherCache(location));
    setLoading(true);
    setError("");
    if (!navigator.onLine) {
      setError("You’re offline.");
      setLoading(false);
      return;
    }
    loadForecast(location, refresh > 0)
      .then((data) => {
        if (active) {
          setSnapshot(data);
          setNow(Date.now());
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error &&
              !["TypeError", "TimeoutError"].includes(reason.name)
              ? reason.message
              : "Couldn’t update weather. Check your connection and try again.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [location, refresh, online]);
  useEffect(() => {
    const reconnect = () => {
      setOnline(true);
      setRefresh((value) => value + 1);
    };
    const disconnect = () => {
      setOnline(false);
      setNow(Date.now());
    };
    const timer = window.setInterval(
      () => setRefresh((value) => value + 1),
      WEATHER_REFRESH_MS,
    );
    const clock = window.setInterval(() => setNow(Date.now()), 60_000);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => {
      clearInterval(timer);
      clearInterval(clock);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
    };
  }, []);
  const data =
    snapshot && locationKey(snapshot.location) === locationKey(location)
      ? snapshot
      : null;
  const live = !!data && online && !error && isWeatherFresh(data, now);
  const hours = data ? timelineHours(data, now) : [];
  const outlook = precipitationOutlook(data ? upcomingHours(data, now) : []);
  const current = data?.current;
  const changeLocation = (next: WeatherLocation) => {
    saveWeatherLocation(next);
    setLocation(next);
    setSelecting(false);
    setRefresh(0);
  };
  return (
    <section className="weather-card weather-live" aria-label="Farm weather">
      <div className="card-top">
        <span className="eyebrow">
          {live ? "Current weather" : data ? "Saved forecast" : "Weather"}
        </span>
        <button
          className="icon-button weather-refresh"
          aria-label="Refresh weather"
          disabled={loading || !online}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <Refresh size={16} />
        </button>
      </div>
      <button
        className="weather-location"
        onClick={() => setSelecting(true)}
        aria-label={`Change weather location, currently ${location.name}, ${location.region}`}
      >
        <Location size={13} />
        <span>
          {location.name}
          {location.region ? `, ${location.region}` : ""}
        </span>
        <ChevronDown size={13} />
      </button>
      {data && current ? (
        <>
          <div className="weather-current">
            <strong>
              {Math.round(current.temperature)}
              <span>°</span>
            </strong>
            <div>
              {weatherCondition(current.code, current.isDay).label}
              <span>
                {current.windSpeed === null
                  ? "Wind unavailable"
                  : `${current.windDirection === null ? "Wind" : windDirection(current.windDirection)} ${Math.round(current.windSpeed)} mph`}{" "}
                · °F
              </span>
            </div>
            <WeatherSymbol
              code={current.code}
              isDay={current.isDay}
              size={28}
            />
          </div>
          <p className="weather-hours-label">
            {live ? "Next 12 hours" : "Saved hourly forecast"}
            <span>{formatWeatherDate(current.time)} · local time</span>
          </p>
          <div className="weather-timeline">
            {hours.map((hour) => (
              <div key={hour.time}>
                <span>
                  {formatWeatherHour(hour.time)}
                  {hour.time.slice(0, 10) !== current.time.slice(0, 10) && (
                    <small>Tomorrow</small>
                  )}
                </span>
                <WeatherSymbol code={hour.code} isDay={hour.isDay} />
                <strong>
                  {hour.temperature === null
                    ? "—"
                    : `${Math.round(hour.temperature)}°`}
                </strong>
                <small
                  className="weather-probability"
                  title="Chance of precipitation"
                >
                  {hour.probability === null
                    ? "—"
                    : `${Math.round(hour.probability)}%`}
                </small>
              </div>
            ))}
          </div>
          <div className="weather-alert">
            <CloudRain size={17} />
            <p>
              <strong>
                {outlook.first
                  ? `Precipitation possible ${outlook.first.time <= current.time ? "this hour" : `from ${formatWeatherHour(outlook.first.time)}`}${outlook.first.time.slice(0, 10) !== current.time.slice(0, 10) ? " tomorrow" : ""}.`
                  : outlook.complete
                    ? "Low precipitation chance."
                    : "Precipitation estimate incomplete."}
              </strong>
              <span>
                {outlook.peak === null
                  ? "Chance of rain or snow is unavailable. Check conditions before picking."
                  : !outlook.complete
                    ? `Available hours show up to ${Math.round(outlook.peak)}%. Some estimates are missing.`
                    : `Up to ${Math.round(outlook.peak)}% chance over ${live ? "the next" : "these"} 12 hours.${outlook.first ? " Review your harvest window." : ""}`}
              </span>
            </p>
          </div>
        </>
      ) : (
        <div className="weather-unavailable" role="status">
          {online ? <Cloud size={28} /> : <WifiOff size={28} />}
          <strong>
            {loading ? "Getting the forecast…" : "Weather unavailable"}
          </strong>
          <span>
            {loading
              ? `Checking conditions in ${location.name}.`
              : error || "Refresh to try again."}
          </span>
        </div>
      )}
      {data && !live && (
        <p className="weather-saved-notice" role="status">
          {!online
            ? "Offline. Showing the last saved forecast."
            : error
              ? "Couldn’t refresh. Showing saved weather."
              : loading
                ? "Updating the saved forecast…"
                : "This forecast is out of date. Refresh for current conditions."}
        </p>
      )}
      <button
        className="weather-cutoff"
        onClick={onEditCutoff}
        title="Review the farmer-set cutoff. Weather updates do not change an approved plan."
      >
        <span>
          Harvest cutoff{" "}
          <strong>{formatHour(cutoff).replace(":00", "")}</strong>
        </span>
        <span>
          Review <ChevronRight size={12} />
        </span>
      </button>
      <div className="weather-source-row">
        <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
          Open-Meteo <ArrowUpRight size={11} />
        </a>
        <span aria-live="polite">
          {loading
            ? "Updating…"
            : data
              ? `Updated ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: data.timezone }).format(data.fetchedAt)}`
              : "No current data"}
        </span>
      </div>
      {data && (
        <p className="weather-observed-at">
          Conditions as of {formatWeatherDate(data.current.time)},{" "}
          {formatWeatherHour(data.current.time)} ·{" "}
          {
            new Intl.DateTimeFormat("en-US", {
              timeZone: data.timezone,
              timeZoneName: "short",
            })
              .formatToParts(data.fetchedAt)
              .find((part) => part.type === "timeZoneName")?.value
          }
        </p>
      )}
      {selecting && (
        <LocationDialog
          onSelect={changeLocation}
          onClose={() => setSelecting(false)}
        />
      )}
    </section>
  );
}
