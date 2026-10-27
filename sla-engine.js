/* prodigiNow SLA engine - dependency-free and usable in browsers and Node tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ProdigiSLA = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DURATION_FIELDS = [
    'resolution_duration_assign_in_seconds_working_hour',
    'resolution_duration_creation_in_seconds_working_hour',
    'first_response_duration_assign_in_seconds_working_hour',
    'first_response_duration_creation_in_seconds_working_hour'
  ];
  const TIMESTAMP_FIELDS = ['TICKET_CREATION_TIME', 'ASSIGNMENT_TIME', 'RESOLUTION_TIME', 'FIRST_RESPONSE_TIME'];
  const REQUIRED_HEADERS = ['TICKET_CREATION_TIME', 'ASSIGNMENT_TIME', 'RESOLUTION_TIME', 'FIRST_RESPONSE_TIME', 'GROUP_CODE'];

  function parseDateTime(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const s = String(value).trim();
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (!match) {
      // ISO timestamps with an explicit UTC marker or offset are accepted too.
      if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
        const instant = Date.parse(s);
        return Number.isFinite(instant) ? instant : null;
      }
      return null;
    }
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] || 0);
    const ms = Number((match[7] || '').padEnd(3, '0'));
    const valueMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
    const check = new Date(valueMs);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
    return valueMs;
  }

  // Computes elapsed seconds clipped to the configured weekday working window.
  // The source strings are treated as wall-clock local times for SLA arithmetic.
  function workingSeconds(startValue, endValue, startTime, endTime) {
    const start = parseDateTime(startValue), end = parseDateTime(endValue);
    if (start === null || end === null || end < start) return null;
    const startParts = parseClock(startTime || '08:30');
    const endParts = parseClock(endTime || '17:30');
    if (!startParts || !endParts || startParts.total >= endParts.total) throw new Error('Working-day end must be later than working-day start.');
    if (start === end) return 0;

    let total = 0;
    const cursor = new Date(start);
    cursor.setUTCHours(0, 0, 0, 0);
    const lastDate = new Date(end);
    lastDate.setUTCHours(0, 0, 0, 0);
    // Fail safely on malformed/extreme date ranges rather than locking the browser.
    const dayCount = Math.floor((lastDate - cursor) / 86400000) + 1;
    if (dayCount > 36600) return null;
    for (let i = 0; i < dayCount; i++) {
      const dayOfWeek = cursor.getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const dayStart = cursor.getTime() + startParts.total * 60000;
        const dayEnd = cursor.getTime() + endParts.total * 60000;
        const clippedStart = Math.max(start, dayStart);
        const clippedEnd = Math.min(end, dayEnd);
        if (clippedEnd > clippedStart) total += (clippedEnd - clippedStart) / 1000;
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return Math.max(0, Math.round(total));
  }

  function parseClock(value) {
    const m = String(value || '').match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return { total: h * 60 + min };
  }

  function toUtcIso(value, timeZone) {
    if (value === null || value === undefined || String(value).trim() === '') return { value: String(value ?? ''), valid: true };
    const s = String(value).trim();
    // Values that already specify a timezone are absolute instants; preserve that instant.
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(s)) {
      const instant = Date.parse(s);
      return Number.isFinite(instant) ? { value: new Date(instant).toISOString(), valid: true } : { value: s, valid: false };
    }
    const parsed = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (!parsed) return { value: s, valid: false };
    const y = +parsed[1], mo = +parsed[2], d = +parsed[3], h = +parsed[4], mi = +parsed[5], sec = +(parsed[6] || 0), milli = +((parsed[7] || '').padEnd(3, '0'));
    const localAsUtc = Date.UTC(y, mo - 1, d, h, mi, sec, milli);
    const check = new Date(localAsUtc);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59 || sec > 59) return { value: s, valid: false };
    try {
      const tz = timeZone || 'Asia/Jakarta';
      // Determine timezone offset at the represented wall time; repeat for zones with DST.
      let utcGuess = localAsUtc;
      for (let i = 0; i < 3; i++) {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }).formatToParts(new Date(utcGuess));
        const vals = {};
        for (const part of parts) if (part.type !== 'literal') vals[part.type] = Number(part.value);
        const representedUtc = Date.UTC(vals.year, vals.month - 1, vals.day, vals.hour, vals.minute, vals.second, milli);
        const offset = representedUtc - utcGuess;
        const nextGuess = localAsUtc - offset;
        if (nextGuess === utcGuess) break;
        utcGuess = nextGuess;
      }
      return { value: new Date(utcGuess).toISOString(), valid: true };
    } catch (err) {
      return { value: s, valid: false };
    }
  }

  function processRecords(headers, records, options) {
    options = options || {};
    const missingHeaders = REQUIRED_HEADERS.filter(h => !headers.includes(h));
    if (missingHeaders.length) throw new Error('This CSV is missing required columns: ' + missingHeaders.join(', ') + '. Please upload the ticket export with these columns.');
    const startTime = options.startTime || '08:30';
    const endTime = options.endTime || '17:30';
    const timestampMode = options.timestampMode || 'preserve';
    const timeZone = String(options.timeZone || '').trim();
    if (timestampMode !== 'preserve' && timestampMode !== 'utc') throw new Error('Choose a valid timestamp output mode.');
    if (timestampMode === 'utc') {
      if (!timeZone) throw new Error('Enter the source timezone before converting timestamps to UTC.');
      try { new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0)); }
      catch (err) { throw new Error('Timezone not recognized. Enter a valid IANA timezone, such as Asia/Jakarta or Europe/London.'); }
    }
    const startParts = parseClock(startTime), endParts = parseClock(endTime);
    if (!startParts || !endParts || startParts.total >= endParts.total) throw new Error('Please choose valid working hours. The end time must be later than the start time.');

    const outHeaders = headers.slice();
    for (const field of DURATION_FIELDS) if (!outHeaders.includes(field)) outHeaders.push(field);
    const stats = { rows: records.length, columns: outHeaders.length, calculatedValues: 0, missingInputs: 0, invalidPairs: 0, invalidTimestamps: 0, convertedTimestamps: 0, csRows: 0, nonCsRows: 0 };
    const outRecords = records.map(sourceRecord => {
      const row = {};
      for (const h of headers) row[h] = sourceRecord[h] === undefined || sourceRecord[h] === null ? '' : String(sourceRecord[h]);
      if (String(row.GROUP_CODE || '').trim().toLowerCase() === 'cs') stats.csRows++; else stats.nonCsRows++;

      const metrics = [
        ['RESOLUTION_TIME', 'ASSIGNMENT_TIME', DURATION_FIELDS[0]],
        ['RESOLUTION_TIME', 'TICKET_CREATION_TIME', DURATION_FIELDS[1]],
        ['FIRST_RESPONSE_TIME', 'ASSIGNMENT_TIME', DURATION_FIELDS[2]],
        ['FIRST_RESPONSE_TIME', 'TICKET_CREATION_TIME', DURATION_FIELDS[3]]
      ];
      for (const [endField, startField, targetField] of metrics) {
        const startRaw = row[startField] ?? '', endRaw = row[endField] ?? '';
        if (!String(startRaw).trim() || !String(endRaw).trim()) {
          row[targetField] = '';
          stats.missingInputs++;
          continue;
        }
        const startParsed = parseDateTime(startRaw), endParsed = parseDateTime(endRaw);
        if (startParsed === null || endParsed === null) {
          row[targetField] = '';
          stats.invalidPairs++;
          continue;
        }
        if (endParsed < startParsed) {
          row[targetField] = '';
          stats.invalidPairs++;
          continue;
        }
        row[targetField] = String(workingSeconds(startRaw, endRaw, startTime, endTime));
        stats.calculatedValues++;
      }

      if (timestampMode === 'utc') {
        for (const field of TIMESTAMP_FIELDS) {
          if (!String(row[field] ?? '').trim()) continue;
          const converted = toUtcIso(row[field], timeZone);
          if (converted.valid) {
            row[field] = converted.value;
            stats.convertedTimestamps++;
          } else {
            stats.invalidTimestamps++;
          }
        }
      }
      // Keep output column order identical to the source, followed by any newly added metrics.
      const ordered = {};
      for (const h of outHeaders) ordered[h] = row[h] ?? '';
      return ordered;
    });
    stats.timestampMode = timestampMode;
    return { headers: outHeaders, records: outRecords, stats };
  }

  // Robust RFC-4180-style CSV parser with escaped quotes, commas, CRLF and quoted newlines.
  function parseCSV(text) {
    if (typeof text !== 'string') throw new Error('The file could not be read as text.');
    const input = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (quoted) {
        if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"' && field.length === 0) quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && input[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (!(row.length === 1 && row[0] === '' && rows.length === 0)) rows.push(row);
        row = [];
      } else field += c;
    }
    if (quoted) throw new Error('The CSV appears to contain an unclosed quoted field. Please check the file and try again.');
    if (field.length || row.length) { row.push(field); rows.push(row); }
    while (rows.length && rows[rows.length - 1].every(cell => cell === '')) rows.pop();
    if (!rows.length) throw new Error('The CSV file is empty.');
    const headers = rows.shift().map(h => h.trim());
    if (headers.some(h => !h)) throw new Error('One or more column headers are blank. Please check the first row of your CSV.');
    const duplicateHeaders = headers.filter((h, i) => headers.indexOf(h) !== i);
    if (duplicateHeaders.length) throw new Error('Duplicate column headers detected: ' + [...new Set(duplicateHeaders)].join(', '));
    const records = [];
    let malformedRows = 0;
    for (const cells of rows) {
      if (cells.every(cell => cell === '')) continue;
      if (cells.length > headers.length) malformedRows++;
      const record = {};
      headers.forEach((h, i) => { record[h] = cells[i] === undefined ? '' : cells[i]; });
      records.push(record);
    }
    return { headers, records, malformedRows };
  }

  function serializeCSV(headers, records) {
    const quote = value => {
      const s = value === null || value === undefined ? '' : String(value);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [headers, ...records.map(r => headers.map(h => r[h] ?? ''))].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n';
  }

  return { DURATION_FIELDS, TIMESTAMP_FIELDS, REQUIRED_HEADERS, parseDateTime, workingSeconds, toUtcIso, processRecords, parseCSV, serializeCSV };
});
