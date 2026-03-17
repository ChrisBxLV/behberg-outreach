# Behberg Outreach Platform — TODO

## Phase 1: Foundation
- [x] Design system: dark elegant theme, color palette, typography
- [x] Global DashboardLayout with sidebar navigation
- [x] Database schema: contacts, campaigns, sequences, email_logs, tracking_events, sheets_sync, import_batches
- [x] Drizzle migrations applied

## Phase 2: Contact Pipeline
- [x] CSV import from LinkedIn/Apollo exports (parse & normalize fields)
- [x] Contact enrichment status tracking (email confidence, validation state)
- [x] Contact list with filtering, sorting, search, and bulk actions
- [x] Pipeline stage management (New, Enriched, In Sequence, Replied, Closed)

## Phase 3: Integrations
- [x] Google Sheets OAuth 2.0 authentication setup
- [x] Bidirectional Google Sheets sync (push/pull pipeline data)
- [x] Outlook SMTP integration with App Password (@behberg.com)
- [x] Email open tracking via pixel (1x1 transparent GIF endpoint)

## Phase 4: Email Sequences
- [x] Sequence builder UI (multi-step: initial, follow-ups, last notice)
- [x] Configurable delays between steps (days/hours)
- [x] Conditional logic: opened-but-no-reply triggers different follow-up
- [x] Email scheduling engine (background job runner, every 5 min)
- [x] Campaign launch: assign contacts to sequences

## Phase 5: Intelligence
- [x] LLM email personalization using contact's company, role, industry
- [x] Campaign milestone notifications (100 sent, high reply rate, bounces)

## Phase 6: Campaign Monitoring
- [x] Campaign dashboard: sent/opened/replied metrics per contact
- [x] Per-contact engagement status in campaign contacts tab
- [x] Bounce detection and handling
- [x] Reply detection (manual mark via UI)

## Phase 7: Polish & Delivery
- [x] Vitest unit tests for core backend logic (22 tests, all passing)
- [x] Input validation via Zod on all tRPC procedures
- [x] Setup guide and documentation
- [x] Final checkpoint and delivery

## Future Enhancements
- [ ] Contact detail page with full email history timeline
- [ ] Unsubscribe link handling in email footer
- [ ] Email preview before sending
- [ ] A/B testing for subject lines
- [ ] Import batch history view
- [ ] Reply detection via IMAP polling (automatic)
