(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const dropzone = $('dropzone'), fileInput = $('file-input'), browseBtn = $('browse-btn');
  const processBtn = $('process-btn'), processBtnText = $('process-btn-text'), errorBox = $('error-message');
  let selectedFile = null, processedCSV = null, outputFilename = '';

  function showError(message) { errorBox.textContent = message; errorBox.classList.remove('hidden'); }
  function updateTimestampMode() {
    const convertUtc = $('timestamp-mode').value === 'utc';
    $('timezone-field').classList.toggle('hidden', !convertUtc);
    $('timezone').required = convertUtc;
  }
  function clearError() { errorBox.textContent = ''; errorBox.classList.add('hidden'); }
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  function updateSelectedFile(file) {
    clearError();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      showError('Please choose a CSV file (.csv).'); return;
    }
    if (file.size > 50 * 1024 * 1024) {
      showError('This file is larger than 50 MB. Please split it into smaller CSV files and try again.'); return;
    }
    if (file.size === 0) { showError('This file is empty. Please select a CSV with ticket data.'); return; }
    selectedFile = file; processedCSV = null;
    $('file-name').textContent = file.name;
    $('file-meta').textContent = `${formatBytes(file.size)} · CSV file selected`;
    $('selected-file').classList.remove('hidden');
    dropzone.classList.add('has-file');
    processBtn.disabled = false; processBtnText.textContent = 'Process CSV file';
    $('results-section').classList.add('hidden');
  }
  function clearSelectedFile() {
    selectedFile = null; processedCSV = null; fileInput.value = '';
    $('selected-file').classList.add('hidden'); dropzone.classList.remove('has-file');
    processBtn.disabled = true; processBtnText.textContent = 'Process CSV file'; clearError();
  }
  function formatInteger(n) { return new Intl.NumberFormat('en-US').format(n); }
  function getBaseName(name) { return name.replace(/\.csv$/i, '').replace(/[\s]+$/g, ''); }

  async function processSelectedFile() {
    if (!selectedFile) { showError('Select a CSV file before processing.'); return; }
    clearError();
    const startTime = $('start-time').value, endTime = $('end-time').value;
    const timestampMode = $('timestamp-mode').value;
    const timeZone = $('timezone').value.trim();
    if (!startTime || !endTime || startTime >= endTime) { showError('Please choose valid working hours. The end time must be later than the start time.'); return; }
    if (timestampMode === 'utc' && !timeZone) { showError('Enter the source timezone before converting timestamps to UTC.'); return; }
    processBtn.disabled = true; processBtnText.textContent = 'Processing…';
    try {
      // Let the browser paint the loading state before parsing a large file.
      await new Promise(resolve => setTimeout(resolve, 30));
      const rawText = await selectedFile.text();
      const parsed = ProdigiSLA.parseCSV(rawText);
      const result = ProdigiSLA.processRecords(parsed.headers, parsed.records, { startTime, endTime, timestampMode, timeZone });
      processedCSV = ProdigiSLA.serializeCSV(result.headers, result.records);
      outputFilename = getBaseName(selectedFile.name) + '_sla_processed.csv';
      $('stat-rows').textContent = formatInteger(result.stats.rows);
      $('stat-columns').textContent = formatInteger(result.stats.columns);
      $('stat-calculated').textContent = formatInteger(result.stats.calculatedValues);
      $('stat-missing').textContent = formatInteger(result.stats.missingInputs);
      $('output-name').textContent = outputFilename;
      const timestampLabel = timestampMode === 'utc' ? `timestamps converted from ${timeZone} to UTC` : 'source timestamps preserved';
      $('output-meta').textContent = `${formatBytes(new Blob([processedCSV]).size)} · ${formatInteger(result.stats.rows)} tickets · ${timestampLabel} · Ready to download`;
      const issues = [];
      if (parsed.malformedRows) issues.push(`${formatInteger(parsed.malformedRows)} rows had more cells than the header and were trimmed to the expected columns.`);
      if (result.stats.invalidPairs) issues.push(`${formatInteger(result.stats.invalidPairs)} metric calculations were left blank because one or more timestamps could not be parsed or the end time preceded the start time.`);
      if (result.stats.invalidTimestamps) issues.push(`${formatInteger(result.stats.invalidTimestamps)} non-empty timestamp values could not be converted and were preserved as originally provided.`);
      if (result.stats.missingInputs) issues.push(`${formatInteger(result.stats.missingInputs)} metric values were left blank because a required start or end timestamp was missing.`);
      $('quality-copy').textContent = issues.join(' ');
      $('quality-note').classList.toggle('hidden', issues.length === 0);
      $('results-section').classList.remove('hidden');
      $('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      processBtnText.textContent = 'Process CSV file';
    } catch (err) {
      showError(err && err.message ? err.message : 'Something went wrong while processing this file. Please check the file format and try again.');
    } finally {
      processBtn.disabled = !selectedFile; if (processBtnText.textContent === 'Processing…') processBtnText.textContent = 'Process CSV file';
    }
  }
  function downloadCSV() {
    if (!processedCSV) return;
    const blob = new Blob(['\uFEFF', processedCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = outputFilename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }
  function reset() {
    clearSelectedFile(); $('results-section').classList.add('hidden');
    $('file-name').textContent = ''; $('file-meta').textContent = '';
    $('workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('timestamp-mode').addEventListener('change', updateTimestampMode);
  updateTimestampMode();
  browseBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  dropzone.addEventListener('click', e => { if (e.target !== browseBtn) fileInput.click(); });
  dropzone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
  fileInput.addEventListener('change', e => updateSelectedFile(e.target.files && e.target.files[0]));
  $('remove-file').addEventListener('click', clearSelectedFile);
  processBtn.addEventListener('click', processSelectedFile);
  $('download-btn').addEventListener('click', downloadCSV);
  $('reset-btn').addEventListener('click', reset);
  for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('drag-over'); });
  for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, e => { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('drag-over'); });
  dropzone.addEventListener('drop', e => updateSelectedFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
})();
