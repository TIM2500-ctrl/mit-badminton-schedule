let scheduleMeta = {
  source: "https://shen.nz/badminton/",
  generatedAt: "2026-05-18T00:00:00-04:00",
  live: false,
};

let scheduleData = [];
const appConfig = window.scheduleConfig || {};

const fallbackScheduleData = [
  {
    date: "2026-04-13",
    sessions: [
      { time: "6:00 AM - 11:00 AM", court: "du Pont Court 2", type: "shared" },
      { time: "12:30 PM - 3:00 PM", court: "Rockwell North Court", type: "dedicated" },
      { time: "12:30 PM - 2:30 PM", court: "du Pont Court 1", type: "shared" },
      { time: "7:30 PM - 11:00 PM", court: "du Pont Court 2", type: "shared" },
    ],
  },
  {
    date: "2026-04-14",
    sessions: [
      { time: "6:00 AM - 3:00 PM", court: "du Pont Court 2", type: "shared" },
      { time: "6:00 AM - 3:30 PM", court: "du Pont Court 1", type: "dedicated" },
    ],
  },
  {
    date: "2026-04-15",
    sessions: [
      { time: "6:00 AM - 4:30 PM", court: "du Pont Court 1", type: "shared" },
      { time: "6:00 AM - 8:30 PM", court: "du Pont Court 2", type: "dedicated" },
      { time: "12:30 PM - 3:30 PM", court: "Rockwell North Court", type: "dedicated" },
    ],
  },
  {
    date: "2026-04-16",
    sessions: [
      { time: "7:00 AM - 12:30 PM", court: "Rockwell North Court", type: "dedicated" },
      { time: "7:00 AM - 4:30 PM", court: "du Pont Court 2", type: "shared" },
      { time: "8:30 PM - 11:00 PM", court: "du Pont Court 1", type: "dedicated" },
      { time: "9:30 PM - 11:00 PM", court: "du Pont Court 2", type: "shared" },
    ],
  },
  {
    date: "2026-04-17",
    sessions: [
      { time: "6:00 AM - 7:30 PM", court: "du Pont Court 2", type: "shared" },
      { time: "7:30 PM - 9:00 PM", court: "Rockwell South Court", type: "dedicated" },
      { time: "10:00 PM - 11:00 PM", court: "Rockwell North Court", type: "dedicated" },
    ],
  },
  {
    date: "2026-04-18",
    sessions: [
      { time: "12:30 PM - 2:30 PM", court: "du Pont Court 1", type: "shared" },
      { time: "7:00 PM - 9:00 PM", court: "Rockwell South Court", type: "dedicated" },
    ],
  },
  {
    date: "2026-04-19",
    sessions: [
      { time: "9:00 AM - 9:00 PM", court: "du Pont Court 1", type: "shared" },
    ],
  },
  {
    date: "2026-04-20",
    sessions: [
      { time: "5:00 PM - 9:00 PM", court: "du Pont Court 2", type: "shared" },
    ],
  },
];

const state = {
  type: "all",
  venue: "all",
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "America/New_York",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

const lastUpdateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
  timeZone: "America/New_York",
});

const scheduleList = document.querySelector("#scheduleList");
const emptyState = document.querySelector("#emptyState");
const venueFilter = document.querySelector("#venueFilter");
const filters = document.querySelectorAll(".filter");
const notice = document.querySelector("#facilitiesNotice");
const dismissNotice = document.querySelector("#dismissNotice");
const noticeDismissedUntilKey = "badmintonNoticeDismissedUntil";
const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
const typeLabels = {
  dedicated: "Dedicated badminton court",
  shared: "Shared with other sports",
  ...(appConfig.typeLabels || {}),
};
const typeBadges = {
  dedicated: "D",
  shared: "S",
  ...(appConfig.typeBadges || {}),
};
const primaryStatType = appConfig.primaryStatType || "dedicated";
const secondaryStatType = appConfig.secondaryStatType || "shared";

function getCourtKindLabel(type) {
  return typeLabels[type] || type;
}

