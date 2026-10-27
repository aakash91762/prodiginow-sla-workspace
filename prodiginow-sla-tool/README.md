# prodigiNow SLA Workspace

A lightweight, static browser app that turns a ticket-export CSV into an SLA-enriched CSV. It is designed for non-technical operations and IT users.

## Features

- Drag-and-drop CSV upload, with a 50 MB limit.
- Preserves all source columns and adds the four working-hour duration fields used by the existing SLA workflow.
- Region-independent SLA arithmetic: naïve CSV timestamps are interpreted as the business-recorded wall-clock values; browser/computer timezone does not affect calculation results.
- Timestamp handling defaults to **Preserve source timestamps**, which keeps the four timestamp columns exactly as provided. Optional UTC conversion supports any valid IANA timezone entered by the user (for example, `Asia/Jakarta`, `Asia/Kolkata`, `Europe/London`, or `America/New_York`).
- Calculates business-time seconds Monday–Friday within the configured daily working window (default 08:30–17:30). Weekends are excluded; public holidays and lunch breaks are not excluded.
- Reports row count, output column count, calculated metric values, missing inputs, and data-quality notes.
- No backend and no file uploads. CSV parsing, calculations, and download happen in the visitor's browser.
- Dependency-free CSV parser/serializer for quoted fields, commas, escaped quotes, and embedded newlines.

## Run locally

Open `index.html` in a modern browser. For testing, you can also serve this folder with any static HTTP server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

1. Create a new **public** repository named `prodiginow-sla-workspace` in your GitHub account.
2. Upload the contents of this project to the repository root, including `.github/workflows/pages.yml` and `.nojekyll`.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Open the **Actions** tab and confirm that **Deploy prodigiNow SLA Workspace to GitHub Pages** completes successfully. The workflow runs on pushes to `main` and can also be started manually.
6. GitHub Pages will publish the site at `https://<your-github-username>.github.io/prodiginow-sla-workspace/` once deployment finishes. GitHub Pages sites are publicly accessible, so never add CSV exports or ticket data to the repository. See the [official GitHub Pages guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Calculation notes

Timestamp output defaults to preserving the original timestamp strings. If UTC ISO 8601 conversion is selected, the user must provide an IANA source timezone; never infer it from the visitor's computer location.

The four output fields are:

- `resolution_duration_assign_in_seconds_working_hour`: `ASSIGNMENT_TIME` → `RESOLUTION_TIME`
- `resolution_duration_creation_in_seconds_working_hour`: `TICKET_CREATION_TIME` → `RESOLUTION_TIME`
- `first_response_duration_assign_in_seconds_working_hour`: `ASSIGNMENT_TIME` → `FIRST_RESPONSE_TIME`
- `first_response_duration_creation_in_seconds_working_hour`: `TICKET_CREATION_TIME` → `FIRST_RESPONSE_TIME`

Blank required timestamps produce blank duration results. Invalid timestamps and end-before-start pairs produce blanks and are reported in the quality notes rather than producing negative durations. Same-day and cross-day intervals are clipped to the working window, and Saturday/Sunday time is excluded.

This version intentionally uses a date-accurate interval calculation rather than repeating the original script's weekday-number comparison. The original implementation compares `.day()` (day of week) instead of full calendar dates in its same-day branch, which can misclassify timestamps on different dates that share a weekday. It also lets the runtime's local timezone affect ISO conversion; this app makes the intended source timezone explicit.

## Privacy and deployment

This is a static front end. Ticket CSV content is not sent to an application server. The site itself is hosted by GitHub Pages; visitors' browsers download the app code, then process the selected CSV locally. Before use with sensitive customer data, your organization should review whether its policies permit opening the hosted page and using a third-party static-hosting provider.
