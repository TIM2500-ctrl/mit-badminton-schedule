import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = join(__dirname, "..");
const outputPath = join(rootDir, "swim-schedule.json");

const poolSources = [
  {
    name: "Z Center",
    url: "https://www.mitrecsports.com/pool-schedule-z/",
    pools: {
      "long-pool": "Z Center Long Course",
      "teaching-pool": "Z Center Teaching Pool",
    },
  },
  {
    name: "Alumni/Wang Center",
    url: "https://www.mitrecsports.com/pool-schedule-aw/",
    pools: {
      "alumni-teaching-pool": "Alumni Teaching Pool",
      "alumni-pool-gallery": "Alumni Lap Pool",
    },
  },
];

const dayIds = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function bostonDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function addDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function dateKeyFromParts(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function decodeHtml(value) {
  return value
    .replace(/&mdash;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseAmPm(value) {
  return value.replace(/\b(am|pm)\b/g, (match) => match.toUpperCase());
}

function normalizeTime(value) {
  return titleCaseAmPm(decodeHtml(value).replace(/\s*-\s*/, " - "));
}

function timeToMinutes(value) {
  const match = value.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3].toUpperCase();

  if (period === "AM" && hours === 12) {
    hours = 0;
  } else if (period === "PM" && hours !== 12) {
    hours += 12;
  }

  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const hours24 = Math.floor(value / 60);
  const minutes = value % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;

  return minutes === 0 ? `${hours12} ${period}` : `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function parseTimeRange(value) {
  const [startText, endText] = value.split(" - ");
  const start = timeToMinutes(startText);
  const end = timeToMinutes(endText);

  if (start === null || end === null) {
    return null;
  }

  return { start, end };
}

function formatTimeRange(start, end) {
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

function parseWeekStart(html) {
  const match = html.match(/<!--\s*(\d{4}-\d{2}-\d{2})\s+\d{4}-\d{2}-\d{2}\s*-->/);

  if (!match) {
    throw new Error("Could not find pool schedule week dates.");
  }

  return match[1];
}

function dateForDay(weekStart, dayId) {
  const index = dayIds.indexOf(dayId);
  const start = new Date(`${weekStart}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() + index);

  return start.toISOString().slice(0, 10);
}

function parseAttributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/\s([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, decodeHtml(value)]),
  );
}

function parsePoolSchedule(html, source) {
  const weekStart = parseWeekStart(html);
  const rows = [];
  const tableMatches = [...html.matchAll(/<div class="pool-schedule-table[\s\S]*?" id="(monday|tuesday|wednesday|thursday|friday|saturday|sunday)">/gi)];

  for (let tableIndex = 0; tableIndex < tableMatches.length; tableIndex += 1) {
    const dayId = tableMatches[tableIndex][1].toLowerCase();
    const start = tableMatches[tableIndex].index || 0;
    const end = tableMatches[tableIndex + 1]?.index || html.indexOf("<section id=\"72-hour\"", start);

    const date = dateForDay(weekStart, dayId);
    const dayHtml = html.slice(start, end > start ? end : undefined);
    const laneMatches = [...dayHtml.matchAll(/<div class="lane-schedule" data-pool="([^"]+)">/gi)];

    for (let laneIndex = 0; laneIndex < laneMatches.length; laneIndex += 1) {
      const poolId = laneMatches[laneIndex][1];
      const laneStart = laneMatches[laneIndex].index || 0;
      const laneEnd = laneMatches[laneIndex + 1]?.index || dayHtml.length;
      const laneHtml = dayHtml.slice(laneStart, laneEnd);
      const poolName = source.pools[poolId] || poolId;
      const itemPattern = /<li\b([^>]*data-tool-title="[^"]+"[^>]*)>/gi;
      let itemMatch;

      while ((itemMatch = itemPattern.exec(laneHtml))) {
        const attrs = parseAttributes(itemMatch[1]);
        const title = attrs["data-tool-title"];

        if (!/^(Open Rec Swim|Women's Only Rec Swim)$/i.test(title)) {
          continue;
        }

        rows.push({
          date,
          time: normalizeTime(attrs["data-tool-time"]),
          court: poolName,
          type: /women/i.test(title) ? "women" : "open",
          sourceText: `${source.name} ${poolName} ${title}`,
        });
      }
    }
  }

  return rows;
}

function groupRows(rows) {
  const intervalsByKey = new Map();

  rows.forEach((row) => {
    const range = parseTimeRange(row.time);

    if (!range) {
      return;
    }

    const key = `${row.date}|${row.court}|${row.type}`;

    if (!intervalsByKey.has(key)) {
      intervalsByKey.set(key, { row, intervals: [] });
    }

    intervalsByKey.get(key).intervals.push(range);
  });

  const mergedRows = [];

  intervalsByKey.forEach(({ row, intervals }) => {
    const sorted = intervals.sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];

    sorted.forEach((interval) => {
      const previous = merged.at(-1);

      if (previous && interval.start <= previous.end) {
        previous.end = Math.max(previous.end, interval.end);
      } else {
        merged.push({ ...interval });
      }
    });

    merged.forEach((interval) => {
      mergedRows.push({
        ...row,
        time: formatTimeRange(interval.start, interval.end),
      });
    });
  });

  const rowsByDate = new Map();

  mergedRows
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date.localeCompare(b.date);
      }

      const aStart = parseTimeRange(a.time)?.start || 0;
      const bStart = parseTimeRange(b.time)?.start || 0;

      return aStart - bStart || a.court.localeCompare(b.court);
    })
    .forEach((row) => {
      if (!rowsByDate.has(row.date)) {
        rowsByDate.set(row.date, []);
      }

      rowsByDate.get(row.date).push({
        time: row.time,
        court: row.court,
        type: row.type,
        sourceText: row.sourceText,
      });
    });

  return [...rowsByDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sessions]) => ({
      date,
      sessions,
    }));
}

function filterScheduleWindow(schedule) {
  const start = dateKeyFromParts(bostonDateParts());
  const end = dateKeyFromParts(addDays(bostonDateParts(), 7));

  return schedule.filter((day) => day.date >= start && day.date <= end);
}

async function fetchSource(source, week) {
  const url = `${source.url}?week=${week}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "mit-swim-schedule/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return {
    url,
    html: await response.text(),
  };
}

async function main() {
  const rows = [];
  const sourceUrls = [];

  for (const source of poolSources) {
    for (const week of [1, 2]) {
      const { url, html } = await fetchSource(source, week);
      sourceUrls.push(url);
      rows.push(...parsePoolSchedule(html, source));
    }
  }

  const schedule = filterScheduleWindow(groupRows(rows));

  if (schedule.length === 0) {
    throw new Error("No MIT swim rows found in the schedule source.");
  }

  const payload = {
    source: sourceUrls.join(" | "),
    generatedAt: new Date().toISOString(),
    schedule,
  };

  await mkdir(rootDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

  const sessionCount = schedule.reduce((sum, day) => sum + day.sessions.length, 0);
  console.log(`Wrote ${sessionCount} swim sessions to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