function getMapUrl(court) {
  const query = appConfig.mapQuery || `MIT ${court}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function getCourtClass(court) {
  return court === "Rockwell North Court" ? "court-name court-name-rockwell-north" : "court-name";
}

function getTodayKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getFilteredSchedule() {
  const todayKey = getTodayKey();

  return scheduleData
    .map((day) => {
      const sessions = day.sessions.filter((session) => {
        const typeMatches =
          state.type === "all" ||
          session.type === state.type ||
          (state.type === "today" && day.date === todayKey);
        const venueMatches = state.venue === "all" || session.court.includes(state.venue);

        return typeMatches && venueMatches;
      });

      return { ...day, sessions };
    })
    .filter((day) => day.sessions.length > 0);
}

function renderStats() {
  const sessions = scheduleData.flatMap((day) => day.sessions);
  const primary = sessions.filter((session) => session.type === primaryStatType).length;
  const secondary = sessions.filter((session) => session.type === secondaryStatType).length;
  const lastUpdated = new Date(scheduleMeta.generatedAt);
  const daysOld = Math.floor((Date.now() - lastUpdated.getTime()) / 86400000);
  const newestDate = scheduleData.reduce((latest, day) => (day.date > latest ? day.date : latest), "");
  const todayKey = getTodayKey();
  const scheduleIsPast = newestDate && newestDate < todayKey;

  let status = scheduleMeta.live && daysOld <= 1 ? "Auto-updated" : `Needs confirmation, ${daysOld} days old`;

  if (sessions.length === 0) {
    status = "No live schedule data";
  }

  if (scheduleIsPast) {
    status = "Source data is stale";
  }

  document.querySelector("#freshnessLabel").textContent = status;
  document.querySelector("#lastUpdated").textContent = lastUpdateFormatter.format(lastUpdated);
  document.querySelector("#sessionCount").textContent = sessions.length;
  document.querySelector("#dedicatedCount").textContent = primary;
  document.querySelector("#sharedCount").textContent = secondary;
  document.querySelector("#generatedAt").textContent =
    `Schedule data generated ${shortDateFormatter.format(new Date(scheduleMeta.generatedAt))} from ${scheduleMeta.source}.`;
}

function renderVenueOptions() {
  venueFilter.replaceChildren();
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All venues";
  venueFilter.append(allOption);

  const venues = [...new Set(scheduleData.flatMap((day) => day.sessions.map((session) => session.court)))];

  venues.sort().forEach((venue) => {
    const option = document.createElement("option");
    option.value = venue;
    option.textContent = venue;
    venueFilter.append(option);
  });
}

function renderSchedule() {
  const filteredSchedule = getFilteredSchedule();
  scheduleList.replaceChildren();
  emptyState.hidden = filteredSchedule.length > 0;

  filteredSchedule.forEach((day) => {
    const date = new Date(`${day.date}T12:00:00-04:00`);
    const article = document.createElement("article");
    article.className = "day";

    const heading = document.createElement("div");
    heading.className = "day-heading";
    heading.innerHTML = `
      <time datetime="${day.date}">${shortDateFormatter.format(date)}</time>
      <h3>${dateFormatter.format(date).replace(/, \d{4}/, "")}</h3>
    `;

    const list = document.createElement("ul");
    list.className = "session-list";

    day.sessions.forEach((session) => {
      const item = document.createElement("li");
      item.className = "session";
      item.innerHTML = `
        <span class="session-time">${session.time}</span>
        <span class="session-court">
          <strong class="${getCourtClass(session.court)}">${session.court}</strong>
          <span>${getCourtKindLabel(session.type)}</span>
        </span>
        <span class="badge ${session.type}" title="${getCourtKindLabel(session.type)}">
          ${typeBadges[session.type] || session.type.slice(0, 1).toUpperCase()}
        </span>
        <a class="map-link" href="${getMapUrl(session.court)}" target="_blank" rel="noreferrer">Map</a>
      `;
      list.append(item);
    });

    article.append(heading, list);
    scheduleList.append(article);
  });
}

function setupFilters() {
  filters.forEach((button) => {
    button.addEventListener("click", () => {
      filters.forEach((filter) => filter.classList.remove("active"));
      button.classList.add("active");
      state.type = button.dataset.filter;
      renderSchedule();
    });
  });

  venueFilter.addEventListener("change", () => {
    state.venue = venueFilter.value;
    renderSchedule();
  });
}

function setupNotice() {
  if (!notice || !dismissNotice) {
    return;
  }

  try {
    const dismissedUntil = Number(localStorage.getItem(noticeDismissedUntilKey));

    if (dismissedUntil > Date.now()) {
      notice.hidden = true;
      return;
    }

    localStorage.removeItem(noticeDismissedUntilKey);
  } catch (error) {
    console.warn(error);
  }

  dismissNotice.addEventListener("click", () => {
    try {
      localStorage.setItem(noticeDismissedUntilKey, String(Date.now() + oneWeekMs));
    } catch (error) {
      console.warn(error);
    }

    notice.hidden = true;
  });
}

async function loadSchedule() {
  try {
    const scheduleUrl = appConfig.scheduleUrl || "schedule.json";
    const separator = scheduleUrl.includes("?") ? "&" : "?";
    const response = await fetch(`${scheduleUrl}${separator}updated=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Schedule request failed: ${response.status}`);
    }

    const payload = await response.json();
    scheduleMeta = {
      source: payload.source || "schedule.json",
      generatedAt: payload.generatedAt || new Date().toISOString(),
      live: !payload.error,
      error: payload.error || "",
    };
    scheduleData = payload.schedule || [];
  } catch (error) {
    console.warn(error);
    scheduleMeta = {
      source: "built-in fallback data",
      generatedAt: "2026-04-13T07:10:05-04:00",
      live: false,
    };
    scheduleData = appConfig.fallbackScheduleData || fallbackScheduleData;
  }
}

async function init() {
  setupFilters();
  setupNotice();
  await loadSchedule();
  renderStats();
  renderVenueOptions();
  renderSchedule();
}

init();
