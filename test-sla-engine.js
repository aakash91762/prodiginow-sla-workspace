const assert = require('node:assert/strict');
const fs = require('node:fs');
const SLA = require('./sla-engine.js');

// Same-day work, clipped before/after the working window, weekends, and reverse intervals.
assert.equal(SLA.workingSeconds('2026-10-05 09:00:00', '2026-10-05 10:30:00', '08:30', '17:30'), 5400);
assert.equal(SLA.workingSeconds('2026-10-05 07:00:00', '2026-10-05 09:00:00', '08:30', '17:30'), 1800);
assert.equal(SLA.workingSeconds('2026-10-05 16:30:00', '2026-10-05 19:00:00', '08:30', '17:30'), 3600);
assert.equal(SLA.workingSeconds('2026-10-09 16:30:00', '2026-10-12 09:00:00', '08:30', '17:30'), 5400);
assert.equal(SLA.workingSeconds('2026-10-10 09:00:00', '2026-10-11 12:00:00', '08:30', '17:30'), 0);
assert.equal(SLA.workingSeconds('2026-10-06 10:00:00', '2026-10-05 10:00:00', '08:30', '17:30'), null);
// Local clock to UTC conversion must be timezone-explicit.
assert.equal(SLA.toUtcIso('2026-10-01 13:13:26', 'Asia/Jakarta').value, '2026-10-01T06:13:26.000Z');
assert.equal(SLA.toUtcIso('2026-10-01 13:13:26', 'UTC').value, '2026-10-01T13:13:26.000Z');
// CSV quoted values, escaped quotes, multiline fields, parse/serialize round-trip.
const csv = 'A,B,C\r\n"hello, world","say ""hi""",line\r\n"multi\nline",x,y\r\n';
const parsedSmall = SLA.parseCSV(csv);
assert.equal(parsedSmall.records.length, 2);
assert.equal(parsedSmall.records[0].A, 'hello, world');
assert.equal(parsedSmall.records[0].B, 'say "hi"');
assert.equal(parsedSmall.records[1].A, 'multi\nline');
assert.equal(SLA.parseCSV(SLA.serializeCSV(parsedSmall.headers, parsedSmall.records)).records[1].A, 'multi\nline');


// Region independence: naïve local wall-clock timestamps calculate identically and stay unchanged by default.
const sampleHeaders = ['TICKET_CREATION_TIME', 'ASSIGNMENT_TIME', 'RESOLUTION_TIME', 'FIRST_RESPONSE_TIME', 'GROUP_CODE', 'TICKET_ID'];
const sampleRows = [{
  TICKET_CREATION_TIME: '2026-09-30 22:16:47',
  ASSIGNMENT_TIME: '2026-10-01 13:13:26',
  RESOLUTION_TIME: '2026-10-01 15:02:32',
  FIRST_RESPONSE_TIME: '2026-10-01 15:02:18',
  GROUP_CODE: 'cs', TICKET_ID: '161545'
}];
const preserved = SLA.processRecords(sampleHeaders, sampleRows, {startTime:'08:30', endTime:'17:30'});
assert.equal(preserved.records[0].ASSIGNMENT_TIME, '2026-10-01 13:13:26');
assert.equal(preserved.records[0].resolution_duration_assign_in_seconds_working_hour, '6546');
assert.equal(preserved.records[0].first_response_duration_assign_in_seconds_working_hour, '6532');
assert.equal(preserved.stats.timestampMode, 'preserve');
const utcJakarta = SLA.processRecords(sampleHeaders, sampleRows, {startTime:'08:30', endTime:'17:30', timestampMode:'utc', timeZone:'Asia/Jakarta'});
assert.equal(utcJakarta.records[0].ASSIGNMENT_TIME, '2026-10-01T06:13:26.000Z');
const utcLondon = SLA.processRecords(sampleHeaders, sampleRows, {startTime:'08:30', endTime:'17:30', timestampMode:'utc', timeZone:'Europe/London'});
assert.equal(utcLondon.records[0].ASSIGNMENT_TIME, '2026-10-01T12:13:26.000Z');
assert.equal(utcLondon.records[0].resolution_duration_assign_in_seconds_working_hour, '6546');
assert.throws(() => SLA.processRecords(sampleHeaders, sampleRows, {timestampMode:'utc', timeZone:'Not/A_Timezone'}), /Timezone not recognized/);

// Optional full-file test, e.g. PRODIGI_SAMPLE_CSV="/path/to/export.csv" node test-sla-engine.js
const samplePath = process.env.PRODIGI_SAMPLE_CSV;
if (samplePath && fs.existsSync(samplePath)) {
  const parsed = SLA.parseCSV(fs.readFileSync(samplePath, 'utf8'));
  const result = SLA.processRecords(parsed.headers, parsed.records, {startTime:'08:30', endTime:'17:30', timeZone:'Asia/Jakarta'});
  const roundTrip = SLA.parseCSV(SLA.serializeCSV(result.headers, result.records));
  assert.equal(result.headers.length, parsed.headers.length + 4);
  assert.equal(result.records.length, parsed.records.length);
  assert.equal(roundTrip.headers.length, parsed.headers.length + 4);
  assert.equal(roundTrip.records.length, parsed.records.length);
  console.log(JSON.stringify({rows:result.stats.rows, inputColumns:parsed.headers.length, outputColumns:result.stats.columns, stats:result.stats}, null, 2));
}
console.log('All SLA engine tests passed.');
